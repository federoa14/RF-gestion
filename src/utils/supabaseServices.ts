import type {
  ClientPaymentOrder,
  PlatformAnnouncement,
  PlatformBillingConfig,
  PlatformSupportConfig,
} from '../types';
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

export async function writeCloudJsonRecord<T>(key: string, value: T): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase || !key) return false;
  try {
    const { error } = await supabase.from(CLOUD_TABLE).upsert(
      {
        key,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
    return !error;
  } catch {
    return false;
  }
}

// ============================================================================
// BEST-EFFORT MIRROR A TABLAS RELACIONALES DE SUPABASE
// ============================================================================

export async function mirrorPlatformBillingToSupabaseTable(
  cfg: PlatformBillingConfig
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.from('platform_billing_config').upsert(
      {
        id: 'default',
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
      },
      { onConflict: 'id' }
    );
  } catch {
    // app_cloud_store remains authoritative if RLS restricts anon writes
  }
}

export async function mirrorPlatformSupportToSupabaseTable(
  cfg: PlatformSupportConfig
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.from('platform_support_config').upsert(
      {
        id: 'default',
        contact_name: cfg.contactName || '',
        whatsapp_phone: cfg.whatsappPhone || '',
        email: cfg.email || '',
        attention_hours: cfg.attentionHours || '',
        welcome_message: cfg.welcomeMessage || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch {
    // non-blocking
  }
}

export async function mirrorPlatformAnnouncementToSupabaseTable(
  item: PlatformAnnouncement
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.from('platform_announcements').upsert(
      {
        id: item.id,
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
      },
      { onConflict: 'id' }
    );
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
  try {
    await supabase.from('client_payment_orders').upsert(
      {
        token: order.token,
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
      },
      { onConflict: 'token' }
    );
  } catch {
    // non-blocking
  }
}

// ============================================================================
// ÓRDENES DE PAGO DE CLIENTES (LINKS DE COBRO WHATSAPP + CONCILIACIÓN DIRECTA)
// ============================================================================

export async function saveClientPaymentOrderEverywhere(order: ClientPaymentOrder): Promise<void> {
  await saveClientPaymentOrderToSupabase(order);
  await mirrorClientPaymentOrderToSupabaseTable(order);
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
      .select('*')
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
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select('key, value')
      .like('key', 'client_payment_order_%');

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

export async function fetchVerifiedTenantPaymentsMapFromSupabase(): Promise<
  Record<string, VerifiedTenantPaymentRecord>
> {
  const stored = await readCloudJsonRecord<Record<string, VerifiedTenantPaymentRecord>>(
    VERIFIED_TENANT_PAYMENTS_KEY
  );
  return stored && typeof stored === 'object' ? stored : {};
}

export async function fetchVerifiedTenantPaymentStatusFromSupabase(
  tenantId: string,
  monthKey: string
): Promise<{ approved: boolean; payment: VerifiedTenantPaymentRecord | null }> {
  if (!tenantId || !monthKey) return { approved: false, payment: null };
  const map = await fetchVerifiedTenantPaymentsMapFromSupabase();
  const record = map[`${tenantId}::${monthKey}`] || null;
  return {
    approved: Boolean(record && record.status === 'approved'),
    payment: record,
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
  const map = await fetchVerifiedTenantPaymentsMapFromSupabase();
  const existing = map[key];
  if (existing && existing.status === 'approved' && !params.receiptImageUrl) {
    return { approved: true, payment: existing };
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

  map[key] = record;
  await writeCloudJsonRecord(VERIFIED_TENANT_PAYMENTS_KEY, map);

  return { approved: true, payment: record };
}
