import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { readKeyRow, writeKey } from '../_shared/legacyStore.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertCloudKey(supabase: any, key: string, value: unknown) {
  await writeKey(supabase as any, key, value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ verified: false, fallbackAllowed: true, reason: 'missing_supabase_env' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const scope =
      body?.scope === 'client_order'
        ? 'client_order'
        : body?.scope === 'catalog_order'
        ? 'catalog_order'
        : 'tenant_subscription';
    const paymentId = String(body?.paymentId || '').trim();
    const tenantId = String(body?.tenantId || '').trim();
    const orderToken = String(body?.orderToken || '').trim();
    const orderId = String(body?.orderId || '').trim();
    const monthKey = String(body?.monthKey || '').trim();
    const planType = body?.planType === 'annual' ? 'annual' : 'monthly';

    let accessToken = '';
    if ((scope === 'client_order' || scope === 'catalog_order') && tenantId) {
      const { data: merchantRow } = await readKeyRow(supabase, `merchant_mp_token_${tenantId}`);
      accessToken = String(merchantRow?.value?.accessToken || '').trim();
    }
    if (!accessToken) {
      accessToken = (Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') || '').trim();
    }
    if (!accessToken) {
      const { data: secretRow } = await readKeyRow(supabase, 'rec:secret:platform_mp_access_token');
      accessToken = String(secretRow?.value?.accessToken || '').trim();
    }

    if (!accessToken) {
      return jsonResponse({ verified: false, fallbackAllowed: true, reason: 'missing_access_token' });
    }

    let approvedPayment: any = null;

    if (paymentId && /^\d+$/.test(paymentId)) {
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (mpRes.ok) {
        const data = await mpRes.json();
        if (data?.status === 'approved') {
          approvedPayment = data;
        } else {
          return jsonResponse({
            verified: false,
            fallbackAllowed: false,
            status: data?.status || 'pending',
            message: `El pago #${paymentId} figura en estado "${data?.status || 'pendiente'}" en Mercado Pago.`,
          });
        }
      }
    } else {
      const extRef =
        scope === 'client_order' && orderToken
          ? `cpay::${orderToken}`
          : scope === 'catalog_order' && orderId
          ? `catord::${orderId}`
          : tenantId && monthKey
          ? `sub::${tenantId}::${monthKey}::${planType}`
          : '';
      if (extRef) {
        const searchRes = await fetch(
          `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(extRef)}&sort=date_created&criteria=desc`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const match = Array.isArray(searchData?.results)
            ? searchData.results.find((p: any) => p?.status === 'approved')
            : null;
          if (match) approvedPayment = match;
        }
      }
    }

    if (!approvedPayment) {
      return jsonResponse({
        verified: false,
        fallbackAllowed: true,
        reason: 'payment_not_found_in_mp_api',
      });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    if (scope === 'client_order' && orderToken) {
      const orderKey = `client_payment_order_${orderToken}`;
      const { data: orderRow } = await readKeyRow(supabase, orderKey);

      if (orderRow?.value) {
        const updatedOrder = {
          ...orderRow.value,
          status: 'approved',
          paymentMethod: 'mercadopago',
          mpPaymentId: String(approvedPayment.id),
          paidAt: todayStr,
          verificationSummary: `Verificado contra API de Mercado Pago (#${approvedPayment.id})`,
        };
        await upsertCloudKey(supabase, orderKey, updatedOrder);
        return jsonResponse({ verified: true, status: 'approved', order: updatedOrder });
      }
    }

    if (scope === 'catalog_order' && orderId) {
      const publicOrderKey = `catalog_order_${orderId}`;
      const { data: orderRow } = await readKeyRow(supabase, publicOrderKey);

      if (orderRow?.value) {
        const prev = orderRow.value;
        const nextMethod =
          prev.mpSubOption === 'dinero_en_cuenta' || body?.mpSubOption === 'dinero_en_cuenta'
            ? 'mercadopago_dinero_cuenta'
            : 'link_pago';
        const nowIso = new Date().toISOString();
        const updatedOrder = {
          ...prev,
          paymentStatus: 'acreditado',
          confirmedPaymentMethod: nextMethod,
          mpPaymentId: String(approvedPayment.id),
          updatedAt: nowIso,
        };
        await upsertCloudKey(supabase, publicOrderKey, updatedOrder);
        const effTenantId = String(prev.tenantId || tenantId || '').trim();
        if (effTenantId) {
          await upsertCloudKey(supabase, `rec:${effTenantId}:catalogOrders:${orderId}`, updatedOrder);
        }
        return jsonResponse({ verified: true, status: 'approved', order: updatedOrder });
      }
    }

    if (scope === 'tenant_subscription' && tenantId && monthKey) {
      const recordKey = `${tenantId}::${monthKey}`;
      const entityKey = `rec:platform:verified_payments:${recordKey}`;
      const verifiedRecord = {
        tenantId,
        monthKey,
        amount: Number(approvedPayment.transaction_amount || 0),
        status: 'approved',
        planType,
        monthsCount: planType === 'annual' ? 12 : 1,
        paymentMethod: 'mercadopago',
        mpPaymentId: String(approvedPayment.id),
        mpPreferenceId: approvedPayment.preference_id ? String(approvedPayment.preference_id) : undefined,
        paidAt: todayStr,
        verificationSummary: `Verificado contra API de Mercado Pago (#${approvedPayment.id})`,
      };
      await upsertCloudKey(supabase, entityKey, verifiedRecord);

      const { data: mapRow } = await readKeyRow(supabase, 'saas_verified_tenant_payments_v1');
      const currentMap = mapRow?.value && typeof mapRow.value === 'object' ? mapRow.value : {};
      await upsertCloudKey(supabase, 'saas_verified_tenant_payments_v1', {
        ...currentMap,
        [recordKey]: verifiedRecord,
      });

      return jsonResponse({ verified: true, status: 'approved', payment: verifiedRecord });
    }

    return jsonResponse({ verified: true, status: 'approved' });
  } catch (err) {
    return jsonResponse({
      verified: false,
      fallbackAllowed: true,
      error: err instanceof Error ? err.message : 'Verification error',
    });
  }
});
