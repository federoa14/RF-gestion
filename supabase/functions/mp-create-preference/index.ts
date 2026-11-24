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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, fallbackReason: 'missing_supabase_service_role' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const scope =
      body?.scope === 'client_order'
        ? 'client_order'
        : body?.scope === 'catalog_order'
        ? 'catalog_order'
        : 'tenant_subscription';

    if (scope === 'catalog_order') {
      const orderId = String(body?.orderId || '').trim();
      const catalogHandle = String(body?.catalogHandle || '').trim();
      const mpSubOption =
        body?.mpSubOption === 'tarjetas_todos' ? 'tarjetas_todos' : 'dinero_en_cuenta';
      const rawReturnUrl = String(body?.returnUrl || '').trim();
      const safeBaseReturn =
        rawReturnUrl && /^https?:\/\//i.test(rawReturnUrl) ? rawReturnUrl.split('?')[0] : '';

      if (!orderId) {
        return jsonResponse({ ok: false, error: 'Falta orderId.' }, 400);
      }

      const publicOrderKey = `catalog_order_${orderId}`;
      const { data: orderRow } = await readKeyRow(supabase, publicOrderKey);

      const order = orderRow?.value;
      if (!order) {
        return jsonResponse({ ok: false, error: 'Pedido web no encontrado.' }, 404);
      }

      const tenantId = String(order.tenantId || body?.tenantId || '').trim();
      let accessToken = '';
      if (tenantId) {
        const { data: merchantRow } = await readKeyRow(supabase, `merchant_mp_token_${tenantId}`);
        accessToken = String(merchantRow?.value?.accessToken || '').trim();
      }
      if (!accessToken) {
        accessToken = (Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') || '').trim();
      }

      if (!accessToken) {
        return jsonResponse({ ok: false, fallbackReason: 'missing_access_token' });
      }

      const handleQuery = catalogHandle ? `catalog=${encodeURIComponent(catalogHandle)}&` : '';
      const successUrl = safeBaseReturn
        ? `${safeBaseReturn}?${handleQuery}order_id=${encodeURIComponent(orderId)}&mp_status=approved`
        : undefined;
      const notificationUrl = `${supabaseUrl}/functions/v1/mp-webhook?scope=catalog_order&orderId=${encodeURIComponent(orderId)}&tenantId=${encodeURIComponent(tenantId)}`;

      const itemsList = Array.isArray(order.items) && order.items.length > 0
        ? order.items.map((it: any) => ({
            id: String(it.productId || order.orderNumber),
            title: String(it.productName || 'Producto').slice(0, 200),
            quantity: Math.max(1, Math.floor(Number(it.quantity || 1))),
            currency_id: 'ARS',
            unit_price: Math.round(Number(it.unitPrice || 0) * 100) / 100,
          }))
        : [
            {
              id: order.orderNumber || orderId,
              title: `${order.storeName || 'Tienda'} · Pedido #${order.orderNumber}`,
              quantity: 1,
              currency_id: 'ARS',
              unit_price: Math.round(Number(order.totalAmount || 0) * 100) / 100,
            },
          ];

      const prefBody: Record<string, unknown> = {
        items: itemsList,
        external_reference: `catord::${orderId}`,
        notification_url: notificationUrl,
        ...(mpSubOption === 'dinero_en_cuenta'
          ? {
              purpose: 'wallet_purchase',
              payment_methods: {
                excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
              },
            }
          : {}),
        ...(successUrl
          ? {
              back_urls: {
                success: successUrl,
                pending: `${safeBaseReturn}?${handleQuery}order_id=${encodeURIComponent(orderId)}&mp_status=pending`,
                failure: `${safeBaseReturn}?${handleQuery}order_id=${encodeURIComponent(orderId)}&mp_status=failure`,
              },
              auto_return: 'approved',
            }
          : {}),
      };

      const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(prefBody),
      });

      const mpData = await mpRes.json();
      if (!mpRes.ok || !mpData?.init_point) {
        return jsonResponse({
          ok: false,
          fallbackReason: 'mp_api_error',
          error: mpData?.message || 'Mercado Pago rechazó la creación de la preferencia.',
        });
      }

      const nowIso = new Date().toISOString();
      const updatedOrder = {
        ...order,
        mpSubOption,
        mpInitPoint: mpData.init_point,
        mpPreferenceId: mpData.id,
        paymentStatus: order.paymentStatus === 'acreditado' ? 'acreditado' : 'en_proceso',
        updatedAt: nowIso,
      };

      await writeKey(supabase, publicOrderKey, updatedOrder);

      if (tenantId) {
        await writeKey(supabase, `rec:${tenantId}:catalogOrders:${orderId}`, updatedOrder);
      }

      return jsonResponse({
        ok: true,
        mode: 'mercadopago_api',
        initPoint: mpData.init_point,
        sandboxInitPoint: mpData.sandbox_init_point,
        preferenceId: mpData.id,
        order: updatedOrder,
      });
    }

    if (scope === 'tenant_subscription') {
      const tenantId = String(body?.tenantId || '').trim();
      const tenantName = String(body?.tenantName || 'Empresa').trim();
      const monthKey = String(body?.monthKey || '').trim();
      const planType = body?.planType === 'annual' ? 'annual' : 'monthly';
      const amount = Number(body?.amount || 0);
      const payerEmail = String(body?.payerEmail || '').trim();
      const returnUrl = String(body?.returnUrl || '').trim();

      if (!tenantId || !monthKey || amount <= 0) {
        return jsonResponse({ ok: false, error: 'Datos de suscripción inválidos.' }, 400);
      }

      let accessToken = (Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') || '').trim();
      if (!accessToken) {
        const { data: secretRow } = await readKeyRow(supabase, 'rec:secret:platform_mp_access_token');
        accessToken = String(secretRow?.value?.accessToken || '').trim();
      }

      if (!accessToken) {
        return jsonResponse({ ok: false, fallbackReason: 'missing_access_token' });
      }

      const extRef = `sub::${tenantId}::${monthKey}::${planType}`;
      const baseReturn = returnUrl ? returnUrl.split('?')[0] : '';
      const successUrl = baseReturn
        ? `${baseReturn}?mp_status=approved&tenantId=${encodeURIComponent(tenantId)}&monthKey=${encodeURIComponent(monthKey)}&planType=${planType}&amount=${amount}`
        : undefined;
      const pendingUrl = baseReturn
        ? `${baseReturn}?mp_status=pending&tenantId=${encodeURIComponent(tenantId)}&monthKey=${encodeURIComponent(monthKey)}`
        : undefined;
      const failureUrl = baseReturn
        ? `${baseReturn}?mp_status=failure&tenantId=${encodeURIComponent(tenantId)}&monthKey=${encodeURIComponent(monthKey)}`
        : undefined;

      const notificationUrl = `${supabaseUrl}/functions/v1/mp-webhook?scope=tenant_subscription`;

      const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          items: [
            {
              id: `sub-${monthKey}-${planType}`,
              title:
                planType === 'annual'
                  ? `Suscripción Anual (12 meses) - ${tenantName}`
                  : `Abono Mensual (${monthKey}) - ${tenantName}`,
              quantity: 1,
              currency_id: 'ARS',
              unit_price: Math.round(amount * 100) / 100,
            },
          ],
          ...(payerEmail ? { payer: { email: payerEmail } } : {}),
          external_reference: extRef,
          notification_url: notificationUrl,
          ...(successUrl
            ? {
                back_urls: {
                  success: successUrl,
                  pending: pendingUrl,
                  failure: failureUrl,
                },
                auto_return: 'approved',
              }
            : {}),
        }),
      });

      const mpData = await mpRes.json();
      if (!mpRes.ok || !mpData?.init_point) {
        return jsonResponse({
          ok: false,
          fallbackReason: 'mp_api_error',
          error: mpData?.message || 'Mercado Pago rechazó la creación de la preferencia.',
        });
      }

      return jsonResponse({
        ok: true,
        mode: 'mercadopago_api',
        initPoint: mpData.init_point,
        sandboxInitPoint: mpData.sandbox_init_point,
        preferenceId: mpData.id,
      });
    }

    // scope === 'client_order'
    const orderToken = String(body?.orderToken || '').trim();
    const returnUrl = String(body?.returnUrl || '').trim();
    if (!orderToken) {
      return jsonResponse({ ok: false, error: 'Falta orderToken.' }, 400);
    }

    const orderKey = `client_payment_order_${orderToken}`;
    const { data: orderRow } = await readKeyRow(supabase, orderKey);

    const order = orderRow?.value;
    if (!order) {
      return jsonResponse({ ok: false, error: 'Orden de pago no encontrada.' }, 404);
    }

    const tenantId = String(order.tenantId || '').trim();
    let accessToken = '';
    if (tenantId) {
      const { data: merchantRow } = await readKeyRow(supabase, `merchant_mp_token_${tenantId}`);
      accessToken = String(merchantRow?.value?.accessToken || '').trim();
    }
    if (!accessToken) {
      accessToken = (Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') || '').trim();
    }

    if (!accessToken) {
      return jsonResponse({ ok: false, fallbackReason: 'missing_access_token' });
    }

    const baseReturn = returnUrl ? returnUrl.split('?')[0] : '';
    const successUrl = baseReturn
      ? `${baseReturn}?pay_client=${encodeURIComponent(orderToken)}&mp_status=approved`
      : undefined;
    const notificationUrl = `${supabaseUrl}/functions/v1/mp-webhook?scope=client_order&token=${encodeURIComponent(orderToken)}&tenantId=${encodeURIComponent(tenantId)}`;

    const boletasLabel =
      Array.isArray(order.boletaNumbers) && order.boletaNumbers.length > 0
        ? order.boletaNumbers.map((n: string) => `#${n}`).join(', ')
        : 'Saldo pendiente';

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            id: orderToken,
            title: `${order.distributorName || 'Comercio'} · Boletas ${boletasLabel} (${order.clientName})`,
            quantity: 1,
            currency_id: 'ARS',
            unit_price: Math.round(Number(order.amount || 0) * 100) / 100,
          },
        ],
        external_reference: `cpay::${orderToken}`,
        notification_url: notificationUrl,
        ...(successUrl
          ? {
              back_urls: {
                success: successUrl,
                pending: `${baseReturn}?pay_client=${encodeURIComponent(orderToken)}&mp_status=pending`,
                failure: `${baseReturn}?pay_client=${encodeURIComponent(orderToken)}&mp_status=failure`,
              },
              auto_return: 'approved',
            }
          : {}),
      }),
    });

    const mpData = await mpRes.json();
    if (!mpRes.ok || !mpData?.init_point) {
      return jsonResponse({
        ok: false,
        fallbackReason: 'mp_api_error',
        error: mpData?.message || 'Error al generar link Checkout Pro en Mercado Pago.',
      });
    }

    const updatedOrder = {
      ...order,
      mpInitPoint: mpData.init_point,
      mpPreferenceId: mpData.id,
    };

    await writeKey(supabase, orderKey, updatedOrder);


    return jsonResponse({
      ok: true,
      mode: 'mercadopago_api',
      initPoint: mpData.init_point,
      sandboxInitPoint: mpData.sandbox_init_point,
      preferenceId: mpData.id,
      order: updatedOrder,
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Unexpected error' },
      500
    );
  }
});
