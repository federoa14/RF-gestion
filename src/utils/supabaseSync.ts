/**
 * Sincronización con Supabase (esquema v2: tablas por comercio + RLS).
 * ---------------------------------------------------------------------------
 * La app sigue trabajando con los mismos objetos de siempre (por ejemplo, todos
 * los datos de un comercio en una sola clave `saas_distribuidora_data_v2_<id>`).
 * Este módulo:
 *   1. Al iniciar sesión arma esos objetos leyendo las tablas de Supabase.
 *   2. Cuando la app guarda, compara contra lo último sincronizado y manda
 *      SOLO las filas que cambiaron (alta/modificación/baja).
 *   3. Si no hay conexión, deja los cambios en una cola persistente y reintenta
 *      con espera creciente; avisa el estado con el evento CLOUD_STATUS_EVENT.
 *   4. Escucha cambios en tiempo real para que dueño y vendedores vean lo mismo.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ClientPaymentOrder, PlatformUser, Tenant } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { syntheticEmailFor, isSyntheticEmail } from './authEmail';

export const SUPABASE_SYNC_EVENT = 'supabase-cloud-sync';
export const CLOUD_STATUS_EVENT = 'rf-cloud-status';

export type SupabaseSyncStatus = 'not_configured' | 'connected' | 'missing_table' | 'error';

export interface SupabaseSyncInfo {
  status: SupabaseSyncStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export type CloudConnectionState = 'ok' | 'saving' | 'offline' | 'error';

export interface CloudStatus {
  state: CloudConnectionState;
  pendingChanges: number;
  message: string | null;
  lastSyncedAt: string | null;
}

export interface CloudSessionProfile {
  userId: string;
  role: PlatformUser['role'];
  businessId: string | null;
  email: string | null;
}

const TENANT_DATA_PREFIX = 'saas_distribuidora_data_v2_';
const TENANTS_KEY = 'saas_distribuidoras_tenants_v2_zero';
const USERS_KEY = 'saas_distribuidoras_users_v2_zero';
const ANNOUNCEMENTS_KEY = 'saas_platform_announcements_v1';
const BILLING_KEY = 'saas_platform_billing_config_v1';
const SUPPORT_KEY = 'saas_platform_support_config_v1';
const VERIFIED_PAYMENTS_KEY = 'saas_verified_tenant_payments_v1';
const OUTBOX_STORAGE_KEY = 'rf_cloud_outbox_v1';

/** Colecciones del objeto del comercio → tabla de Supabase */
const COLLECTION_TABLES: Record<string, string> = {
  clients: 'clients',
  salespeople: 'salespeople',
  admins: 'administrators',
  broadcasts: 'broadcasts',
  autoLogs: 'dispatch_logs',
  rendiciones: 'rendiciones',
  catalogProducts: 'catalog_products',
  catalogOrders: 'catalog_orders',
  catalogStockAlerts: 'catalog_stock_alerts',
  catalogPromoSubscribers: 'catalog_promo_subscribers',
  catalogLoyaltyAccounts: 'catalog_loyalty_accounts',
  catalogAbandonedCarts: 'catalog_abandoned_carts',
  catalogGiftCards: 'catalog_gift_cards',
};
const TABLE_TO_COLLECTION: Record<string, string> = Object.fromEntries(
  Object.entries(COLLECTION_TABLES).map(([c, t]) => [t, c])
);
const KNOWN_TENANT_FIELDS = new Set([
  'config',
  'catalogSettings',
  'boletas',
  'paidBoletas',
  ...Object.keys(COLLECTION_TABLES),
]);
const BUSINESS_TABLES = ['boletas', ...Object.values(COLLECTION_TABLES)];

// Datos sensibles que nunca se guardan dentro de la configuración visible
const CONFIG_SECRET_FIELDS = [
  'merchantMpAccessToken',
  // Tokens viejos de WhatsApp: ahora viven solo en el servidor (business_secrets)
  'whatsappApiToken',
  'whatsappPhoneNumberId',
  'twilioAccountSid',
  'twilioAuthToken',
  'twilioFromPhone',
  'webhookGatewayUrl',
  'webhookAuthKey',
];

// -----------------------------------------------------------------------------
// Estado
// -----------------------------------------------------------------------------

let session: CloudSessionProfile | null = null;
let hydrated = false;
let applyLocal: ((key: string, value: string) => void) | null = null;
let readLocal: ((key: string) => string | null) | null = null;

const syncInfo: SupabaseSyncInfo = {
  status: isSupabaseConfigured() ? 'connected' : 'not_configured',
  lastSyncedAt: null,
  lastError: null,
};

const cloudStatus: CloudStatus = {
  state: 'ok',
  pendingChanges: 0,
  message: null,
  lastSyncedAt: null,
};

/** Última versión sincronizada de cada fila: "tabla|pk" → JSON */
const baseline = new Map<string, string>();
/** Usuarios: id visible en la app → id de Supabase Auth */
const userAuthIds = new Map<string, string>();
/** Comercios: id → código (para mostrar en usuarios) */
const businessCodes = new Map<string, string>();

function rowKey(table: string, pk: string): string {
  return `${table}|${pk}`;
}

function emitStatus(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CLOUD_STATUS_EVENT, { detail: { ...cloudStatus } }));
}

function setStatus(patch: Partial<CloudStatus>): void {
  Object.assign(cloudStatus, patch);
  emitStatus();
}

export function getCloudStatus(): CloudStatus {
  return { ...cloudStatus };
}

export function getSupabaseSyncInfo(): SupabaseSyncInfo {
  return { ...syncInfo };
}

export function isCloudHydrated(): boolean {
  return hydrated;
}

export function getCloudSession(): CloudSessionProfile | null {
  return session;
}

export function getAuthUserIdForPlatformUser(platformUserId: string): string | undefined {
  return userAuthIds.get(platformUserId);
}

/** Claves que viven en Supabase (el resto queda solo en este dispositivo) */
export function isCloudSyncedKey(key: string): boolean {
  if (!key) return false;
  return (
    key.startsWith(TENANT_DATA_PREFIX) ||
    key === TENANTS_KEY ||
    key === USERS_KEY ||
    key === ANNOUNCEMENTS_KEY ||
    key === BILLING_KEY ||
    key === SUPPORT_KEY ||
    key === VERIFIED_PAYMENTS_KEY
  );
}

function parseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Traduce errores técnicos a mensajes claros */
export function describeCloudError(err: unknown): string {
  const e = err as { message?: string; code?: string; status?: number } | null;
  const msg = (e?.message || String(err || '')).toLowerCase();
  if (!navigatorOnline() || msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) {
    return 'Sin conexión a internet. Los cambios se guardan cuando vuelva la conexión.';
  }
  if (e?.status === 401 || msg.includes('jwt') || msg.includes('not authenticated')) {
    return 'Tu sesión venció. Volvé a iniciar sesión para seguir guardando.';
  }
  if (e?.code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) {
    return 'No tenés permiso para hacer este cambio.';
  }
  if (e?.code === '23505') return 'Ya existe un registro con esos datos (código o nombre repetido).';
  if (e?.message) return `No se pudo guardar: ${e.message}`;
  return 'No se pudo conectar con el servidor. Reintentando…';
}

function navigatorOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

function isRetryable(err: unknown): boolean {
  const e = err as { message?: string; code?: string; status?: number } | null;
  if (!navigatorOnline()) return true;
  const msg = (e?.message || String(err || '')).toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed') || msg.includes('timeout')) {
    return true;
  }
  if (e?.status && (e.status >= 500 || e.status === 429 || e.status === 408)) return true;
  if (e?.status === 401 || msg.includes('jwt')) return true; // se intenta refrescar la sesión
  return false;
}

// -----------------------------------------------------------------------------
// Lectura paginada
// -----------------------------------------------------------------------------

async function fetchAll<T = any>(
  table: string,
  columns: string,
  filter?: { column: string; value: string }
): Promise<T[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (filter) query = query.eq(filter.column, filter.value);
    const { data, error } = await query;
    if (error) throw error;
    out.push(...((data || []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, Math.min(8000, 700 * 2 ** i)));
    }
  }
  throw lastErr;
}

// -----------------------------------------------------------------------------
// Armado de objetos (tablas → objetos de la app)
// -----------------------------------------------------------------------------

function sortForDisplay(items: any[]): any[] {
  const stamp = (x: any) => String(x?.createdAt || x?.timestamp || x?.saleDate || x?.date || '');
  return items.sort((a, b) => stamp(b).localeCompare(stamp(a)));
}

async function buildTenantData(businessId: string): Promise<Record<string, any>> {
  const supabase = getSupabaseClient();
  if (!supabase) return {};
  const [settingsRes, ...tableRows] = await Promise.all([
    supabase.from('business_settings').select('config, catalog_settings, extra').eq('business_id', businessId).maybeSingle(),
    ...BUSINESS_TABLES.map((t) =>
      fetchAll<{ id: string; data: any; archived?: boolean }>(
        t,
        t === 'boletas' ? 'id, data, archived' : 'id, data',
        { column: 'business_id', value: businessId }
      )
    ),
  ]);
  if (settingsRes.error) throw settingsRes.error;

  const settings = settingsRes.data || { config: {}, catalog_settings: null, extra: {} };
  const data: Record<string, any> = { ...(isPlainObject(settings.extra) ? settings.extra : {}) };
  data.config = settings.config || {};
  if (settings.catalog_settings) data.catalogSettings = settings.catalog_settings;
  baseline.set(
    rowKey('business_settings', businessId),
    JSON.stringify({ config: data.config, catalog_settings: settings.catalog_settings || null, extra: settings.extra || {} })
  );

  BUSINESS_TABLES.forEach((table, idx) => {
    const rows = tableRows[idx];
    if (table === 'boletas') {
      const pending: any[] = [];
      const paid: any[] = [];
      for (const r of rows) {
        (r.archived ? paid : pending).push(r.data);
        baseline.set(rowKey('boletas', `${businessId}|${r.id}`), JSON.stringify({ data: r.data, archived: Boolean(r.archived) }));
      }
      data.boletas = sortForDisplay(pending);
      data.paidBoletas = sortForDisplay(paid);
    } else {
      const coll = TABLE_TO_COLLECTION[table];
      data[coll] = sortForDisplay(rows.map((r) => r.data));
      for (const r of rows) {
        baseline.set(rowKey(table, `${businessId}|${r.id}`), JSON.stringify({ data: r.data }));
      }
    }
  });
  return data;
}

function profileToPlatformUser(p: any): PlatformUser {
  const visibleId = p.legacy_user_id || p.id;
  userAuthIds.set(visibleId, p.id);
  return {
    id: visibleId,
    username: p.username || (p.email ? String(p.email).split('@')[0] : ''),
    password: '',
    fullName: p.full_name || '',
    email: p.email && !isSyntheticEmail(p.email) ? p.email : '',
    phone: p.phone || '',
    role: p.role,
    tenantId: p.business_id || (p.role === 'superadmin' ? 'all' : undefined),
    tenantCode: p.business_id ? businessCodes.get(p.business_id) || undefined : p.role === 'superadmin' ? 'MASTER' : undefined,
    createdAt: String(p.created_at || '').slice(0, 10),
    active: p.active !== false,
  };
}

function userBaselineValue(u: PlatformUser): string {
  return JSON.stringify({
    username: u.username || '',
    fullName: u.fullName || '',
    email: u.email || '',
    phone: u.phone || '',
    role: u.role,
    tenantId: u.tenantId || '',
    active: u.active !== false,
  });
}

/**
 * Carga todo lo que el usuario puede ver y lo deja disponible para la app.
 * El superadmin carga todos los comercios; el resto, solo el suyo.
 */
export async function hydrateForSession(
  profile: CloudSessionProfile,
  apply: (key: string, value: string) => void,
  read: (key: string) => string | null
): Promise<void> {
  session = profile;
  applyLocal = apply;
  readLocal = read;
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase no está configurado.');

  const isSuper = profile.role === 'superadmin';
  const businessFilter = !isSuper && profile.businessId ? { column: 'id', value: profile.businessId } : undefined;

  const [businesses, profiles, platformRows, announcementRows, payments] = await withRetry(() =>
    Promise.all([
      fetchAll<{ id: string; data: any; code: string | null }>('businesses', 'id, data, code', businessFilter),
      fetchAll<any>(
        'profiles',
        'id, business_id, role, username, full_name, email, phone, active, legacy_user_id, created_at'
      ),
      fetchAll<{ key: string; value: any }>('platform_settings', 'key, value'),
      fetchAll<{ id: string; data: any }>('announcements', 'id, data'),
      fetchAll<{ business_id: string; month_key: string; data: any }>(
        'subscription_payments',
        'business_id, month_key, data',
        !isSuper && profile.businessId ? { column: 'business_id', value: profile.businessId } : undefined
      ),
    ])
  );

  // Comercios
  businessCodes.clear();
  const tenants: Tenant[] = [];
  for (const b of businesses) {
    const tenant = { ...(b.data || {}), id: b.id } as Tenant;
    tenants.push(tenant);
    if (b.code) businessCodes.set(b.id, tenant.tenantCode || b.code);
    baseline.set(rowKey('businesses', b.id), JSON.stringify(tenant));
  }
  apply(TENANTS_KEY, JSON.stringify(tenants));

  // Usuarios (sin contraseñas: las maneja Supabase Auth)
  userAuthIds.clear();
  const users = profiles.map(profileToPlatformUser);
  users.forEach((u) => baseline.set(rowKey('profiles', u.id), userBaselineValue(u)));
  apply(USERS_KEY, JSON.stringify(users));

  // Plataforma
  const billing = platformRows.find((r) => r.key === 'billing');
  const support = platformRows.find((r) => r.key === 'support');
  if (billing) {
    apply(BILLING_KEY, JSON.stringify(billing.value));
    baseline.set(rowKey('platform_settings', 'billing'), JSON.stringify(billing.value));
  }
  if (support) {
    apply(SUPPORT_KEY, JSON.stringify(support.value));
    baseline.set(rowKey('platform_settings', 'support'), JSON.stringify(support.value));
  }
  const announcements = sortForDisplay(announcementRows.map((r) => ({ ...(r.data || {}), id: r.id })));
  announcements.forEach((a) => baseline.set(rowKey('announcements', a.id), JSON.stringify(a)));
  apply(ANNOUNCEMENTS_KEY, JSON.stringify(announcements));

  const paymentsMap: Record<string, any> = {};
  for (const p of payments) {
    paymentsMap[`${p.business_id}::${p.month_key}`] = p.data;
    baseline.set(rowKey('subscription_payments', `${p.business_id}::${p.month_key}`), JSON.stringify(p.data));
  }
  apply(VERIFIED_PAYMENTS_KEY, JSON.stringify(paymentsMap));

  // Datos de cada comercio
  const ids = isSuper ? businesses.map((b) => b.id) : profile.businessId ? [profile.businessId] : [];
  // En paralelo (de a pocos comercios a la vez) para que entrar no tarde más cuantos más comercios haya
  const TENANT_CONCURRENCY = 4;
  for (let i = 0; i < ids.length; i += TENANT_CONCURRENCY) {
    const batch = ids.slice(i, i + TENANT_CONCURRENCY);
    const results = await Promise.all(batch.map((id) => withRetry(() => buildTenantData(id))));
    batch.forEach((id, idx) => apply(`${TENANT_DATA_PREFIX}${id}`, JSON.stringify(results[idx])));
  }

  hydrated = true;
  syncInfo.status = 'connected';
  syncInfo.lastSyncedAt = new Date().toISOString();
  setStatus({ lastSyncedAt: syncInfo.lastSyncedAt });
  restoreOutbox();
  void flushSupabaseSync();
  startRealtime();
}

/** Compatibilidad: antes se hidrataba sin sesión; ahora la sesión es obligatoria */
export async function hydrateFromSupabase(): Promise<void> {
  /* La hidratación se hace en hydrateForSession después de iniciar sesión. */
}

/** Vuelve a leer del servidor algunas claves (por ejemplo al volver a la pestaña) */
export async function refreshKeysFromSupabase(
  keys: string[],
  apply: (key: string, value: string) => void,
  read: (key: string) => string | null
): Promise<string[]> {
  if (!session || !getSupabaseClient()) return [];
  await flushSupabaseSync();
  const changed: string[] = [];
  for (const key of keys) {
    try {
      if (key.startsWith(TENANT_DATA_PREFIX)) {
        const id = key.slice(TENANT_DATA_PREFIX.length);
        if (hasPendingFor((op) => op.businessId === id)) continue; // no pisar cambios sin guardar
        const data = await buildTenantData(id);
        const raw = JSON.stringify(data);
        if (raw !== read(key)) {
          apply(key, raw);
          changed.push(key);
        }
      } else if (key === TENANTS_KEY || key === USERS_KEY || key === BILLING_KEY || key === SUPPORT_KEY || key === ANNOUNCEMENTS_KEY) {
        if (hasPendingFor(() => true)) continue;
        const before = keys.map((k) => read(k));
        await hydrateForSessionLight(apply);
        if (keys.some((k, i) => read(k) !== before[i])) changed.push(key);
      }
    } catch (err) {
      syncInfo.lastError = describeCloudError(err);
    }
  }
  return Array.from(new Set(changed));
}

async function hydrateForSessionLight(apply: (key: string, value: string) => void): Promise<void> {
  if (!session) return;
  const isSuper = session.role === 'superadmin';
  const [businesses, profiles, platformRows, announcementRows] = await Promise.all([
    fetchAll<{ id: string; data: any; code: string | null }>(
      'businesses',
      'id, data, code',
      !isSuper && session.businessId ? { column: 'id', value: session.businessId } : undefined
    ),
    fetchAll<any>('profiles', 'id, business_id, role, username, full_name, email, phone, active, legacy_user_id, created_at'),
    fetchAll<{ key: string; value: any }>('platform_settings', 'key, value'),
    fetchAll<{ id: string; data: any }>('announcements', 'id, data'),
  ]);
  const tenants = businesses.map((b) => {
    if (b.code) businessCodes.set(b.id, b.data?.tenantCode || b.code);
    const t = { ...(b.data || {}), id: b.id };
    baseline.set(rowKey('businesses', b.id), JSON.stringify(t));
    return t;
  });
  apply(TENANTS_KEY, JSON.stringify(tenants));
  const users = profiles.map(profileToPlatformUser);
  users.forEach((u) => baseline.set(rowKey('profiles', u.id), userBaselineValue(u)));
  apply(USERS_KEY, JSON.stringify(users));
  for (const r of platformRows) {
    const key = r.key === 'billing' ? BILLING_KEY : SUPPORT_KEY;
    baseline.set(rowKey('platform_settings', r.key), JSON.stringify(r.value));
    apply(key, JSON.stringify(r.value));
  }
  const ann = sortForDisplay(announcementRows.map((r) => ({ ...(r.data || {}), id: r.id })));
  ann.forEach((a) => baseline.set(rowKey('announcements', a.id), JSON.stringify(a)));
  apply(ANNOUNCEMENTS_KEY, JSON.stringify(ann));
}

/** Limpia todo al cerrar sesión */
export function resetCloudSession(): void {
  session = null;
  hydrated = false;
  baseline.clear();
  userAuthIds.clear();
  businessCodes.clear();
  stopRealtime();
}

// -----------------------------------------------------------------------------
// Cola de cambios (outbox) con reintentos
// -----------------------------------------------------------------------------

type OutboxOp =
  | { id: string; kind: 'upsert'; table: string; pk: string; row: Record<string, any>; businessId?: string; attempts: number }
  | { id: string; kind: 'delete'; table: string; pk: string; match: Record<string, string>; businessId?: string; attempts: number }
  | { id: string; kind: 'rpc'; fn: string; args: Record<string, any>; pk: string; businessId?: string; attempts: number }
  | { id: string; kind: 'admin_user'; payload: Record<string, any>; pk: string; attempts: number; businessId?: string };

let outbox: OutboxOp[] = [];
let flushing: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingRaw = new Map<string, string>();

function persistOutbox(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(outbox));
    }
  } catch {
    // Si no entra en localStorage, la cola sigue en memoria
  }
  cloudStatus.pendingChanges = outbox.length;
}

function restoreOutbox(): void {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage?.getItem(OUTBOX_STORAGE_KEY) : null;
    const saved = parseJson<OutboxOp[]>(raw);
    if (Array.isArray(saved) && saved.length > 0) {
      // Solo se reintentan cambios del mismo comercio de la sesión actual
      const allowed = saved.filter(
        (op) => session?.role === 'superadmin' || !op.businessId || op.businessId === session?.businessId
      );
      for (const op of allowed) enqueue(op, false);
    }
  } catch {
    // ignorar cola corrupta
  }
}

function hasPendingFor(pred: (op: OutboxOp) => boolean): boolean {
  return outbox.some(pred) || pendingRaw.size > 0;
}

function enqueue(op: OutboxOp, persist = true): void {
  // Un solo cambio pendiente por fila: el último gana
  const key = op.kind === 'admin_user' ? `admin|${op.pk}|${Date.now()}` : `${op.kind === 'rpc' ? op.fn : op.table}|${op.pk}`;
  if (op.kind === 'upsert' || op.kind === 'delete' || op.kind === 'rpc') {
    outbox = outbox.filter((o) => {
      if (o.kind === 'admin_user') return true;
      const k = `${o.kind === 'rpc' ? o.fn : o.table}|${o.pk}`;
      return k !== key;
    });
  }
  outbox.push(op);
  if (persist) persistOutbox();
  cloudStatus.pendingChanges = outbox.length;
}

function newOpId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** La app guardó una clave: se calculan los cambios y se encolan (con una pequeña espera) */
export function queueSupabaseUpsert(key: string, rawValue: string): void {
  if (!isCloudSyncedKey(key) || !session) return;
  pendingRaw.set(key, rawValue);
  const prev = debounceTimers.get(key);
  if (prev) clearTimeout(prev);
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      const raw = pendingRaw.get(key);
      pendingRaw.delete(key);
      if (raw !== undefined) {
        try {
          diffAndEnqueue(key, raw);
        } catch (err) {
          setStatus({ state: 'error', message: describeCloudError(err) });
        }
        void flushSupabaseSync();
      }
    }, 350)
  );
}

export function queueSupabaseDelete(key: string): void {
  // Borrar una clave completa (por ejemplo, un comercio) se resuelve desde la lista de comercios.
  if (key.startsWith(TENANT_DATA_PREFIX)) pendingRaw.delete(key);
}

function diffAndEnqueue(key: string, raw: string): void {
  const value = parseJson(raw);
  if (value === null) return;
  if (key.startsWith(TENANT_DATA_PREFIX)) {
    diffTenantData(key.slice(TENANT_DATA_PREFIX.length), value);
  } else if (key === TENANTS_KEY) {
    diffTenants(value);
  } else if (key === USERS_KEY) {
    diffUsers(value);
    // Las contraseñas nuevas ya quedaron en la cola: se borran de la memoria
    if (Array.isArray(value) && value.some((u: any) => u?.password) && applyLocal) {
      applyLocal(USERS_KEY, JSON.stringify(value.map((u: any) => ({ ...u, password: '' }))));
    }
  } else if (key === ANNOUNCEMENTS_KEY) {
    diffSimpleList('announcements', value, (a) => ({ id: a.id, data: a }));
  } else if (key === BILLING_KEY || key === SUPPORT_KEY) {
    const settingKey = key === BILLING_KEY ? 'billing' : 'support';
    const clean = isPlainObject(value) ? { ...value } : {};
    if (settingKey === 'billing' && typeof clean.mpAccessToken === 'string') {
      const token = clean.mpAccessToken.trim();
      delete clean.mpAccessToken;
      if (token) enqueue({ id: newOpId(), kind: 'rpc', fn: 'set_platform_mp_token', args: { p_token: token }, pk: 'platform', attempts: 0 });
    }
    const json = JSON.stringify(clean);
    if (baseline.get(rowKey('platform_settings', settingKey)) !== json) {
      enqueue({ id: newOpId(), kind: 'upsert', table: 'platform_settings', pk: settingKey, row: { key: settingKey, value: clean }, attempts: 0 });
    }
  } else if (key === VERIFIED_PAYMENTS_KEY && isPlainObject(value)) {
    for (const [mapKey, rec] of Object.entries(value)) {
      const [bid, month] = mapKey.split('::');
      if (!bid || !month) continue;
      const json = JSON.stringify(rec);
      if (baseline.get(rowKey('subscription_payments', mapKey)) !== json) {
        enqueue({
          id: newOpId(),
          kind: 'upsert',
          table: 'subscription_payments',
          pk: mapKey,
          row: { business_id: bid, month_key: month, data: rec },
          businessId: bid,
          attempts: 0,
        });
      }
    }
  }
}

function diffTenantData(businessId: string, value: any): void {
  if (!isPlainObject(value)) return;
  const config = isPlainObject(value.config) ? { ...value.config } : {};
  for (const f of CONFIG_SECRET_FIELDS) delete config[f];
  const extra: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!KNOWN_TENANT_FIELDS.has(k)) extra[k] = v;
  }
  const settingsJson = JSON.stringify({ config, catalog_settings: value.catalogSettings || null, extra });
  if (baseline.get(rowKey('business_settings', businessId)) !== settingsJson) {
    enqueue({
      id: newOpId(),
      kind: 'upsert',
      table: 'business_settings',
      pk: businessId,
      row: { business_id: businessId, config, catalog_settings: value.catalogSettings || null, extra },
      businessId,
      attempts: 0,
    });
  }

  // Boletas: impagas + pagadas en una sola tabla
  const boletaRows = new Map<string, { data: any; archived: boolean }>();
  for (const b of Array.isArray(value.boletas) ? value.boletas : []) {
    if (b?.id) boletaRows.set(String(b.id), { data: b, archived: false });
  }
  for (const b of Array.isArray(value.paidBoletas) ? value.paidBoletas : []) {
    if (b?.id) boletaRows.set(String(b.id), { data: b, archived: true });
  }
  diffBusinessRows('boletas', businessId, boletaRows, (id, v) => ({
    business_id: businessId,
    id,
    data: v.data,
    archived: v.archived,
  }));

  for (const [coll, table] of Object.entries(COLLECTION_TABLES)) {
    const rows = new Map<string, { data: any }>();
    const list = Array.isArray(value[coll]) ? value[coll] : [];
    for (const item of list) {
      if (!isPlainObject(item)) continue;
      if (!item.id) item.id = `${coll}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      rows.set(String(item.id), { data: item });
    }
    diffBusinessRows(table, businessId, rows, (id, v) => ({ business_id: businessId, id, data: v.data }));
  }
}

function diffBusinessRows<V extends { data: any }>(
  table: string,
  businessId: string,
  current: Map<string, V>,
  toRow: (id: string, v: V) => Record<string, any>
): void {
  const prefix = `${table}|${businessId}|`;
  for (const [id, v] of current) {
    const json = JSON.stringify(table === 'boletas' ? v : { data: v.data });
    const k = rowKey(table, `${businessId}|${id}`);
    if (baseline.get(k) !== json) {
      enqueue({ id: newOpId(), kind: 'upsert', table, pk: `${businessId}|${id}`, row: toRow(id, v), businessId, attempts: 0 });
    }
  }
  for (const k of Array.from(baseline.keys())) {
    if (!k.startsWith(prefix)) continue;
    const id = k.slice(prefix.length);
    if (!current.has(id)) {
      enqueue({ id: newOpId(), kind: 'delete', table, pk: `${businessId}|${id}`, match: { business_id: businessId, id }, businessId, attempts: 0 });
    }
  }
}

function diffTenants(list: any): void {
  if (!Array.isArray(list)) return;
  const current = new Map<string, any>();
  for (const t of list) if (t?.id) current.set(String(t.id), t);
  for (const [id, t] of current) {
    const json = JSON.stringify(t);
    if (baseline.get(rowKey('businesses', id)) !== json) {
      const clean = { ...t, config: isPlainObject(t.config) ? { ...t.config } : t.config };
      if (isPlainObject(clean.config)) for (const f of CONFIG_SECRET_FIELDS) delete clean.config[f];
      enqueue({ id: newOpId(), kind: 'upsert', table: 'businesses', pk: id, row: { id, data: clean }, businessId: id, attempts: 0 });
    }
  }
  if (session?.role === 'superadmin') {
    for (const k of Array.from(baseline.keys())) {
      if (!k.startsWith('businesses|')) continue;
      const id = k.slice('businesses|'.length);
      if (!current.has(id)) {
        enqueue({ id: newOpId(), kind: 'delete', table: 'businesses', pk: id, match: { id }, businessId: id, attempts: 0 });
      }
    }
  }
}

function diffSimpleList(table: string, list: any, toRow: (item: any) => Record<string, any>): void {
  if (!Array.isArray(list)) return;
  const current = new Map<string, any>();
  for (const item of list) if (item?.id) current.set(String(item.id), item);
  for (const [id, item] of current) {
    if (baseline.get(rowKey(table, id)) !== JSON.stringify(item)) {
      enqueue({ id: newOpId(), kind: 'upsert', table, pk: id, row: toRow(item), attempts: 0 });
    }
  }
  for (const k of Array.from(baseline.keys())) {
    if (!k.startsWith(`${table}|`)) continue;
    const id = k.slice(table.length + 1);
    if (!current.has(id)) enqueue({ id: newOpId(), kind: 'delete', table, pk: id, match: { id }, attempts: 0 });
  }
}

function diffUsers(list: any): void {
  if (!Array.isArray(list)) return;
  const current = new Map<string, PlatformUser>();
  for (const u of list) if (u?.id) current.set(String(u.id), u);
  for (const [id, u] of current) {
    const authId = userAuthIds.get(id);
    const changedProfile = baseline.get(rowKey('profiles', id)) !== userBaselineValue(u);
    const newPassword = (u.password || '').trim();
    if (!authId) {
      enqueue({
        id: newOpId(),
        kind: 'admin_user',
        pk: id,
        attempts: 0,
        businessId: u.tenantId && u.tenantId !== 'all' ? u.tenantId : undefined,
        payload: {
          action: 'create',
          legacyUserId: id,
          email: u.email?.trim() || syntheticEmailFor(u.username, u.tenantCode),
          contactEmail: u.email?.trim() || null,
          password: newPassword,
          username: u.username,
          fullName: u.fullName,
          phone: u.phone,
          role: u.role,
          businessId: u.tenantId && u.tenantId !== 'all' ? u.tenantId : null,
          active: u.active !== false,
        },
      });
    } else if (changedProfile || newPassword) {
      enqueue({
        id: newOpId(),
        kind: 'admin_user',
        pk: id,
        attempts: 0,
        payload: {
          action: 'update',
          userId: authId,
          username: u.username,
          fullName: u.fullName,
          phone: u.phone,
          contactEmail: u.email?.trim() || null,
          role: u.role,
          businessId: u.tenantId && u.tenantId !== 'all' ? u.tenantId : null,
          active: u.active !== false,
          password: newPassword || undefined,
        },
      });
    }
  }
  for (const k of Array.from(baseline.keys())) {
    if (!k.startsWith('profiles|')) continue;
    const id = k.slice('profiles|'.length);
    const authId = userAuthIds.get(id);
    if (!current.has(id) && authId) {
      enqueue({ id: newOpId(), kind: 'admin_user', pk: id, attempts: 0, payload: { action: 'delete', userId: authId } });
    }
  }
}

function applyBaselineAfterSuccess(op: OutboxOp): void {
  if (op.kind === 'upsert') {
    if (op.table === 'business_settings') {
      baseline.set(rowKey(op.table, op.pk), JSON.stringify({ config: op.row.config, catalog_settings: op.row.catalog_settings, extra: op.row.extra }));
    } else if (op.table === 'boletas') {
      baseline.set(rowKey(op.table, op.pk), JSON.stringify({ data: op.row.data, archived: op.row.archived }));
    } else if (op.table === 'businesses' || op.table === 'announcements') {
      baseline.set(rowKey(op.table, op.pk), JSON.stringify(op.row.data));
    } else if (op.table === 'platform_settings') {
      baseline.set(rowKey(op.table, op.pk), JSON.stringify(op.row.value));
    } else if (op.table === 'subscription_payments') {
      baseline.set(rowKey(op.table, op.pk), JSON.stringify(op.row.data));
    } else {
      baseline.set(rowKey(op.table, op.pk), JSON.stringify({ data: op.row.data }));
    }
  } else if (op.kind === 'delete') {
    baseline.delete(rowKey(op.table, op.pk));
  }
}

const TABLE_CONFLICT: Record<string, string> = {
  businesses: 'id',
  business_settings: 'business_id',
  platform_settings: 'key',
  announcements: 'id',
  subscription_payments: 'business_id,month_key',
};

async function runOp(op: OutboxOp): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase no está configurado.');
  if (op.kind === 'upsert') {
    // Un comercio solo puede modificar su propia fila de `businesses` (la política de alta es solo del
    // superadmin y un upsert la evalúa aunque la fila exista): sin esto no se guardaba la aceptación
    // de términos, el cambio de plan ni el diseño del panel desde la cuenta del comercio.
    if (op.table === 'businesses' && session?.role !== 'superadmin') {
      const { error, status } = await supabase.from('businesses').update({ data: op.row.data }).eq('id', op.pk);
      if (error) throw Object.assign(error, { status });
      return;
    }
    const { error, status } = await supabase
      .from(op.table)
      .upsert(op.row, { onConflict: TABLE_CONFLICT[op.table] || 'business_id,id' });
    if (error) throw Object.assign(error, { status });
  } else if (op.kind === 'delete') {
    let q = supabase.from(op.table).delete();
    for (const [c, v] of Object.entries(op.match)) q = q.eq(c, v);
    const { error, status } = await q;
    if (error) throw Object.assign(error, { status });
  } else if (op.kind === 'rpc') {
    const { error, status } = await supabase.rpc(op.fn, op.args);
    if (error) throw Object.assign(error, { status });
  } else if (op.kind === 'admin_user') {
    const { data, error } = await supabase.functions.invoke('admin-users', { body: op.payload });
    if (error) {
      // Mensaje del servidor si lo hay
      let message = error.message;
      try {
        const ctx = (error as any).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          if (body?.error) message = body.error;
        }
      } catch {
        // ignore
      }
      throw Object.assign(new Error(message), { status: (error as any).context?.status });
    }
    if (op.payload.action === 'create' && data?.userId) {
      userAuthIds.set(String(op.pk), String(data.userId));
    }
    if (op.payload.action === 'delete') {
      userAuthIds.delete(String(op.pk));
      baseline.delete(rowKey('profiles', op.pk));
    } else {
      const u = parseJson<PlatformUser[]>(readLocal?.(USERS_KEY))?.find((x) => x.id === op.pk);
      if (u) baseline.set(rowKey('profiles', op.pk), userBaselineValue({ ...u, password: '' }));
    }
  }
}

/** Envía la cola. Reintenta solo los errores de conexión; avisa los demás. */
export async function flushSupabaseSync(): Promise<void> {
  // Primero vaciar las esperas pendientes
  for (const [key, timer] of Array.from(debounceTimers.entries())) {
    clearTimeout(timer);
    debounceTimers.delete(key);
    const raw = pendingRaw.get(key);
    pendingRaw.delete(key);
    if (raw !== undefined) {
      try {
        diffAndEnqueue(key, raw);
      } catch (err) {
        setStatus({ state: 'error', message: describeCloudError(err) });
      }
    }
  }
  if (flushing) return flushing;
  if (!session || outbox.length === 0) {
    if (outbox.length === 0 && cloudStatus.state === 'saving') setStatus({ state: 'ok', message: null, pendingChanges: 0 });
    return;
  }
  flushing = (async () => {
    setStatus({ state: 'saving', pendingChanges: outbox.length });
    let networkProblem: unknown = null;
    let rejected: unknown = null;
    while (outbox.length > 0) {
      const op = outbox[0];
      try {
        await runOp(op);
        outbox.shift();
        applyBaselineAfterSuccess(op);
        persistOutbox();
      } catch (err) {
        if (isRetryable(err)) {
          const e = err as { status?: number; message?: string };
          if (e?.status === 401 || String(e?.message || '').toLowerCase().includes('jwt')) {
            await getSupabaseClient()?.auth.refreshSession().catch(() => null);
          }
          op.attempts += 1;
          networkProblem = err;
          persistOutbox();
          break;
        }
        // Error de permisos o datos inválidos: no tiene sentido reintentar
        outbox.shift();
        persistOutbox();
        rejected = err;
        console.error('[Supabase] Cambio rechazado', op, err);
      }
    }
    if (networkProblem) {
      const attempts = outbox[0]?.attempts || 1;
      const delay = Math.min(60000, 1500 * 2 ** Math.min(attempts, 6));
      setStatus({
        state: navigatorOnline() ? 'error' : 'offline',
        pendingChanges: outbox.length,
        message: `${describeCloudError(networkProblem)} Próximo intento en ${Math.round(delay / 1000)} s.`,
      });
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void flushSupabaseSync();
      }, delay);
    } else if (rejected) {
      setStatus({ state: 'error', pendingChanges: outbox.length, message: describeCloudError(rejected) });
    } else {
      syncInfo.lastSyncedAt = new Date().toISOString();
      setStatus({ state: 'ok', pendingChanges: 0, message: null, lastSyncedAt: syncInfo.lastSyncedAt });
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Reintento manual desde el aviso de error */
export function retryCloudSyncNow(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  void flushSupabaseSync();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => retryCloudSyncNow());
  window.addEventListener('offline', () =>
    setStatus({ state: 'offline', message: 'Sin conexión a internet. Los cambios se guardan cuando vuelva la conexión.' })
  );
  window.addEventListener('beforeunload', (e) => {
    if (outbox.length > 0 || pendingRaw.size > 0) {
      e.preventDefault();
    }
  });
}

// -----------------------------------------------------------------------------
// Tiempo real
// -----------------------------------------------------------------------------

let realtimeChannel: RealtimeChannel | null = null;
const pendingEventKeys = new Set<string>();
let eventTimer: ReturnType<typeof setTimeout> | null = null;

function notifyApp(key: string): void {
  pendingEventKeys.add(key);
  if (eventTimer) return;
  eventTimer = setTimeout(() => {
    eventTimer = null;
    const keys = Array.from(pendingEventKeys);
    pendingEventKeys.clear();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SUPABASE_SYNC_EVENT, { detail: { keys } }));
    }
  }, 300);
}

function applyRemoteBusinessRow(table: string, eventType: string, row: any): void {
  if (!applyLocal || !readLocal) return;
  const businessId = row?.business_id;
  if (!businessId) return;
  const key = `${TENANT_DATA_PREFIX}${businessId}`;
  const data = parseJson<Record<string, any>>(readLocal(key));
  if (!data) return;
  const id = String(row.id ?? '');

  if (table === 'business_settings') {
    if (eventType === 'DELETE') return;
    data.config = row.config || {};
    if (row.catalog_settings) data.catalogSettings = row.catalog_settings;
    baseline.set(rowKey('business_settings', businessId), JSON.stringify({ config: row.config || {}, catalog_settings: row.catalog_settings || null, extra: row.extra || {} }));
  } else if (table === 'boletas') {
    data.boletas = (data.boletas || []).filter((b: any) => b?.id !== id);
    data.paidBoletas = (data.paidBoletas || []).filter((b: any) => b?.id !== id);
    if (eventType === 'DELETE') {
      baseline.delete(rowKey('boletas', `${businessId}|${id}`));
    } else {
      (row.archived ? data.paidBoletas : data.boletas).unshift(row.data);
      baseline.set(rowKey('boletas', `${businessId}|${id}`), JSON.stringify({ data: row.data, archived: Boolean(row.archived) }));
    }
  } else {
    const coll = TABLE_TO_COLLECTION[table];
    if (!coll) return;
    const list: any[] = Array.isArray(data[coll]) ? data[coll] : [];
    const idx = list.findIndex((x) => x?.id === id);
    if (eventType === 'DELETE') {
      if (idx >= 0) list.splice(idx, 1);
      baseline.delete(rowKey(table, `${businessId}|${id}`));
    } else {
      if (idx >= 0) list[idx] = row.data;
      else list.unshift(row.data);
      baseline.set(rowKey(table, `${businessId}|${id}`), JSON.stringify({ data: row.data }));
    }
    data[coll] = list;
  }
  const raw = JSON.stringify(data);
  if (raw !== readLocal(key)) {
    applyLocal(key, raw);
    notifyApp(key);
  }
}

function applyRemoteBusiness(eventType: string, row: any): void {
  if (!applyLocal || !readLocal || !row?.id) return;
  const list = parseJson<any[]>(readLocal(TENANTS_KEY)) || [];
  const idx = list.findIndex((t) => t?.id === row.id);
  if (eventType === 'DELETE') {
    if (idx >= 0) list.splice(idx, 1);
    baseline.delete(rowKey('businesses', row.id));
  } else {
    const tenant = { ...(row.data || {}), id: row.id };
    if (idx >= 0) list[idx] = tenant;
    else list.push(tenant);
    baseline.set(rowKey('businesses', row.id), JSON.stringify(tenant));
  }
  applyLocal(TENANTS_KEY, JSON.stringify(list));
  notifyApp(TENANTS_KEY);
}

function startRealtime(): void {
  const supabase = getSupabaseClient();
  if (!supabase || !session) return;
  stopRealtime();
  const filter = session.role !== 'superadmin' && session.businessId ? `business_id=eq.${session.businessId}` : undefined;
  let channel = supabase.channel(`rf-${session.userId}`);
  for (const table of ['business_settings', ...BUSINESS_TABLES]) {
    channel = channel.on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
      (payload: any) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        applyRemoteBusinessRow(table, payload.eventType, row);
      }
    );
  }
  channel = channel.on(
    'postgres_changes' as any,
    {
      event: '*',
      schema: 'public',
      table: 'businesses',
      ...(session.role !== 'superadmin' && session.businessId ? { filter: `id=eq.${session.businessId}` } : {}),
    },
    (payload: any) => applyRemoteBusiness(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new)
  );
  channel = channel.on('postgres_changes' as any, { event: '*', schema: 'public', table: 'announcements' }, () => {
    if (applyLocal) void hydrateForSessionLight(applyLocal).then(() => notifyApp(ANNOUNCEMENTS_KEY));
  });
  realtimeChannel = channel.subscribe();
}

function stopRealtime(): void {
  const supabase = getSupabaseClient();
  if (realtimeChannel && supabase) {
    void supabase.removeChannel(realtimeChannel);
  }
  realtimeChannel = null;
}

/** Compatibilidad con la firma anterior */
export function startSupabaseRealtimeSubscription(): void {
  if (session) startRealtime();
}

// -----------------------------------------------------------------------------
// Importación única de datos que quedaron solo en este dispositivo (IndexedDB)
// Inserta solo lo que NO existe en Supabase: nunca pisa datos más nuevos.
// -----------------------------------------------------------------------------

export async function importLegacyTenantDataIfMissing(
  businessId: string,
  legacyData: Record<string, any>
): Promise<{ inserted: number }> {
  const supabase = getSupabaseClient();
  if (!supabase || !session) throw new Error('Iniciá sesión para importar los datos.');
  let inserted = 0;
  const chunks = <T,>(arr: T[], size: number) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

  const boletaRows = [
    ...(Array.isArray(legacyData.boletas) ? legacyData.boletas : []).map((b: any) => ({ data: b, archived: false })),
    ...(Array.isArray(legacyData.paidBoletas) ? legacyData.paidBoletas : []).map((b: any) => ({ data: b, archived: true })),
  ]
    .filter((x) => x.data?.id)
    .map((x) => ({ business_id: businessId, id: String(x.data.id), data: x.data, archived: x.archived }));

  const jobs: Array<{ table: string; rows: any[] }> = [{ table: 'boletas', rows: boletaRows }];
  for (const [coll, table] of Object.entries(COLLECTION_TABLES)) {
    const list = Array.isArray(legacyData[coll]) ? legacyData[coll] : [];
    jobs.push({
      table,
      rows: list.filter((x: any) => x?.id).map((x: any) => ({ business_id: businessId, id: String(x.id), data: x })),
    });
  }

  for (const job of jobs) {
    for (const part of chunks(job.rows, 300)) {
      if (part.length === 0) continue;
      const { data, error } = await withRetry(async () => {
        const res = await supabase
          .from(job.table)
          .upsert(part, { onConflict: 'business_id,id', ignoreDuplicates: true })
          .select('id');
        if (res.error) throw res.error;
        return res;
      });
      if (error) throw error;
      inserted += data?.length || 0;
    }
  }

  // Ajustes: solo si el comercio todavía no tiene
  if (isPlainObject(legacyData.config)) {
    await supabase
      .from('business_settings')
      .upsert(
        { business_id: businessId, config: legacyData.config, catalog_settings: legacyData.catalogSettings || null },
        { onConflict: 'business_id', ignoreDuplicates: true }
      );
  }
  return { inserted };
}

// -----------------------------------------------------------------------------
// Links de pago a clientes
// -----------------------------------------------------------------------------

export async function saveClientPaymentOrderToSupabase(order: ClientPaymentOrder): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !order?.token || !order.tenantId) return;
  const { error } = await withRetry(async () => {
    const res = await supabase
      .from('payment_links')
      .upsert({ token: order.token, business_id: order.tenantId, data: order }, { onConflict: 'token' });
    if (res.error && isRetryable(res.error)) throw res.error;
    return res;
  });
  if (error) {
    // Si no es miembro del comercio (por ejemplo, el cliente que paga), se usa la función pública
    await supabase.rpc('public_payment_doc_patch', { p_kind: 'payment_link', p_token: order.token, p_patch: order });
  }
}

export async function fetchClientPaymentOrderFromSupabase(token: string): Promise<ClientPaymentOrder | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !token) return null;
  try {
    const { data } = await withRetry(async () => {
      const res = await supabase.rpc('public_payment_doc_get', { p_kind: 'payment_link', p_token: token });
      if (res.error) throw res.error;
      return res;
    });
    return (data as ClientPaymentOrder) || null;
  } catch {
    return null;
  }
}

export { BILLING_KEY, SUPPORT_KEY, VERIFIED_PAYMENTS_KEY, TENANT_DATA_PREFIX, TENANTS_KEY, USERS_KEY };
