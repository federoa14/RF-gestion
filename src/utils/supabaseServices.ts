import type {
  BusinessRubro,
  CatalogAbandonedCart,
  CatalogGiftCard,
  CatalogLoyaltyAccount,
  CatalogPickupOrder,
  CatalogProduct,
  CatalogPromoSubscriber,
  CatalogStockAlertRequest,
  ClientPaymentOrder,
  PlatformAnnouncement,
  PlatformBillingConfig,
  PlatformSupportConfig,
  PublishedPublicCatalog,
  SubscriptionPlanTier,
  Tenant,
  TenantSubscriptionPayOrder,
} from '../types';
import { normalizeDni } from './catalogStock';
import { dbGetItem, dbSetItem } from './localInternalDb';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import {
  fetchClientPaymentOrderFromSupabase,
  getCloudSession,
  saveClientPaymentOrderToSupabase,
} from './supabaseSync';

// -----------------------------------------------------------------------------
// Enrutador de claves viejas → tablas nuevas (esquema v2)
// Las funciones de este archivo siguen usando las claves de antes; acá se decide
// a qué tabla va cada una y si se usa acceso directo (miembros del comercio,
// protegido por RLS) o una función pública acotada (catálogo, links de pago).
// -----------------------------------------------------------------------------

const COLLECTION_TO_TABLE: Record<string, string> = {
  catalogOrders: 'catalog_orders',
  catalogStockAlerts: 'catalog_stock_alerts',
  catalogPromoSubscribers: 'catalog_promo_subscribers',
  catalogLoyaltyAccounts: 'catalog_loyalty_accounts',
  catalogAbandonedCarts: 'catalog_abandoned_carts',
  catalogGiftCards: 'catalog_gift_cards',
  catalogProducts: 'catalog_products',
};

function isMemberOf(businessId?: string | null): boolean {
  const session = getCloudSession();
  if (!session || !businessId) return false;
  return session.role === 'superadmin' || session.businessId === businessId;
}

async function putBusinessEntity(table: string, businessId: string, id: string, data: unknown): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase || !businessId || !id) return false;
  if (isMemberOf(businessId)) {
    const { error } = await supabase
      .from(table)
      .upsert({ business_id: businessId, id, data }, { onConflict: 'business_id,id' });
    return !error;
  }
  const { error } = await supabase.rpc('public_entity_put', {
    p_business_id: businessId,
    p_kind: table,
    p_id: id,
    p_data: data,
  });
  return !error;
}

async function listBusinessEntities<T>(table: string, businessId: string, limit = 1000): Promise<T[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !businessId || !isMemberOf(businessId)) return [];
  const { data, error } = await supabase
    .from(table)
    .select('data')
    .eq('business_id', businessId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error || !Array.isArray(data)) return [];
  return data.map((r: any) => r.data as T).filter(Boolean);
}

async function getPublicEntity<T>(table: string, businessId: string, id: string): Promise<T | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !businessId || !id) return null;
  if (isMemberOf(businessId)) {
    const { data } = await supabase.from(table).select('data').eq('business_id', businessId).eq('id', id).maybeSingle();
    return (data?.data as T) || null;
  }
  const { data, error } = await supabase.rpc('public_entity_get', { p_business_id: businessId, p_kind: table, p_id: id });
  return error ? null : ((data as T) || null);
}

async function findPublicEntities<T>(table: string, businessId: string, value: string): Promise<T[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !businessId || !value) return [];
  const { data, error } = await supabase.rpc('public_entity_find', { p_business_id: businessId, p_kind: table, p_value: value });
  return !error && Array.isArray(data) ? (data as T[]) : [];
}

async function putPaymentDoc(kind: 'payment_link' | 'subscription_order', token: string, businessId: string, doc: any): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase || !token) return false;
  const table = kind === 'payment_link' ? 'payment_links' : 'subscription_pay_orders';
  if (isMemberOf(businessId)) {
    const { error } = await supabase.from(table).upsert({ token, business_id: businessId, data: doc }, { onConflict: 'token' });
    if (!error) return true;
  }
  const { error } = await supabase.rpc('public_payment_doc_patch', { p_kind: kind, p_token: token, p_patch: doc });
  return !error;
}

async function getPaymentDoc<T>(kind: 'payment_link' | 'subscription_order', token: string): Promise<T | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !token) return null;
  const { data, error } = await supabase.rpc('public_payment_doc_get', { p_kind: kind, p_token: token });
  return error ? null : ((data as T) || null);
}

const VERIFIED_TENANT_PAYMENTS_KEY = 'saas_verified_tenant_payments_v1';

export interface VerifiedTenantPaymentRecord {
  tenantId: string;
  monthKey: string;
  amount: number;
  status: 'approved' | 'pending' | 'rejected';
  planType?: 'monthly' | 'annual';
  planTier?: SubscriptionPlanTier;
  planTierLabel?: string;
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
    if (key.startsWith('public_catalog_ref_')) {
      const cat = (await supabase.rpc('public_catalog_get', { p_handle: key.slice('public_catalog_ref_'.length) })).data;
      return cat?.tenantId ? ({ tenantId: cat.tenantId } as T) : null;
    }
    if (key.startsWith('public_catalog_')) {
      const businessId = key.slice('public_catalog_'.length);
      if (isMemberOf(businessId)) {
        const { data } = await supabase.from('public_catalogs').select('snapshot').eq('business_id', businessId).maybeSingle();
        return data?.snapshot ? ({ ...data.snapshot, tenantId: businessId } as T) : null;
      }
      const { data } = await supabase.rpc('public_catalog_get', { p_handle: businessId });
      return (data as T) || null;
    }
    if (key.startsWith('rec:platform:tenants:')) {
      const id = key.slice('rec:platform:tenants:'.length);
      if (!isMemberOf(id)) return null;
      const { data } = await supabase.from('businesses').select('id, data').eq('id', id).maybeSingle();
      return data ? ({ ...data.data, id: data.id } as T) : null;
    }
    if (key.startsWith(VERIFIED_PAYMENT_ENTITY_PREFIX)) {
      const [bid, month] = key.slice(VERIFIED_PAYMENT_ENTITY_PREFIX.length).split('::');
      const { data } = await supabase.from('subscription_payments').select('data').eq('business_id', bid).eq('month_key', month).maybeSingle();
      return (data?.data as T) || null;
    }
    if (key === VERIFIED_TENANT_PAYMENTS_KEY) {
      const { data } = await supabase.from('subscription_payments').select('business_id, month_key, data');
      const map: Record<string, unknown> = {};
      for (const r of data || []) map[`${r.business_id}::${r.month_key}`] = r.data;
      return map as T;
    }
    if (key.startsWith('client_payment_order_')) {
      return await getPaymentDoc<T>('payment_link', key.slice('client_payment_order_'.length));
    }
    if (key.startsWith(TENANT_SUB_PAY_ORDER_PREFIX)) {
      return await getPaymentDoc<T>('subscription_order', key.slice(TENANT_SUB_PAY_ORDER_PREFIX.length));
    }
    const rec = key.match(/^rec:([^:]+):([^:]+):(.+)$/);
    if (rec && COLLECTION_TO_TABLE[rec[2]]) {
      return await getPublicEntity<T>(COLLECTION_TO_TABLE[rec[2]], rec[1], rec[3]);
    }
    return null;
  } catch {
    return null;
  }
}

async function insertOrUpdateCloudStoreKey<T>(key: string, value: T): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase || !key) return false;
  const v: any = value;
  try {
    // Claves públicas viejas duplicadas: ahora todo vive en la tabla del comercio
    if (
      key.startsWith('public_catalog_ref_') ||
      key.startsWith('catalog_order_') ||
      key.startsWith('catalog_stock_alert_') ||
      key.startsWith('catalog_promo_sub_') ||
      key.startsWith('catalog_loyalty_') ||
      key.startsWith('catalog_abandoned_cart_') ||
      key.startsWith('catalog_gift_card_') ||
      key === VERIFIED_TENANT_PAYMENTS_KEY
    ) {
      return true;
    }
    if (key === 'rec:secret:platform_mp_access_token') {
      const { error } = await supabase.rpc('set_platform_mp_token', { p_token: v?.accessToken || '' });
      return !error;
    }
    if (key.startsWith('merchant_mp_token_')) {
      const { error } = await supabase.rpc('set_merchant_mp_token', {
        p_business_id: key.slice('merchant_mp_token_'.length),
        p_token: v?.accessToken || '',
      });
      return !error;
    }
    if (key.startsWith('public_catalog_')) {
      const businessId = key.slice('public_catalog_'.length);
      if (!isMemberOf(businessId)) return false;
      const { error } = await supabase
        .from('public_catalogs')
        .upsert({ business_id: businessId, snapshot: value }, { onConflict: 'business_id' });
      return !error;
    }
    if (key.startsWith(VERIFIED_PAYMENT_ENTITY_PREFIX)) {
      const [bid, month] = key.slice(VERIFIED_PAYMENT_ENTITY_PREFIX.length).split('::');
      if (!isMemberOf(bid)) return true; // si paga alguien sin sesión, lo registra el servidor al aprobar la orden
      const { error } = await supabase
        .from('subscription_payments')
        .upsert({ business_id: bid, month_key: month, data: value }, { onConflict: 'business_id,month_key' });
      return !error;
    }
    if (key.startsWith('client_payment_order_')) {
      return await putPaymentDoc('payment_link', key.slice('client_payment_order_'.length), v?.tenantId, value);
    }
    if (key.startsWith(TENANT_SUB_PAY_ORDER_PREFIX)) {
      return await putPaymentDoc('subscription_order', key.slice(TENANT_SUB_PAY_ORDER_PREFIX.length), v?.tenantId, value);
    }
    const rec = key.match(/^rec:([^:]+):([^:]+):(.+)$/);
    if (rec && COLLECTION_TO_TABLE[rec[2]]) {
      return await putBusinessEntity(COLLECTION_TO_TABLE[rec[2]], rec[1], rec[3], value);
    }
    console.warn('[Supabase] Clave sin destino en el esquema nuevo:', key);
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
  // Ya no se usa: el esquema v2 guarda todo en sus tablas (ver supabaseSync).
}

export async function mirrorPlatformSupportToSupabaseTable(
  cfg: PlatformSupportConfig
): Promise<void> {
  // Ya no se usa: el esquema v2 guarda todo en sus tablas (ver supabaseSync).
}

export async function mirrorPlatformAnnouncementToSupabaseTable(
  item: PlatformAnnouncement
): Promise<void> {
  // Ya no se usa: el esquema v2 guarda todo en sus tablas (ver supabaseSync).
}

export async function deletePlatformAnnouncementFromSupabaseTable(id: string): Promise<void> {
  // Ya no se usa: el esquema v2 guarda todo en sus tablas (ver supabaseSync).
}

export async function mirrorClientPaymentOrderToSupabaseTable(
  order: ClientPaymentOrder
): Promise<void> {
  // Ya no se usa: el esquema v2 guarda todo en sus tablas (ver supabaseSync).
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
  return fetchClientPaymentOrderFromSupabase(token);
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
  if (!supabase || !isSupabaseConfigured() || !tenantId || !isMemberOf(tenantId)) return [];
  try {
    const { data, error } = await supabase
      .from('payment_links')
      .select('data')
      .eq('business_id', tenantId)
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error || !Array.isArray(data)) return [];
    return data
      .map((r: any) => r.data as ClientPaymentOrder)
      .filter((o) => o && o.status === 'approved' && !o.reconciledInApp);
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
  const map = await readCloudJsonRecord<Record<string, VerifiedTenantPaymentRecord>>(VERIFIED_TENANT_PAYMENTS_KEY);
  return map && typeof map === 'object' ? { ...map } : {};
}

export async function fetchVerifiedTenantPaymentStatusFromSupabase(
  tenantId: string,
  monthKey: string
): Promise<{ approved: boolean; payment: VerifiedTenantPaymentRecord | null }> {
  if (!tenantId || !monthKey) return { approved: false, payment: null };
  const record = await readCloudJsonRecord<VerifiedTenantPaymentRecord>(
    `${VERIFIED_PAYMENT_ENTITY_PREFIX}${tenantId}::${monthKey}`
  );
  return { approved: Boolean(record && record.status === 'approved'), payment: record || null };
}

export async function verifyAndRecordTenantPaymentInSupabase(params: {
  tenantId: string;
  monthKey: string;
  amount?: number;
  planType?: 'monthly' | 'annual';
  planTier?: SubscriptionPlanTier;
  planTierLabel?: string;
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
    planTier: params.planTier,
    planTierLabel: params.planTierLabel,
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
// LINKS Y ÓRDENES DE PAGO COMPARTIBLES PARA SUSCRIPCIONES / FIN DE PRUEBA 30D
// ============================================================================

const TENANT_SUB_PAY_ORDER_PREFIX = 'tenant_sub_pay_order_';

export async function saveTenantSubPayOrderEverywhere(
  order: TenantSubscriptionPayOrder
): Promise<void> {
  if (!order?.token) return;
  const key = `${TENANT_SUB_PAY_ORDER_PREFIX}${order.token}`;
  try {
    await dbSetItem(key, JSON.stringify(order));
  } catch {
    // non-blocking
  }
  await insertOrUpdateCloudStoreKey(key, order);
}

export async function getTenantSubPayOrderFromCloud(
  token: string
): Promise<TenantSubscriptionPayOrder | null> {
  if (!token) return null;
  const cleanToken = token.trim();
  const key = `${TENANT_SUB_PAY_ORDER_PREFIX}${cleanToken}`;
  const cloud = await readCloudJsonRecord<TenantSubscriptionPayOrder>(key);
  if (cloud && cloud.token) return cloud;

  try {
    const raw = await dbGetItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as TenantSubscriptionPayOrder;
      if (parsed && parsed.token) return parsed;
    }
  } catch {
    // non-blocking
  }
  return null;
}

export async function createTenantSubscriptionPayOrder(params: {
  tenant: Tenant;
  monthKey: string;
  monthName: string;
  planType: 'monthly' | 'annual';
  planTier?: SubscriptionPlanTier;
  planTierLabel?: string;
  monthsCount: number;
  amount: number;
  billingConfig: PlatformBillingConfig;
  payerEmail?: string;
  generatedBy: 'tenant' | 'superadmin';
  notes?: string;
  returnBaseUrl?: string;
}): Promise<{ order: TenantSubscriptionPayOrder; payUrl: string }> {
  const token = `SUB-${(params.tenant.tenantCode || 'EMP').replace(/[^A-Z0-9-]/gi, '').slice(0, 12)}-${Date.now().toString(36).toUpperCase()}`;
  const origin =
    params.returnBaseUrl ||
    (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '');
  const cleanBase = origin.replace(/\/$/, '');
  const payUrl = cleanBase ? `${cleanBase}/?sub_pay=${encodeURIComponent(token)}` : `?sub_pay=${encodeURIComponent(token)}`;

  let mpInitPoint: string | undefined;
  let mpPreferenceId: string | undefined;

  // 1. Intentar generar preferencia oficial de Mercado Pago vía Supabase Edge Function
  try {
    const edgePref = await createMercadoPagoPreferenceViaEdgeFunction({
      scope: 'tenant_subscription',
      tenantId: params.tenant.id,
      tenantName: params.tenant.name,
      monthKey: params.monthKey,
      planType: params.planType,
      amount: params.amount,
      payerEmail: params.payerEmail || params.tenant.email || undefined,
      returnUrl: payUrl,
    });
    if (edgePref.ok && edgePref.initPoint) {
      mpInitPoint = edgePref.initPoint;
      mpPreferenceId = edgePref.preferenceId;
    }
  } catch {
    // non-blocking
  }

  // 2. Respaldo: intentar servidor Express (/api/mercadopago/create-preference)
  if (!mpInitPoint && typeof fetch === 'function') {
    try {
      const res = await fetch('/api/mercadopago/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: params.tenant.id,
          tenantCode: params.tenant.tenantCode,
          tenantName: params.tenant.name,
          monthKey: params.monthKey,
          monthName: params.monthName,
          amount: params.amount,
          planType: params.planType,
          monthsCount: params.monthsCount,
          payerEmail: params.payerEmail || params.tenant.email || undefined,
          originUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.initPoint) {
          mpInitPoint = data.initPoint;
          mpPreferenceId = data.preferenceId;
        }
      }
    } catch {
      // non-blocking
    }
  }

  const order: TenantSubscriptionPayOrder = {
    token,
    tenantId: params.tenant.id,
    tenantCode: params.tenant.tenantCode,
    tenantName: params.tenant.name,
    monthKey: params.monthKey,
    monthName: params.monthName,
    planType: params.planType,
    planTier: params.planTier || params.tenant.subscription?.planTier,
    planTierLabel: params.planTierLabel,
    monthsCount: params.monthsCount,
    amount: Number(params.amount || 0),
    currencySymbol: params.tenant.subscription?.currency || '$',
    alias: params.billingConfig.alias || undefined,
    cvu: params.billingConfig.cvu || undefined,
    holderName: params.billingConfig.accountHolderName || undefined,
    bankName: params.billingConfig.bankOrWalletName || 'Mercado Pago',
    mpCheckoutLink: params.billingConfig.mpCheckoutLink || undefined,
    mpInitPoint,
    mpPreferenceId,
    status: 'pending',
    generatedBy: params.generatedBy,
    notes: params.notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  await saveTenantSubPayOrderEverywhere(order);
  return { order, payUrl };
}

export async function verifyAndApproveTenantSubPayOrder(params: {
  token: string;
  paymentId?: string;
  collectionStatus?: string;
  paymentMethod?: 'mercadopago' | 'transferencia';
  confirmInstant?: boolean;
  receiptImageUrl?: string;
  verificationSummary?: string;
  verifiedViaReceipt?: boolean;
}): Promise<{ approved: boolean; order: TenantSubscriptionPayOrder | null; message?: string }> {
  const order = await getTenantSubPayOrderFromCloud(params.token);
  if (!order) {
    return { approved: false, order: null, message: 'No se encontró la orden de pago.' };
  }

  if (order.status === 'approved' && !params.receiptImageUrl) {
    return { approved: true, order };
  }

  const res = await verifyAndRecordTenantPaymentInSupabase({
    tenantId: order.tenantId,
    monthKey: order.monthKey,
    amount: order.amount,
    planType: order.planType,
    planTier: order.planTier,
    planTierLabel: order.planTierLabel,
    monthsCount: order.monthsCount,
    paymentId: params.paymentId,
    preferenceId: order.mpPreferenceId,
    collectionStatus: params.collectionStatus,
    paymentMethod: params.paymentMethod || 'mercadopago',
    confirmInstant: params.confirmInstant,
    aliasUsed: order.alias,
    receiptImageUrl: params.receiptImageUrl,
    verificationSummary:
      params.verificationSummary ||
      order.notes ||
      `Pago de suscripción ${order.planType === 'annual' ? 'Anual (12M)' : order.monthName}${order.planTierLabel ? ` · ${order.planTierLabel}` : ''}`,
    verifiedViaReceipt: params.verifiedViaReceipt,
  });

  if (!res.approved || !res.payment) {
    return { approved: false, order, message: res.message };
  }

  const updatedOrder: TenantSubscriptionPayOrder = {
    ...order,
    status: 'approved',
    paymentMethod: res.payment.paymentMethod,
    mpPaymentId: res.payment.mpPaymentId,
    paidAt: res.payment.paidAt || new Date().toISOString().split('T')[0],
    receiptImageUrl: params.receiptImageUrl || order.receiptImageUrl,
    verificationSummary: res.payment.verificationSummary || order.verificationSummary,
  };

  await saveTenantSubPayOrderEverywhere(updatedOrder);
  return { approved: true, order: updatedOrder };
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
      merchantPaymentAlias:
        tenant.config?.merchantPaymentAlias ?? existing.merchantPaymentAlias,
      merchantPaymentCvu:
        tenant.config?.merchantPaymentCvu ?? existing.merchantPaymentCvu,
      merchantPaymentBank:
        tenant.config?.merchantPaymentBank ?? existing.merchantPaymentBank,
      merchantPaymentHolder:
        tenant.config?.merchantPaymentHolder ?? existing.merchantPaymentHolder,
      merchantMpCheckoutLink:
        tenant.config?.merchantMpCheckoutLink ?? existing.merchantMpCheckoutLink,
      hasMerchantMpAccessToken:
        typeof tenant.config?.hasMerchantMpAccessToken === 'boolean'
          ? tenant.config.hasMerchantMpAccessToken
          : existing.hasMerchantMpAccessToken,
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
      paymentNote: 'Efectivo, transferencia o Mercado Pago',
      merchantPaymentAlias: tenant.config?.merchantPaymentAlias,
      merchantPaymentCvu: tenant.config?.merchantPaymentCvu,
      merchantPaymentBank: tenant.config?.merchantPaymentBank,
      merchantPaymentHolder: tenant.config?.merchantPaymentHolder,
      merchantMpCheckoutLink: tenant.config?.merchantMpCheckoutLink,
      hasMerchantMpAccessToken: Boolean(tenant.config?.hasMerchantMpAccessToken),
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
  const localCatalog = readLocalPublicCatalogFallback(rawId);
  const supabase = getSupabaseClient();
  if (!supabase) return localCatalog;
  try {
    // El servidor resuelve por slug, código o id y aplica el estado actual del comercio
    // (pausado / suspendido / deshabilitado por el superadmin).
    const { data, error } = await supabase.rpc('public_catalog_get', { p_handle: rawId });
    if (error) return localCatalog;
    return (data as PublishedPublicCatalog) || null;
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

  // Descontar stock en el catálogo publicado: si el pedido lo carga un comprador, lo hace el servidor
  // (public_entity_put). Si lo carga el comercio, se actualiza acá.
  try {
    if (!isMemberOf(order.tenantId)) throw new Error('skip');
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
  return listBusinessEntities<CatalogPickupOrder>('catalog_orders', tenantId, 500);
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
  return listBusinessEntities<CatalogStockAlertRequest>('catalog_stock_alerts', tenantId, 500);
}

export async function syncCatalogOrderToSupabase(
  order: CatalogPickupOrder
): Promise<boolean> {
  if (!order?.id || !order?.tenantId) return false;
  const publicOrderKey = `catalog_order_${order.id}`;
  const tenantEntityKey = `rec:${order.tenantId}:catalogOrders:${order.id}`;

  try {
    const cacheKey = `public_orders_cache_${order.tenantId}`;
    const raw = dbGetItem(cacheKey);
    const existing: CatalogPickupOrder[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(existing) ? existing.filter((o) => o.id !== order.id) : [];
    dbSetItem(cacheKey, JSON.stringify([order, ...filtered].slice(0, 200)));
  } catch {
    // ignore local cache update issue
  }

  const [okPublic, okEntity] = await Promise.all([
    insertOrUpdateCloudStoreKey(publicOrderKey, order),
    insertOrUpdateCloudStoreKey(tenantEntityKey, order),
  ]);
  return okPublic || okEntity;
}

export async function fetchPublicCatalogOrderFromSupabase(
  orderId: string,
  tenantIdHint?: string
): Promise<CatalogPickupOrder | null> {
  const cleanId = (orderId || '').trim();
  if (!cleanId || !tenantIdHint) return null;
  return getPublicEntity<CatalogPickupOrder>('catalog_orders', tenantIdHint, cleanId);
}

export async function createCatalogOrderMercadoPagoPreference(params: {
  order: CatalogPickupOrder;
  catalogHandle: string;
  mpSubOption: 'dinero_en_cuenta' | 'tarjetas_todos';
  originUrl?: string;
}): Promise<{
  ok: boolean;
  mode?: 'mercadopago_api' | 'checkout_link' | 'alias_checkout';
  initPoint?: string;
  sandboxInitPoint?: string;
  preferenceId?: string;
  fallbackReason?: string;
  error?: string;
}> {
  const { order, catalogHandle, mpSubOption, originUrl } = params;
  const safeOrigin =
    originUrl && /^https?:\/\//i.test(originUrl)
      ? originUrl.split('?')[0]
      : typeof window !== 'undefined' && /^https?:\/\//i.test(window.location.href)
      ? window.location.href.split('?')[0]
      : '';

  // 1. Intentar vía backend Express (/api/catalog/mp-create-preference)
  try {
    const res = await fetch('/api/catalog/mp-create-preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        orderNumber: order.orderNumber,
        tenantId: order.tenantId,
        storeName: order.storeName,
        customerName: order.customerName,
        amount: order.totalAmount,
        items: order.items.map((it) => ({
          id: it.productId,
          title: it.productName,
          quantity: it.quantity,
          unit_price: it.unitPrice,
        })),
        catalogHandle,
        mpSubOption,
        returnUrl: safeOrigin,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok && data?.initPoint) {
        return {
          ok: true,
          mode: 'mercadopago_api',
          initPoint: data.initPoint,
          sandboxInitPoint: data.sandboxInitPoint,
          preferenceId: data.preferenceId,
        };
      }
    }
  } catch {
    // Fallback to Supabase Edge Function below
  }

  // 2. Intentar vía Supabase Edge Function (mp-create-preference con scope catalog_order)
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('mp-create-preference', {
        body: {
          scope: 'catalog_order',
          orderId: order.id,
          tenantId: order.tenantId,
          catalogHandle,
          mpSubOption,
          returnUrl: safeOrigin,
        },
      });
      if (!error && data?.ok && data?.initPoint) {
        return {
          ok: true,
          mode: 'mercadopago_api',
          initPoint: data.initPoint,
          sandboxInitPoint: data.sandboxInitPoint,
          preferenceId: data.preferenceId,
        };
      }
      return {
        ok: false,
        fallbackReason: data?.fallbackReason || (error ? 'edge_invoke_error' : 'missing_access_token'),
        error: data?.error,
      };
    } catch {
      return { ok: false, fallbackReason: 'edge_invoke_exception' };
    }
  }

  return { ok: false, fallbackReason: 'missing_access_token' };
}

export async function verifyCatalogOrderMercadoPagoPayment(params: {
  orderId: string;
  tenantId: string;
  paymentId?: string;
  collectionStatus?: string;
  mpSubOption?: 'dinero_en_cuenta' | 'tarjetas_todos';
}): Promise<{
  verified: boolean;
  status?: string;
  order?: CatalogPickupOrder;
  message?: string;
}> {
  const { orderId, tenantId, paymentId, collectionStatus, mpSubOption } = params;

  try {
    const res = await fetch('/api/catalog/mp-verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        tenantId,
        paymentId,
        collectionStatus,
        mpSubOption,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.verified) {
        return { verified: true, status: 'approved', order: data.order, message: data.message };
      }
    }
  } catch {
    // Try Supabase Edge Function next
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('mp-verify-payment', {
        body: {
          scope: 'catalog_order',
          orderId,
          tenantId,
          paymentId,
          mpSubOption,
        },
      });
      if (!error && data?.verified) {
        return { verified: true, status: 'approved', order: data.order };
      }
      if (data?.message) {
        return { verified: false, status: data.status, message: data.message };
      }
    } catch {
      // ignore
    }
  }

  // Fallback si Mercado Pago redirigió con collectionStatus === 'approved' sin API en preview local
  if (collectionStatus === 'approved') {
    const existing = await fetchPublicCatalogOrderFromSupabase(orderId, tenantId);
    if (existing) {
      const nextMethod =
        existing.mpSubOption === 'dinero_en_cuenta' || mpSubOption === 'dinero_en_cuenta'
          ? 'mercadopago_dinero_cuenta'
          : 'link_pago';
      const updated: CatalogPickupOrder = {
        ...existing,
        paymentStatus: 'acreditado',
        confirmedPaymentMethod: nextMethod,
        mpPaymentId: paymentId || existing.mpPaymentId,
        updatedAt: new Date().toISOString(),
      };
      await syncCatalogOrderToSupabase(updated);
      return { verified: true, status: 'approved', order: updated };
    }
  }

  return { verified: false };
}

export async function notifyCatalogOrderCustomerStageViaServer(params: {
  order: CatalogPickupOrder;
  stage: 'en_proceso_armando' | 'listo_para_retirar' | 'en_camino' | 'retirado';
  message: string;
  config?: {
    whatsappProvider?: string;
    whatsappApiToken?: string;
    whatsappPhoneNumberId?: string;
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    twilioFromPhone?: string;
    webhookGatewayUrl?: string;
    webhookAuthKey?: string;
  };
}): Promise<{
  success: boolean;
  deliveryStatus?: string;
  info?: string;
}> {
  const { order, stage, message, config } = params;
  if (!order?.customerPhone?.trim() || !message.trim()) {
    return { success: false, info: 'Sin teléfono de cliente' };
  }
  try {
    const res = await fetch('/api/catalog/notify-customer-stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: order.tenantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        stage,
        message,
        ...(config ? { whatsappConfig: config } : {}),
      }),
    });
    if (!res.ok) {
      return { success: false, info: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      success: Boolean(data?.success),
      deliveryStatus: data?.deliveryStatus,
      info: data?.info,
    };
  } catch {
    return { success: false, info: 'Servidor no disponible' };
  }
}

export async function testMerchantMercadoPagoConnection(params: {
  tenantId: string;
  mpAccessToken?: string;
}): Promise<{
  ok: boolean;
  valid: boolean;
  hasSavedToken?: boolean;
  account?: {
    id?: number | string;
    nickname?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    siteId?: string;
  };
  webhookUrls?: {
    serverWebhookUrl?: string;
    supabaseWebhookUrl?: string;
  };
  error?: string;
}> {
  try {
    const res = await fetch('/api/merchant/mp-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: params.tenantId,
        ...(params.mpAccessToken?.trim()
          ? { mpAccessToken: params.mpAccessToken.trim() }
          : {}),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!data) {
      return {
        ok: false,
        valid: false,
        error: 'El servidor backend de pruebas no respondió en esta vista.',
      };
    }
    return data;
  } catch {
    return {
      ok: false,
      valid: false,
      error: 'No se pudo conectar con el servidor para probar las credenciales de Mercado Pago.',
    };
  }
}

export async function notifyCatalogStockAlertViaServer(params: {
  alert: CatalogStockAlertRequest;
  message: string;
}): Promise<{ success: boolean; deliveryStatus?: string; info?: string }> {
  if (!params.alert?.customerPhone?.trim() || !params.message.trim()) {
    return { success: false, info: 'Sin teléfono del cliente' };
  }
  try {
    const res = await fetch('/api/catalog/notify-stock-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alertId: params.alert.id,
        tenantId: params.alert.tenantId,
        customerPhone: params.alert.customerPhone,
        message: params.message,
      }),
    });
    if (!res.ok) return { success: false, info: `HTTP ${res.status}` };
    const data = await res.json();
    return {
      success: Boolean(data?.success),
      deliveryStatus: data?.deliveryStatus,
      info: data?.info,
    };
  } catch {
    return { success: false, info: 'Servidor no disponible' };
  }
}

export async function verifyCatalogTransferReceiptViaServer(params: {
  tenantId: string;
  orderId: string;
  orderNumber: string;
  storeName: string;
  expectedAmount: number;
  alias?: string;
  cvu?: string;
  holderName?: string;
  imageBase64: string;
  knownUsedOperationIds?: Array<{ orderId: string; operationId: string }>;
}): Promise<{
  success: boolean;
  approved: boolean;
  duplicate?: boolean;
  operationId?: string;
  detectedAmount?: number;
  platform?: string;
  verificationSummary?: string;
  verifiedAt?: string;
  message?: string;
}> {
  try {
    const res = await fetch('/api/catalog/verify-transfer-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => null);
    if (!data) {
      return {
        success: false,
        approved: false,
        message: 'No se pudo conectar con el verificador automático de comprobantes.',
      };
    }
    return {
      success: Boolean(data.success),
      approved: Boolean(data.approved),
      duplicate: Boolean(data.duplicate),
      operationId: data.operationId,
      detectedAmount: data.detectedAmount,
      platform: data.platform,
      verificationSummary: data.verificationSummary,
      verifiedAt: data.verifiedAt,
      message: data.message,
    };
  } catch {
    return {
      success: false,
      approved: false,
      message: 'Servicio de verificación momentáneamente no disponible.',
    };
  }
}

export async function submitCatalogPromoSubscriberToSupabase(
  subscriber: CatalogPromoSubscriber
): Promise<boolean> {
  if (!subscriber?.id || !subscriber?.tenantId) return false;
  const publicKey = `catalog_promo_sub_${subscriber.id}`;
  const tenantEntityKey = `rec:${subscriber.tenantId}:catalogPromoSubscribers:${subscriber.id}`;

  try {
    const cacheKey = `public_promo_subs_cache_${subscriber.tenantId}`;
    const raw = dbGetItem(cacheKey);
    const existing: CatalogPromoSubscriber[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(existing)
      ? existing.filter((s) => s.id !== subscriber.id)
      : [];
    dbSetItem(cacheKey, JSON.stringify([subscriber, ...filtered].slice(0, 500)));
  } catch {
    // ignore local cache write error
  }

  const [okPublic, okEntity] = await Promise.all([
    insertOrUpdateCloudStoreKey(publicKey, subscriber),
    insertOrUpdateCloudStoreKey(tenantEntityKey, subscriber),
  ]);
  return okPublic || okEntity;
}

export async function fetchCatalogPromoSubscribersForTenantFromSupabase(
  tenantId: string
): Promise<CatalogPromoSubscriber[]> {
  if (!tenantId) return [];
  return listBusinessEntities<CatalogPromoSubscriber>('catalog_promo_subscribers', tenantId, 1000);
}

export async function sendCatalogPromoWhatsAppViaServer(params: {
  subscriberId: string;
  customerPhone: string;
  message: string;
}): Promise<{ success: boolean; deliveryStatus?: string; info?: string }> {
  if (!params.customerPhone?.trim() || !params.message.trim()) {
    return { success: false, info: 'Sin teléfono del suscriptor' };
  }
  try {
    const res = await fetch('/api/catalog/send-promo-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) return { success: false, info: `HTTP ${res.status}` };
    const data = await res.json();
    return {
      success: Boolean(data?.success),
      deliveryStatus: data?.deliveryStatus,
      info: data?.info,
    };
  } catch {
    return { success: false, info: 'Servidor no disponible' };
  }
}

export async function fetchPublicCatalogLoyaltyAccountFromSupabase(
  tenantId: string,
  rawDni: string
): Promise<CatalogLoyaltyAccount | null> {
  const cleanDni = normalizeDni(rawDni);
  if (!tenantId || cleanDni.length < 6) return null;
  const found = await findPublicEntities<CatalogLoyaltyAccount>('catalog_loyalty_accounts', tenantId, cleanDni);
  return found.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0] || null;
}

export async function upsertCatalogLoyaltyAccountToSupabase(
  account: CatalogLoyaltyAccount
): Promise<boolean> {
  const cleanDni = normalizeDni(account.dni);
  if (!account?.tenantId || cleanDni.length < 6) return false;
  const normalizedAcc: CatalogLoyaltyAccount = {
    ...account,
    id: account.id || `lyl-${account.tenantId}-${cleanDni}`,
    dni: cleanDni,
    pointsBalance: Math.max(0, Math.floor(Number(account.pointsBalance) || 0)),
    totalPointsEarned: Math.max(0, Math.floor(Number(account.totalPointsEarned) || 0)),
    totalPointsRedeemed: Math.max(0, Math.floor(Number(account.totalPointsRedeemed) || 0)),
    storeCreditBalance: Math.max(0, Math.round((Number(account.storeCreditBalance) || 0) * 100) / 100),
    ordersCount: Math.max(0, Math.floor(Number(account.ordersCount) || 0)),
    updatedAt: account.updatedAt || new Date().toISOString(),
  };

  const publicKey = `catalog_loyalty_${normalizedAcc.tenantId}_${cleanDni}`;
  const tenantEntityKey = `rec:${normalizedAcc.tenantId}:catalogLoyaltyAccounts:${normalizedAcc.id}`;
  const cacheKey = `public_loyalty_cache_${normalizedAcc.tenantId}_${cleanDni}`;
  const indexKey = `public_loyalty_index_${normalizedAcc.tenantId}`;

  try {
    dbSetItem(cacheKey, JSON.stringify(normalizedAcc));
    const rawIdx = dbGetItem(indexKey);
    const prevIdx: string[] = rawIdx ? (JSON.parse(rawIdx) as string[]) : [];
    const nextIdx = Array.from(
      new Set([cleanDni, ...(Array.isArray(prevIdx) ? prevIdx : [])])
    );
    dbSetItem(indexKey, JSON.stringify(nextIdx));
  } catch {
    // ignore cache write error
  }

  const [okPublic, okEntity] = await Promise.all([
    insertOrUpdateCloudStoreKey(publicKey, normalizedAcc),
    insertOrUpdateCloudStoreKey(tenantEntityKey, normalizedAcc),
  ]);
  return okPublic || okEntity;
}

export async function fetchCatalogLoyaltyAccountsForTenantFromSupabase(
  tenantId: string
): Promise<CatalogLoyaltyAccount[]> {
  if (!tenantId) return [];
  return listBusinessEntities<CatalogLoyaltyAccount>('catalog_loyalty_accounts', tenantId, 1000);
}

// ============================================================================
// #1 — CARRITOS ABANDONADOS (CAPTURA Y RECUPERO POR WHATSAPP)
// ============================================================================

export async function upsertPublicAbandonedCartToSupabase(
  cart: CatalogAbandonedCart
): Promise<boolean> {
  if (!cart?.id || !cart?.tenantId) return false;
  const publicKey = `catalog_abandoned_cart_${cart.id}`;
  const tenantEntityKey = `rec:${cart.tenantId}:catalogAbandonedCarts:${cart.id}`;
  const cacheKey = `public_abandoned_carts_cache_${cart.tenantId}`;

  try {
    const raw = dbGetItem(cacheKey);
    const existing: CatalogAbandonedCart[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(existing) ? existing.filter((c) => c.id !== cart.id) : [];
    dbSetItem(cacheKey, JSON.stringify([cart, ...filtered].slice(0, 250)));
  } catch {
    // ignore cache error
  }

  const [okPublic, okEntity] = await Promise.all([
    insertOrUpdateCloudStoreKey(publicKey, cart),
    insertOrUpdateCloudStoreKey(tenantEntityKey, cart),
  ]);
  return okPublic || okEntity;
}

export async function fetchPublicAbandonedCartByIdFromSupabase(
  cartId: string,
  tenantIdHint?: string
): Promise<CatalogAbandonedCart | null> {
  const cleanId = (cartId || '').trim();
  if (!cleanId || !tenantIdHint) return null;
  return getPublicEntity<CatalogAbandonedCart>('catalog_abandoned_carts', tenantIdHint, cleanId);
}

export async function fetchCatalogAbandonedCartsForTenantFromSupabase(
  tenantId: string
): Promise<CatalogAbandonedCart[]> {
  if (!tenantId) return [];
  return listBusinessEntities<CatalogAbandonedCart>('catalog_abandoned_carts', tenantId, 500);
}

// ============================================================================
// #3 — GIFT CARDS Y VOUCHERS DIGITALES CON CÓDIGO Y QR
// ============================================================================

export function normalizeGiftCardCode(rawCode: string): string {
  return String(rawCode || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export async function upsertCatalogGiftCardToSupabase(
  giftCard: CatalogGiftCard
): Promise<boolean> {
  const cleanCode = normalizeGiftCardCode(giftCard.code);
  if (!giftCard?.tenantId || !cleanCode) return false;

  const normalized: CatalogGiftCard = {
    ...giftCard,
    code: cleanCode,
    initialAmount: Math.max(0, Math.round((Number(giftCard.initialAmount) || 0) * 100) / 100),
    remainingBalance: Math.max(0, Math.round((Number(giftCard.remainingBalance) || 0) * 100) / 100),
    updatedAt: giftCard.updatedAt || new Date().toISOString(),
  };

  const publicKey = `catalog_gift_card_${normalized.tenantId}_${cleanCode}`;
  const tenantEntityKey = `rec:${normalized.tenantId}:catalogGiftCards:${normalized.id}`;
  const cacheKey = `public_gift_cards_cache_${normalized.tenantId}`;

  try {
    const raw = dbGetItem(cacheKey);
    const existing: CatalogGiftCard[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(existing)
      ? existing.filter((g) => g.id !== normalized.id && normalizeGiftCardCode(g.code) !== cleanCode)
      : [];
    dbSetItem(cacheKey, JSON.stringify([normalized, ...filtered].slice(0, 300)));
  } catch {
    // ignore cache error
  }

  const [okPublic, okEntity] = await Promise.all([
    insertOrUpdateCloudStoreKey(publicKey, normalized),
    insertOrUpdateCloudStoreKey(tenantEntityKey, normalized),
  ]);
  return okPublic || okEntity;
}

export async function fetchPublicGiftCardByCodeFromSupabase(
  tenantId: string,
  rawCode: string
): Promise<CatalogGiftCard | null> {
  const cleanCode = normalizeGiftCardCode(rawCode);
  if (!tenantId || cleanCode.length < 3) return null;
  const found = await findPublicEntities<CatalogGiftCard>('catalog_gift_cards', tenantId, cleanCode);
  return found[0] || null;
}

export async function fetchCatalogGiftCardsForTenantFromSupabase(
  tenantId: string
): Promise<CatalogGiftCard[]> {
  if (!tenantId) return [];
  return listBusinessEntities<CatalogGiftCard>('catalog_gift_cards', tenantId, 500);
}

// ============================================================================
// #6 — HISTORIAL DE COMPRAS POR DNI (RECOMPRA EN 1 CLIC)
// ============================================================================

export async function fetchPublicCatalogOrdersByDniFromSupabase(
  tenantId: string,
  rawDni: string
): Promise<CatalogPickupOrder[]> {
  const cleanDni = normalizeDni(rawDni);
  if (!tenantId || cleanDni.length < 6) return [];
  const found = await findPublicEntities<CatalogPickupOrder>('catalog_orders', tenantId, cleanDni);
  return found
    .filter((o) => o.status !== 'cancelado')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 8);
}

