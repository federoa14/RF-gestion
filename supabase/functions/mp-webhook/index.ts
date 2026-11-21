import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

async function verifyWebhookSignature(req: Request, dataId: string, secret: string): Promise<boolean> {
  if (!secret) return true;
  const xSig = req.headers.get('x-signature') || '';
  const xReqId = req.headers.get('x-request-id') || '';
  if (!xSig || !dataId) return false;

  const parts = Object.fromEntries(
    xSig.split(',').map((part) => {
      const [k, v] = part.trim().split('=');
      return [k, v];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${xReqId};ts:${ts};`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest));
  const expectedHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return expectedHex === v1;
}

async function upsertCloudKey(supabase: ReturnType<typeof createClient>, key: string, value: unknown) {
  const now = new Date().toISOString();
  const { data: updated } = await supabase
    .from('app_cloud_store')
    .update({ value, updated_at: now })
    .eq('key', key)
    .select('key');
  if (!updated || updated.length === 0) {
    const { error } = await supabase.from('app_cloud_store').insert({
      key,
      value,
      updated_at: now,
    });
    if (error?.code === '23505') {
      await supabase
        .from('app_cloud_store')
        .update({ value, updated_at: now })
        .eq('key', key);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ received: true, skipped: 'missing_supabase_env' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const url = new URL(req.url);
    const scopeParam = url.searchParams.get('scope') || '';
    const tokenParam = url.searchParams.get('token') || '';
    const tenantIdParam = url.searchParams.get('tenantId') || '';

    let body: Record<string, any> = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    const topic = String(body?.type || body?.topic || url.searchParams.get('topic') || url.searchParams.get('type') || '');
    const paymentId = String(
      body?.data?.id ||
        url.searchParams.get('data.id') ||
        url.searchParams.get('id') ||
        (topic === 'payment' ? body?.resource : '') ||
        ''
    ).trim();

    if (!paymentId || (topic && !topic.includes('payment'))) {
      return new Response(JSON.stringify({ received: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const webhookSecret = (Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET') || '').trim();
    if (webhookSecret) {
      const valid = await verifyWebhookSignature(req, paymentId, webhookSecret);
      if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Resolver Access Token del comercio o de plataforma
    let accessToken = '';
    if (scopeParam === 'client_order' && tenantIdParam) {
      const { data: merchantRow } = await supabase
        .from('app_cloud_store')
        .select('value')
        .eq('key', `merchant_mp_token_${tenantIdParam}`)
        .maybeSingle();
      accessToken = String(merchantRow?.value?.accessToken || '').trim();
    }
    if (!accessToken) {
      accessToken = (Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') || '').trim();
    }
    if (!accessToken) {
      const { data: secretRow } = await supabase
        .from('app_cloud_store')
        .select('value')
        .eq('key', 'rec:secret:platform_mp_access_token')
        .maybeSingle();
      accessToken = String(secretRow?.value?.accessToken || '').trim();
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ received: true, skipped: 'missing_mp_token' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar pago oficial en API de Mercado Pago
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!mpRes.ok) {
      return new Response(JSON.stringify({ received: true, mpStatusCode: mpRes.status }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payment = await mpRes.json();
    if (payment?.status !== 'approved') {
      return new Response(
        JSON.stringify({ received: true, paymentStatus: payment?.status || 'unknown' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const extRef = String(payment?.external_reference || '');
    const todayStr = new Date().toISOString().split('T')[0];

    // Caso 1: Pago de orden de cliente (?pay_client=token)
    if (extRef.startsWith('cpay::') || (scopeParam === 'client_order' && tokenParam)) {
      const orderToken = extRef.startsWith('cpay::') ? extRef.slice('cpay::'.length) : tokenParam;
      const orderKey = `client_payment_order_${orderToken}`;
      const { data: orderRow } = await supabase
        .from('app_cloud_store')
        .select('value')
        .eq('key', orderKey)
        .maybeSingle();

      if (orderRow?.value) {
        const updatedOrder = {
          ...orderRow.value,
          status: 'approved',
          paymentMethod: 'mercadopago',
          mpPaymentId: String(payment.id),
          paidAt: todayStr,
          verificationSummary: `Pago confirmado vía Webhook oficial Mercado Pago (#${payment.id})`,
        };
        await upsertCloudKey(supabase, orderKey, updatedOrder);

        try {
          await supabase
            .from('client_payment_orders')
            .update({
              status: 'approved',
              payment_method: 'mercadopago',
              mp_payment_id: String(payment.id),
              paid_at: todayStr,
              verification_summary: updatedOrder.verificationSummary,
            })
            .eq('token', orderToken);
        } catch {
          // Optional relational mirror
        }
      }

      return new Response(JSON.stringify({ received: true, approved: true, scope: 'client_order' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Caso 2: Pago de suscripción SaaS de empresa
    if (extRef.startsWith('sub::') || extRef.includes('::')) {
      const cleanParts = extRef.startsWith('sub::') ? extRef.slice(5).split('::') : extRef.split('::');
      const tenantId = cleanParts[0];
      const monthKey = cleanParts[1];
      const planType = cleanParts[2] === 'annual' ? 'annual' : 'monthly';

      if (tenantId && monthKey) {
        const recordKey = `${tenantId}::${monthKey}`;
        const entityKey = `rec:platform:verified_payments:${recordKey}`;
        const verifiedRecord = {
          tenantId,
          monthKey,
          amount: Number(payment.transaction_amount || 0),
          status: 'approved',
          planType,
          monthsCount: planType === 'annual' ? 12 : 1,
          paymentMethod: 'mercadopago',
          mpPaymentId: String(payment.id),
          mpPreferenceId: payment.preference_id ? String(payment.preference_id) : undefined,
          paidAt: todayStr,
          verificationSummary: `Acreditado por Webhook oficial Mercado Pago (#${payment.id})`,
        };

        await upsertCloudKey(supabase, entityKey, verifiedRecord);

        const { data: mapRow } = await supabase
          .from('app_cloud_store')
          .select('value')
          .eq('key', 'saas_verified_tenant_payments_v1')
          .maybeSingle();

        const currentMap = mapRow?.value && typeof mapRow.value === 'object' ? mapRow.value : {};
        await upsertCloudKey(supabase, 'saas_verified_tenant_payments_v1', {
          ...currentMap,
          [recordKey]: verifiedRecord,
        });
      }
    }

    return new Response(JSON.stringify({ received: true, approved: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Webhook processing failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
