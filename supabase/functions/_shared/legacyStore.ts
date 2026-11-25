// Adaptador: las funciones de Mercado Pago usaban claves de la tabla vieja
// app_cloud_store. Acá cada clave se traduce a su tabla del esquema v2.
// Corre con la service role key (solo en el servidor).
import type { SupabaseClient as BaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = BaseClient<any, any, any>;

type Row = { value: any } | null;

export async function readKeyRow(supabase: SupabaseClient, key: string): Promise<{ data: Row }> {
  return { data: await readKey(supabase, key) };
}

async function readKey(supabase: SupabaseClient, key: string): Promise<Row> {
  if (key.startsWith('merchant_mp_token_')) {
    const { data } = await supabase
      .from('business_secrets')
      .select('mp_access_token')
      .eq('business_id', key.slice('merchant_mp_token_'.length))
      .maybeSingle();
    return data?.mp_access_token ? { value: { accessToken: data.mp_access_token } } : null;
  }
  if (key === 'rec:secret:platform_mp_access_token') {
    const { data } = await supabase.from('platform_secrets').select('value').eq('key', 'mp_access_token').maybeSingle();
    return data?.value ? { value: { accessToken: data.value } } : null;
  }
  if (key.startsWith('client_payment_order_')) {
    const { data } = await supabase
      .from('payment_links')
      .select('data')
      .eq('token', key.slice('client_payment_order_'.length))
      .maybeSingle();
    return data ? { value: data.data } : null;
  }
  if (key.startsWith('tenant_sub_pay_order_')) {
    const { data } = await supabase
      .from('subscription_pay_orders')
      .select('data')
      .eq('token', key.slice('tenant_sub_pay_order_'.length))
      .maybeSingle();
    return data ? { value: data.data } : null;
  }
  if (key.startsWith('catalog_order_')) {
    const { data } = await supabase
      .from('catalog_orders')
      .select('data')
      .eq('id', key.slice('catalog_order_'.length))
      .limit(1)
      .maybeSingle();
    return data ? { value: data.data } : null;
  }
  if (key === 'saas_verified_tenant_payments_v1') {
    const { data } = await supabase.from('subscription_payments').select('business_id, month_key, data');
    const map: Record<string, unknown> = {};
    for (const r of data || []) map[`${r.business_id}::${r.month_key}`] = r.data;
    return { value: map };
  }
  const rec = key.match(/^rec:([^:]+):catalogOrders:(.+)$/);
  if (rec) {
    const { data } = await supabase.from('catalog_orders').select('data').eq('business_id', rec[1]).eq('id', rec[2]).maybeSingle();
    return data ? { value: data.data } : null;
  }
  return null;
}

export async function writeKey(supabase: SupabaseClient, key: string, value: any): Promise<void> {
  if (key === 'saas_verified_tenant_payments_v1') return; // se arma desde subscription_payments
  if (key.startsWith('client_payment_order_')) {
    await supabase
      .from('payment_links')
      .upsert({ token: key.slice('client_payment_order_'.length), business_id: value?.tenantId, data: value }, { onConflict: 'token' });
    return;
  }
  if (key.startsWith('tenant_sub_pay_order_')) {
    await supabase
      .from('subscription_pay_orders')
      .upsert({ token: key.slice('tenant_sub_pay_order_'.length), business_id: value?.tenantId, data: value }, { onConflict: 'token' });
    return;
  }
  if (key.startsWith('catalog_order_')) {
    if (!value?.tenantId) return;
    await supabase
      .from('catalog_orders')
      .upsert({ business_id: value.tenantId, id: key.slice('catalog_order_'.length), data: value }, { onConflict: 'business_id,id' });
    return;
  }
  const rec = key.match(/^rec:([^:]+):catalogOrders:(.+)$/);
  if (rec) {
    await supabase.from('catalog_orders').upsert({ business_id: rec[1], id: rec[2], data: value }, { onConflict: 'business_id,id' });
    return;
  }
  const vp = key.match(/^rec:platform:verified_payments:(.+)::(.+)$/);
  if (vp) {
    await supabase
      .from('subscription_payments')
      .upsert({ business_id: vp[1], month_key: vp[2], data: value }, { onConflict: 'business_id,month_key' });
    return;
  }
  console.warn('Clave sin destino en el esquema v2:', key);
}
