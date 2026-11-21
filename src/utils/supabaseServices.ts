import type {
  BusinessRubro,
  CatalogPickupOrder,
  CatalogProduct,
  CatalogStockAlertRequest,
  ClientPaymentOrder,
  PlatformAnnouncement,
  PlatformBillingConfig,
  PlatformSupportConfig,
  PublishedPublicCatalog,
  Tenant,
} from '../types';
import { dbGetItem, dbSetItem } from './localInternalDb';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import {
  fetchClientPaymentOrderFromSupabase,
  saveClientPaymentOrderToSupabase,
} from './supabaseSync';

const CLOUD_TABLE = 'app_cloud_store';
const VERIFIED_TENANT_PAYMENTS_KEY = 'saas_verified_tenant_payments_v1';

export interface VerifiedTenantPaymentRecord {
  tenantId: string;
  monthKey: string;
  amount: number;
  status: 'approved' | 'pending' | 'rejected';
  planType?: 'monthly' | 'annual';
  monthsCount?: number;
  paymentMethod: 'mercadopago' | 'transferencia';
  mpPaymentId?: string;
  mpPreferenceId?: string;
  paidAt?: string;
  aliasUsed?: string;
  receiptImageUrl?: string;
  verifiedViaReceipt?: boolean;
  verificationSummary?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(value?: string | null): boolean {
  return Boolean(value && UUID_REGEX.test(value));
}

export async function readCloudJsonRecord<T>(key: string): Promise<T | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !key) return null;
  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error || !data?.value) return null;
    return data.value as T;
  } catch {
    return null;
  }
}

async function insertOrUpdateCloudStoreKey<T>(key: string, value: T): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase || !key) return false;
  const now = new Date().toISOString();
  try {
    const { data: updatedRows, error: updErr } = await supabase
      .from(CLOUD_TABLE)
      .update({ value, updated_at: now })
      .eq('key', key)
      .select('key');

    if (updErr) return false;
    if (updatedRows && updatedRows.length > 0) return true;

    const { error: insErr } = await supabase.from(CLOUD_TABLE).insert({
      key,
      value,
      updated_at: now,
    });
    if (!insErr) return true;
    if (insErr.code === '23505') {
      const { error: retryErr } = await supabase
        .from(CLOUD_TABLE)
        .update({ value, updated_at: now })
        .eq('key', key);
      return !retryErr;
    }
    return false;
  } catch {
    return false;
  }
}

export async function writeCloudJsonRecord<T>(key: string, value: T): Promise<boolean> {
  return insertOrUpdateCloudStoreKey(key, value);
}

export async function savePlatformMpAccessTokenSecret(accessToken: string): Promise<boolean> {
  const clean = accessToken.trim();
  if (!clean) return false;
  return insertOrUpdateCloudStoreKey('rec:secret:platform_mp_access_token', {
    accessToken: clean,
    updatedAt: new Date().toISOString(),
  });
}

export async function saveMerchantMpAccessTokenSecret(
  tenantId: string,
  accessToken: string
): Promise<boolean> {
  const clean = accessToken.trim();
  if (!tenantId || !clean) return false;
  return insertOrUpdateCloudStoreKey(`merchant_mp_token_${tenantId}`, {
    accessToken: clean,
    updatedAt: new Date().toISOString(),
  });
}

export async function createMercadoPagoPreferenceViaEdgeFunction(
  params:
    | {
        scope: 'tenant_subscription';
        tenantId: string;
        tenantName: string;
        monthKey: string;
        planType: 'monthly' | 'annual';
        amount: number;
        payerEmail?: string;
        returnUrl?: string;
      }
    | {
        scope: 'client_order';
        orderToken: string;
        returnUrl?: string;
      }
): Promise<{
  ok: boolean;
  mode?: string;
  initPoint?: string;
  preferenceId?: string;
  order?: ClientPaymentOrder;
  fallbackReason?: string;
}> {
  const supabase = getSupabaseClient();
  if (!supabase || !isSupabaseConfigured()) {
    return { ok: false, fallbackReason: 'supabase_not_configured' };
  }
  try {
    const { data, error } = await supabase.functions.invoke('mp-create-preference', {
      body: params,
    });
    if (error || !data) {
      return { ok: false, fallbackReason: 'edge_function_unavailable' };
    }
    return data as {
      ok: boolean;
      mode?: string;
      initPoint?: string;
      preferenceId?: string;
      order?: ClientPaymentOrder;
      fallbackReason?: string;
    };
  } catch {
    return { ok: false, fallbackReason: 'edge_function_unavailable' };
  }
}

// ============================================================================
// BEST-EFFORT MIRROR A TABLAS RELACIONALES DE SUPABASE (INSERT / UPDATE INDIVIDUAL)
// ============================================================================

export async function mirrorPlatformBillingToSupabaseTable(
  cfg: PlatformBillingConfig
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const payload = {
    alias: cfg.alias || '',
    cvu: cfg.cvu || '',
    account_holder_name: cfg.accountHolderName || '',
    bank_or_wallet_name: cfg.bankOrWalletName || 'Mercado Pago',
    default_monthly_fee: Number(cfg.defaultMonthlyFee || 25000),
    annual_discount_percent: Number(cfg.annualDiscountPercent || 0),
    mp_checkout_link: cfg.mpCheckoutLink || '',
    mp_public_key: cfg.mpPublicKey || '',
    has_mp_access_token: Boolean(cfg.hasMpAccessToken),
    updated_at: new Date().toISOString(),
  };
  try {
    const { data: updatedRows } = await supabase
      .from('platform_billing_config')
      .update(payload)
      .eq('id', 'default')
      .select('id');
    if (!updatedRows || updatedRows.length === 0) {
      await supabase.from('platform_billing_config').insert({ id: 'default', ...payload });
    }
  } catch {
    // app_cloud_store remains authoritative if RLS restricts anon writes
  }
}

export async function mirrorPlatformSupportToSupabaseTable(
  cfg: PlatformSupportConfig
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const payload = {
    contact_name: cfg.contactName || '',
    whatsapp_phone: cfg.whatsappPhone || '',
    email: cfg.email || '',
    attention_hours: cfg.attentionHours || '',
    welcome_message: cfg.welcomeMessage || '',
    updated_at: new Date().toISOString(),
  };
  try {
    const { data: updatedRows } = await supabase
      .from('platform_support_config')
      .update(payload)
      .eq('id', 'default')
      .select('id');
    if (!updatedRows || updatedRows.length === 0) {
      await supabase.from('platform_support_config').insert({ id: 'default', ...payload });
    }
  } catch {
    // non-blocking
  }
}

export async function mirrorPlatformAnnouncementToSupabaseTable(
  item: PlatformAnnouncement
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !item?.id) return;
  const payload = {
    title: item.title,
    message: item.message,
    category: item.category,
    audience: item.audience,
    cta_type: item.ctaType || 'none',
    cta_label: item.ctaLabel || '',
    cta_url: item.ctaUrl || '',
    active: Boolean(item.active),
    expires_at: item.expiresAt || null,
    author_name: item.authorName || '',
    created_at: item.createdAt || new Date().toISOString(),
  };
  try {
    const { data: updatedRows } = await supabase
      .from('platform_announcements')
      .update(payload)
      .eq('id', item.id)
      .select('id');
    if (!updatedRows || updatedRows.length === 0) {
      await supabase.from('platform_announcements').insert({ id: item.id, ...payload });
    }
  } catch {
    // non-blocking
  }
}

export async function deletePlatformAnnouncementFromSupabaseTable(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !id) return;
  try {
    await supabase.from('platform_announcements').delete().eq('id', id);
  } catch {
    // non-blocking
  }
}

export async function mirrorClientPaymentOrderToSupabaseTable(
  order: ClientPaymentOrder
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !order?.token) return;
  if (!isUuid(order.tenantId) || !isUuid(order.clientId)) return;
  const payload = {
    tenant_id: order.tenantId,
    distributor_name: order.distributorName,
    client_id: order.clientId,
    client_name: order.clientName,
    client_phone: order.clientPhone || null,
    amount: Number(order.amount || 0),
    currency_symbol: order.currencySymbol || '$',
    boleta_ids: order.boletaIds || [],
    boleta_numbers: order.boletaNumbers || [],
    alias: order.alias || null,
    cvu: order.cvu || null,
    holder_name: order.holderName || null,
    bank_name: order.bankName || null,
    mp_checkout_link: order.mpCheckoutLink || null,
    mp_init_point: order.mpInitPoint || null,
    mp_preference_id: order.mpPreferenceId || null,
    status: order.status,
    payment_method: order.paymentMethod || null,
    mp_payment_id: order.mpPaymentId || null,
    paid_at: order.paidAt || null,
    reconciled_in_app: Boolean(order.reconciledInApp),
    reconciled_at: order.reconciledAt || null,
    verification_summary: order.verificationSummary || null,
    receipt_image_url: order.receiptImageUrl || null,
    created_at: order.createdAt || new Date().toISOString(),
  };
  try {
    const { data: updatedRows } = await supabase
      .from('client_payment_orders')
      .update(payload)
      .eq('token', order.token)
      .select('token');
    if (!updatedRows || updatedRows.length === 0) {
      await supabase.from('client_payment_orders').insert({ token: order.token, ...payload });
    }
  } catch {
    // non-blocking
  }
}

// ============================================================================
// ÓRDENES DE PAGO DE CLIENTES (LINKS DE COBRO WHATSAPP + CONCILIACIÓN DIRECTA)
// ============================================================================

export async function saveClientPaymentOrderEverywhere(order: ClientPaymentOrder): Promise<void> {
  await Promise.all([
    saveClientPaymentOrderToSupabase(order),
    mirrorClientPaymentOrderToSupabaseTable(order),
  ]);
}

export async function getClientPaymentOrderFromCloud(
  token: string
): Promise<ClientPaymentOrder | null> {
  if (!token) return null;
  const fromBridge = await fetchClientPaymentOrderFromSupabase(token);
  if (fromBridge) return fromBridge;

  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('client_payment_orders')
      .select(
        'token, tenant_id, distributor_name, client_id, client_name, client_phone, amount, currency_symbol, boleta_ids, boleta_numbers, alias, cvu, holder_name, bank_name, mp_checkout_link, mp_init_point, mp_preference_id, status, payment_method, mp_payment_id, paid_at, reconciled_in_app, reconciled_at, verification_summary, receipt_image_url, created_at'
      )
      .eq('token', token)
      .maybeSingle();
    if (error || !data) return null;
    return {
      token: String(data.token),
      tenantId: String(data.tenant_id),
      distributorName: String(data.distributor_name || ''),
      clientId: String(data.client_id),
      clientName: String(data.client_name || ''),
      clientPhone: data.client_phone || undefined,
      amount: Number(data.amount || 0),
      currencySymbol: String(data.currency_symbol || '$'),
      boletaIds: Array.isArray(data.boleta_ids) ? data.boleta_ids : [],
      boletaNumbers: Array.isArray(data.boleta_numbers) ? data.boleta_numbers : [],
      alias: data.alias || undefined,
      cvu: data.cvu || undefined,
      holderName: data.holder_name || undefined,
      bankName: data.bank_name || undefined,
      mpCheckoutLink: data.mp_checkout_link || undefined,
      mpInitPoint: data.mp_init_point || undefined,
      mpPreferenceId: data.mp_preference_id || undefined,
      status: data.status === 'approved' ? 'approved' : 'pending',
      paymentMethod: data.payment_method || undefined,
      mpPaymentId: data.mp_payment_id || undefined,
      paidAt: data.paid_at || undefined,
      reconciledInApp: Boolean(data.reconciled_in_app),
      reconciledAt: data.reconciled_at || undefined,
      verificationSummary: data.verification_summary || undefined,
      receiptImageUrl: data.receipt_image_url || undefined,
      createdAt: String(data.created_at || new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

export async function verifyClientPaymentOrderInSupabase(params: {
  token: string;
  paymentId?: string;
  collectionStatus?: string;
  paymentMethod?: 'mercadopago' | 'transferencia';
  confirmInstant?: boolean;
}): Promise<{ approved: boolean; order: ClientPaymentOrder | null; message?: string }> {
  const order = await getClientPaymentOrderFromCloud(params.token);
  if (!order) {
    return { approved: false, order: null, message: 'Orden de pago no encontrada.' };
  }

  if (order.status === 'approved') {
    return { approved: true, order };
  }

  // Intentar validación real en servidor contra Mercado Pago API vía Supabase Edge Function
  const supabase = getSupabaseClient();
  if (supabase && (params.paymentMethod !== 'transferencia' || (params.paymentId && /^\d+$/.test(params.paymentId.trim())))) {
    try {
      const { data: edgeData } = await supabase.functions.invoke('mp-verify-payment', {
        body: {
          scope: 'client_order',
          orderToken: params.token,
          tenantId: order.tenantId,
          paymentId: params.paymentId?.trim() || undefined,
        },
      });
      if (edgeData?.verified && edgeData?.order) {
        return { approved: true, order: edgeData.order as ClientPaymentOrder };
      }
      if (edgeData && edgeData.verified === false && edgeData.fallbackAllowed === false) {
        return {
          approved: false,
          order,
          message: edgeData.message || 'El pago aún no figura aprobado en Mercado Pago.',
        };
      }
    } catch {
      // Edge Function opcional aún no desplegada: continuar con respaldo directo en app_cloud_store
    }
  }

  const shouldApprove =
    params.collectionStatus === 'approved' ||
    Boolean(params.confirmInstant) ||
    Boolean(params.paymentId && params.paymentId.trim().length >= 4);

  if (!shouldApprove) {
    return {
      approved: false,
      order,
      message:
        'Ingresá el número de operación/comprobante de Mercado Pago o adjuntá la captura para acreditarlo al instante.',
    };
  }

  const method: 'mercadopago' | 'transferencia' =
    params.paymentMethod === 'transferencia' ? 'transferencia' : 'mercadopago';
  const refId =
    params.paymentId?.trim() || `MP-CLI-${Date.now().toString().slice(-7)}`;

  const updatedOrder: ClientPaymentOrder = {
    ...order,
    status: 'approved',
    paymentMethod: method,
    mpPaymentId: refId,
    paidAt: new Date().toISOString().split('T')[0],
    verificationSummary:
      method === 'mercadopago'
        ? `Pago online acreditado (${refId})`
        : `Transferencia al Alias confirmada (${refId})`,
  };

  await saveClientPaymentOrderEverywhere(updatedOrder);
  return { approved: true, order: updatedOrder };
}

export async function verifyClientReceiptImageInSupabase(params: {
  token: string;
  imageBase64: string;
  mimeType?: string;
}): Promise<{ approved: boolean; order?: ClientPaymentOrder; message: string }> {
  const order = await getClientPaymentOrderFromCloud(params.token);
  if (!order) {
    return { approved: false, message: 'Orden de pago no encontrada.' };
  }

  const clean = String(params.imageBase64 || '');
  if (clean.length < 100) {
    return {
      approved: false,
      message: 'La imagen del comprobante parece estar vacía o dañada.',
    };
  }

  const opId = `COMP-${Date.now().toString().slice(-7)}`;
  const method: 'mercadopago' | 'transferencia' = order.mpInitPoint
    ? 'mercadopago'
    : 'transferencia';

  const updatedOrder: ClientPaymentOrder = {
    ...order,
    status: 'approved',
    paymentMethod: method,
    mpPaymentId: opId,
    paidAt: new Date().toISOString().split('T')[0],
    receiptImageUrl: clean,
    verificationSummary: `Comprobante adjuntado • Op #${opId} • ${order.currencySymbol || '$'} ${order.amount.toLocaleString('es-AR')}`,
  };

  await saveClientPaymentOrderEverywhere(updatedOrder);
  return {
    approved: true,
    order: updatedOrder,
    message: `¡Comprobante registrado en Supabase! La cuenta de ${order.clientName} quedó acreditada y marcada como PAGADA automáticamente.`,
  };
}

export async function fetchPendingReconciliationOrdersFromSupabase(
  tenantId: string
): Promise<ClientPaymentOrder[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !isSupabaseConfigured()) return [];

  try {
    let query = supabase
      .from(CLOUD_TABLE)
      .select('value')
      .like('key', 'client_payment_order_%')
      .eq('value->>status', 'approved')
      .or('value->>reconciledInApp.is.null,value->>reconciledInApp.eq.false')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (tenantId) {
      query = query.in('value->>tenantId', [tenantId, 'default-tenant']);
    }

    const { data, error } = await query;

    if (error || !Array.isArray(data)) return [];

    const results: ClientPaymentOrder[] = [];
    for (const row of data) {
      const o = row?.value as ClientPaymentOrder | undefined;
      if (
        o &&
        o.status === 'approved' &&
        !o.reconciledInApp &&
        (!tenantId || o.tenantId === tenantId || o.tenantId === 'default-tenant')
      ) {
        results.push(o);
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function markClientPaymentOrderReconciledInSupabase(token: string): Promise<void> {
  if (!token) return;
  const order = await getClientPaymentOrderFromCloud(token);
  if (!order) return;
  const updated: ClientPaymentOrder = {
    ...order,
    reconciledInApp: true,
    reconciledAt: new Date().toISOString(),
  };
  await saveClientPaymentOrderEverywhere(updated);
}

// ============================================================================
// PAGOS DE SUSCRIPCIÓN SAAS DE EMPRESAS (EN SUPABASE)
// ============================================================================

const VERIFIED_PAYMENT_ENTITY_PREFIX = 'rec:platform:verified_payments:';

export async function fetchVerifiedTenantPaymentsMapFromSupabase(): Promise<
  Record<string, VerifiedTenantPaymentRecord>
> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const stored = await readCloudJsonRecord<Record<string, VerifiedTenantPaymentRecord>>(
      VERIFIED_TENANT_PAYMENTS_KEY
    );
    return stored && typeof stored === 'object' ? { ...stored } : {};
  }

  const [stored, individualRes] = await Promise.all([
    readCloudJsonRecord<Record<string, VerifiedTenantPaymentRecord>>(VERIFIED_TENANT_PAYMENTS_KEY),
    supabase
      .from(CLOUD_TABLE)
      .select('key, value')
      .like('key', `${VERIFIED_PAYMENT_ENTITY_PREFIX}%`)
      .limit(1000)
      .then((res) => res, () => ({ data: null })),
  ]);

  const result: Record<string, VerifiedTenantPaymentRecord> =
    stored && typeof stored === 'object' ? { ...stored } : {};

  if (Array.isArray(individualRes?.data)) {
    for (const row of individualRes.data) {
      if (!row?.key || !row?.value) continue;
      const mapKey = String(row.key).slice(VERIFIED_PAYMENT_ENTITY_PREFIX.length);
      if (mapKey) {
        result[mapKey] = row.value as VerifiedTenantPaymentRecord;
      }
    }
  }
  return result;
}

export async function fetchVerifiedTenantPaymentStatusFromSupabase(
  tenantId: string,
  monthKey: string
): Promise<{ approved: boolean; payment: VerifiedTenantPaymentRecord | null }> {
  if (!tenantId || !monthKey) return { approved: false, payment: null };
  const mapKey = `${tenantId}::${monthKey}`;
  const individualKey = `${VERIFIED_PAYMENT_ENTITY_PREFIX}${mapKey}`;
  const supabase = getSupabaseClient();
  if (!supabase) return { approved: false, payment: null };

  try {
    // Una sola consulta por PK para revisar el registro individual y el mapa agregado en paralelo
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select('key, value')
      .in('key', [individualKey, VERIFIED_TENANT_PAYMENTS_KEY]);

    if (!error && Array.isArray(data)) {
      let individualRecord: VerifiedTenantPaymentRecord | null = null;
      let aggregateMap: Record<string, VerifiedTenantPaymentRecord> | null = null;

      for (const row of data) {
        if (row.key === individualKey && row.value) {
          individualRecord = row.value as VerifiedTenantPaymentRecord;
        } else if (row.key === VERIFIED_TENANT_PAYMENTS_KEY && row.value && typeof row.value === 'object') {
          aggregateMap = row.value as Record<string, VerifiedTenantPaymentRecord>;
        }
      }

      const record = individualRecord || aggregateMap?.[mapKey] || null;
      return {
        approved: Boolean(record && record.status === 'approved'),
        payment: record,
      };
    }
  } catch {
    // fallback below
  }

  const individual = await readCloudJsonRecord<VerifiedTenantPaymentRecord>(individualKey);
  return {
    approved: Boolean(individual && individual.status === 'approved'),
    payment: individual || null,
  };
}

export async function verifyAndRecordTenantPaymentInSupabase(params: {
  tenantId: string;
  monthKey: string;
  amount?: number;
  planType?: 'monthly' | 'annual';
  monthsCount?: number;
  paymentId?: string;
  preferenceId?: string;
  collectionStatus?: string;
  paymentMethod?: 'mercadopago' | 'transferencia';
  confirmInstant?: boolean;
  aliasUsed?: string;
  receiptImageUrl?: string;
  verificationSummary?: string;
  verifiedViaReceipt?: boolean;
}): Promise<{ approved: boolean; payment?: VerifiedTenantPaymentRecord; message?: string }> {
  if (!params.tenantId || !params.monthKey) {
    return { approved: false, message: 'Faltan datos de la empresa o período.' };
  }

  const key = `${params.tenantId}::${params.monthKey}`;
  const entityKey = `${VERIFIED_PAYMENT_ENTITY_PREFIX}${key}`;
  const map = await fetchVerifiedTenantPaymentsMapFromSupabase();
  const existing = map[key];
  if (existing && existing.status === 'approved' && !params.receiptImageUrl) {
    return { approved: true, payment: existing };
  }

  // Intentar verificación real del pago en API de Mercado Pago vía Supabase Edge Function
  const supabase = getSupabaseClient();
  if (supabase && !params.receiptImageUrl && params.paymentMethod === 'mercadopago') {
    try {
      const { data: edgeData } = await supabase.functions.invoke('mp-verify-payment', {
        body: {
          scope: 'tenant_subscription',
          tenantId: params.tenantId,
          monthKey: params.monthKey,
          planType: params.planType === 'annual' ? 'annual' : 'monthly',
          paymentId: params.paymentId?.trim() || undefined,
        },
      });
      if (edgeData?.verified && edgeData?.payment) {
        return { approved: true, payment: edgeData.payment as VerifiedTenantPaymentRecord };
      }
      if (edgeData && edgeData.verified === false && edgeData.fallbackAllowed === false) {
        return {
          approved: false,
          message: edgeData.message || 'El pago aún figura pendiente o rechazado en Mercado Pago.',
        };
      }
    } catch {
      // Edge Function opcional aún no desplegada: continuar con flujo directo
    }
  }

  const shouldApprove =
    params.collectionStatus === 'approved' ||
    Boolean(params.confirmInstant) ||
    Boolean(params.receiptImageUrl) ||
    Boolean(params.paymentId && params.paymentId.trim().length >= 4);

  if (!shouldApprove) {
    return {
      approved: false,
      message:
        'Ingresá el número de operación o adjuntá la captura del comprobante para acreditar el abono en Supabase.',
    };
  }

  const safePlanType: 'monthly' | 'annual' =
    params.planType === 'annual' ? 'annual' : 'monthly';
  const safeMonthsCount =
    safePlanType === 'annual' ? Math.max(12, Number(params.monthsCount) || 12) : 1;

  const record: VerifiedTenantPaymentRecord = {
    tenantId: params.tenantId,
    monthKey: params.monthKey,
    amount: Number(params.amount || 25000),
    status: 'approved',
    planType: safePlanType,
    monthsCount: safeMonthsCount,
    paymentMethod: params.paymentMethod === 'transferencia' ? 'transferencia' : 'mercadopago',
    mpPaymentId: params.paymentId?.trim() || `MP-${Date.now().toString().slice(-8)}`,
    mpPreferenceId: params.preferenceId,
    paidAt: new Date().toISOString().split('T')[0],
    aliasUsed: params.aliasUsed,
    receiptImageUrl: params.receiptImageUrl,
    verifiedViaReceipt: Boolean(params.verifiedViaReceipt),
    verificationSummary: params.verificationSummary,
  };

  // 1. Insertar o actualizar el registro individual del pago sin tocar los demás
  await insertOrUpdateCloudStoreKey(entityKey, record);

  // 2. Re-leer mapa remoto fresco y fusionar antes de escribir el mapa agregado
  const latestMap = await fetchVerifiedTenantPaymentsMapFromSupabase();
  await insertOrUpdateCloudStoreKey(VERIFIED_TENANT_PAYMENTS_KEY, {
    ...latestMap,
    [key]: record,
  });

  return { approved: true, payment: record };
}

// ============================================================================
// CATÁLOGO ONLINE PÚBLICO Y PEDIDOS PARA RETIRAR POR WHATSAPP
// ============================================================================

export function buildPublicCatalogHandle(params: {
  slug?: string;
  tenantCode?: string;
  tenantId: string;
}): string {
  const cleanSlug = (params.slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (cleanSlug) return cleanSlug;
  if (params.tenantCode && params.tenantCode.trim()) return params.tenantCode.trim();
  return params.tenantId;
}

export async function publishPublicCatalogToSupabase(
  catalog: PublishedPublicCatalog
): Promise<boolean> {
  if (!catalog?.tenantId) return false;
  const key = `public_catalog_${catalog.tenantId}`;
  const cleanSlug = catalog.slug?.trim().toLowerCase();
  const cleanCode = catalog.tenantCode?.trim().toLowerCase();

  try {
    dbSetItem(key, JSON.stringify(catalog));
    if (cleanSlug) {
      dbSetItem(`public_catalog_handle_${cleanSlug}`, catalog.tenantId);
    }
    if (cleanCode) {
      dbSetItem(`public_catalog_handle_${cleanCode}`, catalog.tenantId);
    }
  } catch {
    // ignore local cache write issue
  }

  const refWrites: Array<Promise<boolean>> = [insertOrUpdateCloudStoreKey(key, catalog)];
  if (cleanSlug && cleanSlug !== catalog.tenantId.toLowerCase()) {
    refWrites.push(
      insertOrUpdateCloudStoreKey(`public_catalog_ref_${cleanSlug}`, { tenantId: catalog.tenantId })
    );
  }
  if (cleanCode && cleanCode !== cleanSlug && cleanCode !== catalog.tenantId.toLowerCase()) {
    refWrites.push(
      insertOrUpdateCloudStoreKey(`public_catalog_ref_${cleanCode}`, { tenantId: catalog.tenantId })
    );
  }

  const results = await Promise.all(refWrites);
  return results[0];
}

export async function setPublicCatalogSuperAdminEnabledInSupabase(
  tenant: Tenant,
  enabled: boolean,
  overrides?: {
    catalogRubro?: BusinessRubro;
    rubroFilters?: string[];
    customSubfilters?: string[];
    products?: CatalogProduct[];
  }
): Promise<void> {
  if (!tenant?.id) return;
  const key = `public_catalog_${tenant.id}`;
  let existing: PublishedPublicCatalog | null = null;
  try {
    const localRaw = dbGetItem(key);
    if (localRaw) existing = JSON.parse(localRaw) as PublishedPublicCatalog;
  } catch {
    existing = null;
  }
  if (!existing) {
    existing = await readCloudJsonRecord<PublishedPublicCatalog>(key);
  }

  const nowIso = new Date().toISOString();
  if (existing) {
    const updated: PublishedPublicCatalog = {
      ...existing,
      enabledBySuperAdmin: enabled,
      logoUrl: tenant.config?.distributorLogoUrl || tenant.logoUrl || existing.logoUrl,
      icon: tenant.config?.distributorIcon || tenant.icon || existing.icon,
      catalogRubro: overrides?.catalogRubro ?? tenant.catalogRubro ?? existing.catalogRubro,
      rubroFilters: overrides?.rubroFilters ?? existing.rubroFilters,
      customSubfilters: overrides?.customSubfilters ?? existing.customSubfilters,
      products: overrides?.products ?? existing.products,
      updatedAt: nowIso,
    };
    try {
      dbSetItem(key, JSON.stringify(updated));
    } catch {
      // ignore
    }
    await insertOrUpdateCloudStoreKey(key, updated);
  } else if (enabled) {
    const createdSnapshot: PublishedPublicCatalog = {
      tenantId: tenant.id,
      tenantCode: tenant.tenantCode,
      enabledBySuperAdmin: true,
      published: true,
      catalogRubro: overrides?.catalogRubro ?? tenant.catalogRubro ?? tenant.businessRubro ?? 'distribuidora',
      rubroFilters: overrides?.rubroFilters,
      customSubfilters: overrides?.customSubfilters,
      storeName: tenant.name,
      tagline:
        'Armá tu carrito de compras, elegí retiro en tienda o envío a domicilio y envialo por WhatsApp.',
      logoUrl: tenant.config?.distributorLogoUrl || tenant.logoUrl,
      icon: tenant.config?.distributorIcon || tenant.icon,
      whatsappPhone: tenant.phone || '',
      allowPickup: true,
      allowDelivery: true,
      pickupAddress: tenant.address || '',
      pickupHours: 'Lunes a Sábado · 9:00 a 19:00 hs',
      paymentNote: 'Efectivo, transferencia o link de pago',
      currencySymbol: tenant.config?.currencySymbol || '$',
      products: overrides?.products || [],
      updatedAt: nowIso,
    };
    await publishPublicCatalogToSupabase(createdSnapshot);
  }
}

function readLocalPublicCatalogFallback(rawId: string): PublishedPublicCatalog | null {
  try {
    const direct = dbGetItem(`public_catalog_${rawId}`);
    if (direct) return JSON.parse(direct) as PublishedPublicCatalog;
    const mappedTenantId = dbGetItem(`public_catalog_handle_${rawId.toLowerCase()}`);
    if (mappedTenantId) {
      const mapped = dbGetItem(`public_catalog_${mappedTenantId}`);
      if (mapped) return JSON.parse(mapped) as PublishedPublicCatalog;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function fetchPublicCatalogFromSupabase(
  identifier: string
): Promise<PublishedPublicCatalog | null> {
  const rawId = decodeURIComponent(identifier || '').trim();
  if (!rawId) return null;
  const lower = rawId.toLowerCase();

  // 1. Verificar cache local si existe (útil en la misma sesión o sin Supabase)
  const localCatalog = readLocalPublicCatalogFallback(rawId);
  if (localCatalog && !isSupabaseConfigured()) {
    return localCatalog;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return localCatalog;
  }

  try {
    let resolvedCatalog: PublishedPublicCatalog | null = null;
    let resolvedTenantObj: Tenant | undefined;

    const directKey = `public_catalog_${rawId}`;
    const refKey = `public_catalog_ref_${lower}`;
    const directTenantKey = `rec:platform:tenants:${rawId}`;
    const lookupKeys = Array.from(
      new Set([
        directKey,
        refKey,
        directTenantKey,
        ...(rawId !== lower ? [`public_catalog_${lower}`] : []),
        ...(localCatalog?.tenantId && localCatalog.tenantId !== rawId
          ? [`public_catalog_${localCatalog.tenantId}`, `rec:platform:tenants:${localCatalog.tenantId}`]
          : []),
      ])
    );

    // 2. Consulta directa por PK (1 RTT): catálogo directo, puntero por slug/código y estado del tenant
    const { data: pkRows } = await supabase
      .from(CLOUD_TABLE)
      .select('key, value')
      .in('key', lookupKeys);

    let refTenantId: string | null = null;
    if (Array.isArray(pkRows)) {
      for (const row of pkRows) {
        if (row.key === directKey || row.key === `public_catalog_${lower}`) {
          const val = row.value as PublishedPublicCatalog | undefined;
          if (val?.tenantId) resolvedCatalog = val;
        } else if (row.key === refKey) {
          const refVal = row.value as { tenantId?: string } | undefined;
          if (refVal?.tenantId) refTenantId = refVal.tenantId;
        } else if (row.key.startsWith('rec:platform:tenants:') && row.value) {
          resolvedTenantObj = row.value as Tenant;
        }
      }
      if (!resolvedCatalog && refTenantId) {
        const hit = pkRows.find((r) => r.key === `public_catalog_${refTenantId}`);
        if (hit?.value && (hit.value as PublishedPublicCatalog).tenantId) {
          resolvedCatalog = hit.value as PublishedPublicCatalog;
        }
      }
    }

    // 3. Si encontramos el tenantId vía puntero (`public_catalog_ref_<handle>`), traer catálogo + estado del tenant juntos por PK
    if (!resolvedCatalog && refTenantId) {
      const targetCatalogKey = `public_catalog_${refTenantId}`;
      const targetTenantKey = `rec:platform:tenants:${refTenantId}`;
      const { data: refRows } = await supabase
        .from(CLOUD_TABLE)
        .select('key, value')
        .in('key', [targetCatalogKey, targetTenantKey]);

      if (Array.isArray(refRows)) {
        for (const row of refRows) {
          if (row.key === targetCatalogKey && row.value) {
            const val = row.value as PublishedPublicCatalog;
            if (val.tenantId) resolvedCatalog = val;
          } else if (row.key === targetTenantKey && row.value) {
            resolvedTenantObj = row.value as Tenant;
          }
        }
      }
    }

    // 4. Fallback indexado de 1 sola fila para catálogos publicados antes de existir punteros `public_catalog_ref_*`
    if (!resolvedCatalog) {
      const safeRaw = rawId.replace(/[,()"'\\]/g, '').trim();
      const safeLower = lower.replace(/[,()"'\\]/g, '').trim();
      if (safeLower) {
        const eqConditions = Array.from(
          new Set([
            `value->>slug.eq.${safeLower}`,
            `value->>tenantCode.eq.${safeRaw}`,
            `value->>tenantCode.eq.${safeLower}`,
            `value->>tenantCode.eq.${safeRaw.toUpperCase()}`,
            `value->>tenantId.eq.${safeRaw}`,
          ])
        ).join(',');

        const { data: exactMatchRows } = await supabase
          .from(CLOUD_TABLE)
          .select('value')
          .like('key', 'public_catalog_%')
          .or(eqConditions)
          .limit(1);

        const matchedVal = exactMatchRows?.[0]?.value as PublishedPublicCatalog | undefined;
        if (matchedVal?.tenantId) {
          resolvedCatalog = matchedVal;
        } else {
          // Último recurso para códigos con mayúsculas/minúsculas mixtas sin traer otros catálogos (solo 1 fila)
          const { data: ilikeRows } = await supabase
            .from(CLOUD_TABLE)
            .select('value')
            .like('key', 'public_catalog_%')
            .or(`value->>slug.ilike.${safeLower},value->>tenantCode.ilike.${safeLower}`)
            .limit(1);
          const ilikeVal = ilikeRows?.[0]?.value as PublishedPublicCatalog | undefined;
          if (ilikeVal?.tenantId) {
            resolvedCatalog = ilikeVal;
          }
        }

        // Backfill asíncrono del puntero para que la próxima apertura sea O(1) por PK
        if (resolvedCatalog?.tenantId) {
          void insertOrUpdateCloudStoreKey(refKey, { tenantId: resolvedCatalog.tenantId });
        }
      }
    }

    if (!resolvedCatalog) {
      return localCatalog;
    }

    // 5. Verificar si SuperGestión habilitó/pausó el servicio de catálogo para esa empresa
    if (!resolvedTenantObj || resolvedTenantObj.id !== resolvedCatalog.tenantId) {
      try {
        const { data: tenantRow } = await supabase
          .from(CLOUD_TABLE)
          .select('value')
          .eq('key', `rec:platform:tenants:${resolvedCatalog.tenantId}`)
          .maybeSingle();
        if (tenantRow?.value) {
          resolvedTenantObj = tenantRow.value as Tenant;
        }
      } catch {
        // keep snapshot value
      }
    }

    if (resolvedTenantObj) {
      resolvedCatalog = {
        ...resolvedCatalog,
        logoUrl:
          resolvedTenantObj.config?.distributorLogoUrl ||
          resolvedTenantObj.logoUrl ||
          resolvedCatalog.logoUrl,
        icon:
          resolvedTenantObj.config?.distributorIcon ||
          resolvedTenantObj.icon ||
          resolvedCatalog.icon,
        catalogRubro:
          resolvedTenantObj.catalogRubro ||
          resolvedCatalog.catalogRubro ||
          resolvedTenantObj.businessRubro ||
          resolvedTenantObj.config?.businessRubro,
        enabledBySuperAdmin:
          resolvedTenantObj.catalogEnabled !== false &&
          resolvedTenantObj.status !== 'suspended' &&
          !resolvedTenantObj.subscription?.isPaused,
      };
    }

    return resolvedCatalog;
  } catch {
    return localCatalog;
  }
}

export async function submitPublicCatalogOrderToSupabase(
  order: CatalogPickupOrder
): Promise<boolean> {
  if (!order?.id || !order?.tenantId) return false;
  const publicOrderKey = `catalog_order_${order.id}`;
  const tenantEntityKey = `rec:${order.tenantId}:catalogOrders:${order.id}`;

  // Cache local por si el dueño abre el panel desde el mismo dispositivo
  try {
    const cacheKey = `public_orders_cache_${order.tenantId}`;
    const raw = dbGetItem(cacheKey);
    const existing: CatalogPickupOrder[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(existing) ? existing.filter((o) => o.id !== order.id) : [];
    dbSetItem(cacheKey, JSON.stringify([order, ...filtered].slice(0, 200)));
  } catch {
    // ignore local order cache errors
  }

  const [okPublic, okEntity] = await Promise.all([
    insertOrUpdateCloudStoreKey(publicOrderKey, order),
    insertOrUpdateCloudStoreKey(tenantEntityKey, order),
  ]);

  // Descontar cantidades en stock en el catálogo público publicado (si los artículos controlan stock)
  try {
    const qtyByProd = new Map<string, number>();
    for (const it of order.items || []) {
      if (it.productId && Number(it.quantity) > 0) {
        qtyByProd.set(it.productId, (qtyByProd.get(it.productId) || 0) + Number(it.quantity));
      }
    }
    if (qtyByProd.size > 0) {
      const catKey = `public_catalog_${order.tenantId}`;
      let snapshot: PublishedPublicCatalog | null = null;
      const localRaw = dbGetItem(catKey);
      if (localRaw) {
        try {
          snapshot = JSON.parse(localRaw) as PublishedPublicCatalog;
        } catch {
          snapshot = null;
        }
      }
      if (!snapshot) {
        snapshot = await readCloudJsonRecord<PublishedPublicCatalog>(catKey);
      }
      if (snapshot && Array.isArray(snapshot.products)) {
        let changed = false;
        const nextProducts = snapshot.products.map((p) => {
          const orderedQty = qtyByProd.get(p.id);
          if (!orderedQty || typeof p.stockQuantity !== 'number') return p;
          changed = true;
          return {
            ...p,
            stockQuantity: Math.max(0, p.stockQuantity - orderedQty),
            updatedAt: new Date().toISOString(),
          };
        });
        if (changed) {
          const nextCatalog: PublishedPublicCatalog = {
            ...snapshot,
            products: nextProducts,
            updatedAt: new Date().toISOString(),
          };
          try {
            dbSetItem(catKey, JSON.stringify(nextCatalog));
          } catch {
            // ignore
          }
          await insertOrUpdateCloudStoreKey(catKey, nextCatalog);
        }
      }
    }
  } catch {
    // non-fatal stock snapshot update
  }

  return okPublic || okEntity;
}

export async function fetchCatalogOrdersForTenantFromSupabase(
  tenantId: string
): Promise<CatalogPickupOrder[]> {
  if (!tenantId) return [];
  const mergedMap = new Map<string, CatalogPickupOrder>();

  try {
    const rawLocal = dbGetItem(`public_orders_cache_${tenantId}`);
    if (rawLocal) {
      const localList = JSON.parse(rawLocal);
      if (Array.isArray(localList)) {
        for (const o of localList) {
          if (o && o.id && o.tenantId === tenantId) mergedMap.set(o.id, o);
        }
      }
    }
  } catch {
    // ignore
  }

  const supabase = getSupabaseClient();
  if (!supabase) return Array.from(mergedMap.values());

  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select('value')
      .like('key', 'rec:%:catalogOrders:%')
      .eq('value->>tenantId', tenantId)
      .order('updated_at', { ascending: false })
      .limit(200);
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const o = row?.value as CatalogPickupOrder | undefined;
        if (o && o.id && o.tenantId === tenantId) {
          const prev = mergedMap.get(o.id);
          if (!prev || (o.updatedAt || o.createdAt) >= (prev.updatedAt || prev.createdAt)) {
            mergedMap.set(o.id, o);
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return Array.from(mergedMap.values());
}

export async function submitCatalogStockAlertToSupabase(
  alert: CatalogStockAlertRequest
): Promise<boolean> {
  if (!alert?.id || !alert?.tenantId) return false;
  const publicAlertKey = `catalog_stock_alert_${alert.id}`;
  const tenantEntityKey = `rec:${alert.tenantId}:catalogStockAlerts:${alert.id}`;

  try {
    const cacheKey = `public_stock_alerts_cache_${alert.tenantId}`;
    const raw = dbGetItem(cacheKey);
    const existing: CatalogStockAlertRequest[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(existing) ? existing.filter((a) => a.id !== alert.id) : [];
    dbSetItem(cacheKey, JSON.stringify([alert, ...filtered].slice(0, 300)));
  } catch {
    // ignore local cache write issue
  }

  const [okPublic, okEntity] = await Promise.all([
    insertOrUpdateCloudStoreKey(publicAlertKey, alert),
    insertOrUpdateCloudStoreKey(tenantEntityKey, alert),
  ]);
  return okPublic || okEntity;
}

export async function fetchCatalogStockAlertsForTenantFromSupabase(
  tenantId: string
): Promise<CatalogStockAlertRequest[]> {
  if (!tenantId) return [];
  const mergedMap = new Map<string, CatalogStockAlertRequest>();

  try {
    const rawLocal = dbGetItem(`public_stock_alerts_cache_${tenantId}`);
    if (rawLocal) {
      const localList = JSON.parse(rawLocal);
      if (Array.isArray(localList)) {
        for (const a of localList) {
          if (a && a.id && a.tenantId === tenantId) mergedMap.set(a.id, a);
        }
      }
    }
  } catch {
    // ignore
  }

  const supabase = getSupabaseClient();
  if (!supabase) return Array.from(mergedMap.values());

  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select('value')
      .like('key', 'rec:%:catalogStockAlerts:%')
      .eq('value->>tenantId', tenantId)
      .order('updated_at', { ascending: false })
      .limit(300);
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const a = row?.value as CatalogStockAlertRequest | undefined;
        if (a && a.id && a.tenantId === tenantId) {
          const prev = mergedMap.get(a.id);
          if (!prev || (a.updatedAt || a.createdAt) >= (prev.updatedAt || prev.createdAt)) {
            mergedMap.set(a.id, a);
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return Array.from(mergedMap.values());
}

