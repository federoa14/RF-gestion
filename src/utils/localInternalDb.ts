/**
 * Almacenamiento de la app
 * -----------------------------------------------------------------------------
 * Desde la Fase 3 los datos viven en Supabase (tablas por comercio con RLS).
 * Este módulo mantiene en memoria lo que la app está usando y:
 *   · manda a Supabase todo lo que se guarda (vía supabaseSync),
 *   · guarda en el dispositivo solo preferencias locales (sesión, avisos cerrados),
 *   · lee la base vieja de IndexedDB ÚNICAMENTE para la importación única.
 */
import {
  flushSupabaseSync,
  hydrateForSession,
  importLegacyTenantDataIfMissing,
  isCloudSyncedKey,
  queueSupabaseDelete,
  queueSupabaseUpsert,
  refreshKeysFromSupabase,
  resetCloudSession,
  getCloudSession,
  type CloudSessionProfile,
} from './supabaseSync';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

const LEGACY_IDB_NAME = 'cobranzas_base_interna_v1';
const LEGACY_STORE_NAME = 'records';
const BACKUP_FORMAT = 'cobranzas_base_interna_backup_v1';
const LEGACY_IMPORT_DONE_KEY = 'rf_legacy_import_done_v1';

const memoryStore = new Map<string, string>();
let initPromise: Promise<void> | null = null;

const LEGACY_PREFIXES = ['distribuidora_', 'saas_', 'client_payment_links_'];

function isLegacyRelevantKey(key: string): boolean {
  return LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// Cachés temporales y datos sensibles: viven solo en memoria (ni nube ni dispositivo)
const MEMORY_ONLY_PREFIXES = [
  'distribuidora_', // claves de la versión de un solo comercio (pueden traer tokens de WhatsApp)
  'public_',
  'catalog_',
  'merchant_mp_token_',
  'client_payment_order_',
  'tenant_sub_pay_order_',
  'rec:',
];

function isMemoryOnlyKey(key: string): boolean {
  return MEMORY_ONLY_PREFIXES.some((p) => key.startsWith(p));
}

/** Claves que se guardan solo en este dispositivo (preferencias, sesión, avisos cerrados) */
function isDeviceKey(key: string): boolean {
  return !isCloudSyncedKey(key) && !isMemoryOnlyKey(key);
}

function readDeviceStorage(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeDeviceStorage(key: string, value: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Sin espacio o almacenamiento bloqueado: queda en memoria
  }
}

// -----------------------------------------------------------------------------
// Sesión de Supabase
// -----------------------------------------------------------------------------

export interface LoadedProfile extends CloudSessionProfile {
  username: string | null;
  fullName: string;
  phone: string | null;
  legacyUserId: string | null;
  active: boolean;
}

export async function loadProfileForUser(userId: string): Promise<LoadedProfile | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, business_id, role, username, full_name, email, phone, active, legacy_user_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    userId: data.id,
    role: data.role,
    businessId: data.business_id,
    email: data.email,
    username: data.username,
    fullName: data.full_name || '',
    phone: data.phone,
    legacyUserId: data.legacy_user_id,
    active: data.active !== false,
  };
}

/** Carga todos los datos del usuario que inició sesión */
export async function startCloudSession(profile: LoadedProfile): Promise<void> {
  await hydrateForSession(
    profile,
    (key, value) => memoryStore.set(key, value),
    (key) => dbGetItem(key)
  );
}

/** Cierra la sesión y borra de la memoria los datos del comercio */
export async function endCloudSession(): Promise<void> {
  try {
    await flushSupabaseSync();
  } catch {
    // si no hay conexión, la cola queda guardada para la próxima sesión
  }
  for (const key of Array.from(memoryStore.keys())) {
    if (isCloudSyncedKey(key)) memoryStore.delete(key);
  }
  resetCloudSession();
  await getSupabaseClient()?.auth.signOut().catch(() => null);
}

/**
 * Se llama antes de montar la app: si hay una sesión de Supabase guardada,
 * carga el perfil y los datos para entrar directo.
 */
export async function initInternalDatabase(options?: { deferCloudHydration?: boolean }): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isSupabaseConfigured() || options?.deferCloudHydration) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) {
        clearStoredSessionUser();
        return;
      }
      const profile = await loadProfileForUser(userId);
      if (!profile || !profile.active) {
        clearStoredSessionUser();
        await supabase.auth.signOut().catch(() => null);
        return;
      }
      await startCloudSession(profile);
    } catch (err) {
      console.error('[Supabase] No se pudieron cargar los datos al iniciar', err);
      startupError = err;
    }
  })();
  return initPromise;
}

let startupError: unknown = null;
export function getStartupError(): unknown {
  return startupError;
}

function clearStoredSessionUser(): void {
  memoryStore.delete('saas_distribuidoras_session_user_v2_zero');
  writeDeviceStorage('saas_distribuidoras_session_user_v2_zero', null);
}

export async function ensureCloudHydrated(): Promise<void> {
  // Las vistas públicas no cargan datos privados; al volver a la app se recarga.
  if (!getCloudSession()) {
    initPromise = null;
    await initInternalDatabase();
  }
}

// -----------------------------------------------------------------------------
// API de lectura/escritura que usa toda la app
// -----------------------------------------------------------------------------

export function applyExternalSyncedRecord(key: string, value: string): void {
  memoryStore.set(key, value);
}

export function deleteExternalSyncedRecord(key: string): void {
  memoryStore.delete(key);
}

export async function syncKeysFromCloud(keys: string[]): Promise<string[]> {
  return refreshKeysFromSupabase(keys, applyExternalSyncedRecord, dbGetItem);
}

export function dbGetItem(key: string): string | null {
  if (memoryStore.has(key)) return memoryStore.get(key) ?? null;
  if (isDeviceKey(key)) {
    const v = readDeviceStorage(key);
    if (v !== null) memoryStore.set(key, v);
    return v;
  }
  return null;
}

export function dbSetItem(key: string, value: string): void {
  memoryStore.set(key, value);
  if (isCloudSyncedKey(key)) {
    queueSupabaseUpsert(key, value);
  } else if (isDeviceKey(key)) {
    writeDeviceStorage(key, value);
  }
}

export function dbRemoveItem(key: string): void {
  memoryStore.delete(key);
  if (isCloudSyncedKey(key)) queueSupabaseDelete(key);
  else if (isDeviceKey(key)) writeDeviceStorage(key, null);
}

// -----------------------------------------------------------------------------
// Estado y respaldos
// -----------------------------------------------------------------------------

export interface InternalDbStatus {
  engine: 'Supabase';
  dbName: string;
  recordCount: number;
  usedBytes: number;
  quotaBytes: number | null;
  persisted: boolean;
}

export async function getInternalDatabaseStatus(): Promise<InternalDbStatus> {
  let approxBytes = 0;
  let records = 0;
  memoryStore.forEach((val, key) => {
    if (!isCloudSyncedKey(key)) return;
    approxBytes += (key.length + val.length) * 2;
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) records += parsed.length;
      else if (parsed && typeof parsed === 'object') {
        for (const v of Object.values(parsed)) if (Array.isArray(v)) records += v.length;
      }
    } catch {
      // ignore
    }
  });
  return {
    engine: 'Supabase',
    dbName: 'Supabase (nube)',
    recordCount: records,
    usedBytes: approxBytes,
    quotaBytes: null,
    persisted: true,
  };
}

/** Respaldo descargable con los datos que el usuario tiene cargados */
export function exportInternalDatabaseBackup(labelPrefix = 'Respaldo_Base_Interna'): {
  filename: string;
  jsonString: string;
  recordCount: number;
  sizeBytes: number;
} {
  const entries: Record<string, string> = {};
  memoryStore.forEach((value, key) => {
    if (isCloudSyncedKey(key) && key !== 'saas_distribuidoras_users_v2_zero') entries[key] = value;
  });
  const payload = {
    format: BACKUP_FORMAT,
    dbName: 'supabase',
    exportedAt: new Date().toISOString(),
    recordCount: Object.keys(entries).length,
    entries,
  };
  const jsonString = JSON.stringify(payload, null, 2);
  const dateTag = new Date().toISOString().split('T')[0];
  return {
    filename: `${labelPrefix}_${dateTag}.json`,
    jsonString,
    recordCount: Object.keys(entries).length,
    sizeBytes: new Blob([jsonString]).size,
  };
}

export function downloadInternalDatabaseBackup(labelPrefix?: string): {
  filename: string;
  recordCount: number;
  sizeBytes: number;
} {
  const backup = exportInternalDatabaseBackup(labelPrefix);
  const blob = new Blob([backup.jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backup.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
  return { filename: backup.filename, recordCount: backup.recordCount, sizeBytes: backup.sizeBytes };
}

/**
 * Importa un respaldo .json (de esta versión o de la anterior con IndexedDB).
 * Solo agrega lo que no existe en Supabase: nunca pisa datos más nuevos.
 */
export async function importInternalDatabaseBackup(rawJson: string): Promise<{
  success: boolean;
  importedCount: number;
  tenantsCount: number;
  usersCount: number;
  error?: string;
}> {
  const fail = (error: string) => ({ success: false, importedCount: 0, tenantsCount: 0, usersCount: 0, error });
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return fail('No se pudo leer el archivo JSON de respaldo.');
  }
  if (!parsed || parsed.format !== BACKUP_FORMAT || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) {
    return fail('El archivo seleccionado no es un respaldo válido.');
  }
  const session = getCloudSession();
  if (!session) return fail('Iniciá sesión para importar el respaldo.');
  try {
    const result = await importLegacyEntries(parsed.entries as Record<string, unknown>);
    if (result.tenantsCount === 0) {
      return fail('El respaldo no tiene datos de tu comercio.');
    }
    return { success: true, importedCount: result.inserted, tenantsCount: result.tenantsCount, usersCount: 0 };
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'No se pudo importar el respaldo.');
  }
}

async function importLegacyEntries(entries: Record<string, unknown>): Promise<{ inserted: number; tenantsCount: number }> {
  const session = getCloudSession();
  if (!session) throw new Error('Iniciá sesión para importar.');
  let inserted = 0;
  let tenantsCount = 0;
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value !== 'string' || !key.startsWith('saas_distribuidora_data_v2_')) continue;
    const businessId = key.slice('saas_distribuidora_data_v2_'.length);
    if (session.role !== 'superadmin' && businessId !== session.businessId) continue;
    let data: any;
    try {
      data = JSON.parse(value);
    } catch {
      continue;
    }
    const res = await importLegacyTenantDataIfMissing(businessId, data);
    inserted += res.inserted;
    tenantsCount += 1;
  }
  return { inserted, tenantsCount };
}

// -----------------------------------------------------------------------------
// Importación única desde la base vieja de este dispositivo (IndexedDB)
// -----------------------------------------------------------------------------

function readLegacyIndexedDb(): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) return resolve({});
    let settled = false;
    const done = (v: Record<string, string>) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    setTimeout(() => done({}), 3000);
    try {
      const req = window.indexedDB.open(LEGACY_IDB_NAME);
      req.onupgradeneeded = () => {
        // No existía: no hay nada que importar. Se cancela para no crear la base.
        req.transaction?.abort();
        done({});
      };
      req.onerror = () => done({});
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
          db.close();
          return done({});
        }
        const tx = db.transaction(LEGACY_STORE_NAME, 'readonly');
        const getAll = tx.objectStore(LEGACY_STORE_NAME).getAll();
        getAll.onsuccess = () => {
          const out: Record<string, string> = {};
          for (const rec of getAll.result || []) {
            if (rec && typeof rec.key === 'string' && typeof rec.value === 'string') out[rec.key] = rec.value;
          }
          db.close();
          done(out);
        };
        getAll.onerror = () => {
          db.close();
          done({});
        };
      };
    } catch {
      done({});
    }
  });
}

/** Datos viejos de este dispositivo (IndexedDB + localStorage) */
export async function readLegacyDeviceData(): Promise<Record<string, string>> {
  const fromIdb = await readLegacyIndexedDb();
  try {
    if (typeof window !== 'undefined') {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && isLegacyRelevantKey(k) && !(k in fromIdb)) {
          const v = window.localStorage.getItem(k);
          if (v !== null) fromIdb[k] = v;
        }
      }
    }
  } catch {
    // ignore
  }
  return fromIdb;
}

/** ¿Hay datos viejos del comercio en este dispositivo que todavía no se importaron? */
export async function hasPendingLegacyDeviceData(businessId: string | null): Promise<boolean> {
  if (!businessId || readDeviceStorage(`${LEGACY_IMPORT_DONE_KEY}_${businessId}`)) return false;
  const legacy = await readLegacyDeviceData();
  const raw = legacy[`saas_distribuidora_data_v2_${businessId}`];
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    return ['clients', 'boletas', 'paidBoletas', 'catalogProducts', 'catalogOrders'].some(
      (k) => Array.isArray(data?.[k]) && data[k].length > 0
    );
  } catch {
    return false;
  }
}

/** Sube a Supabase los datos viejos de este dispositivo sin pisar nada existente */
export async function importLegacyDeviceData(businessId: string): Promise<{ inserted: number }> {
  const legacy = await readLegacyDeviceData();
  const raw = legacy[`saas_distribuidora_data_v2_${businessId}`];
  if (!raw) return { inserted: 0 };
  const res = await importLegacyEntries({ [`saas_distribuidora_data_v2_${businessId}`]: raw });
  writeDeviceStorage(`${LEGACY_IMPORT_DONE_KEY}_${businessId}`, new Date().toISOString());
  return { inserted: res.inserted };
}

export function dismissLegacyDeviceImport(businessId: string): void {
  writeDeviceStorage(`${LEGACY_IMPORT_DONE_KEY}_${businessId}`, `dismissed-${new Date().toISOString()}`);
}

// -----------------------------------------------------------------------------
// Exportación CSV (sin cambios de comportamiento)
// -----------------------------------------------------------------------------

export function downloadTenantCsvBackup(tenantId?: string, companyName = 'Empresa'): {
  filename: string;
  rowCount: number;
} {
  const key = tenantId ? `saas_distribuidora_data_v2_${tenantId}` : '';
  const raw = key ? dbGetItem(key) : null;
  let boletas: any[] = [];
  let paidBoletas: any[] = [];
  let clients: any[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      boletas = Array.isArray(parsed?.boletas) ? parsed.boletas : [];
      paidBoletas = Array.isArray(parsed?.paidBoletas) ? parsed.paidBoletas : [];
      clients = Array.isArray(parsed?.clients) ? parsed.clients : [];
    } catch {
      // ignore
    }
  }

  const clientPhoneMap = new Map<string, string>();
  clients.forEach((c) => {
    if (c?.id) clientPhoneMap.set(String(c.id), String(c.phone || ''));
  });

  const escapeCsv = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const headers = [
    'Estado',
    'Numero Boleta',
    'Cliente',
    'Telefono',
    'Vendedor',
    'Fecha Venta',
    'Vencimiento',
    'Fecha Pago',
    'Monto Total',
    'Medio de Pago',
  ];

  const allRows = [...boletas, ...paidBoletas];
  const csvLines = [
    headers.join(','),
    ...allRows.map((b) =>
      [
        escapeCsv(b.status === 'paid' ? 'PAGADA' : 'PENDIENTE'),
        escapeCsv(b.boletaNumber),
        escapeCsv(b.clientName),
        escapeCsv(b.clientPhone || clientPhoneMap.get(String(b.clientId)) || ''),
        escapeCsv(b.salespersonName),
        escapeCsv(b.saleDate),
        escapeCsv(b.dueDate),
        escapeCsv(b.paidAt || ''),
        Number(b.amount || 0),
        escapeCsv(b.paymentMethod || ''),
      ].join(',')
    ),
  ];

  const content = '﻿' + csvLines.join('\n');
  const dateTag = new Date().toISOString().split('T')[0];
  const safeName = companyName.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32) || 'Cobranzas';
  const filename = `Respaldo_${safeName}_${dateTag}.csv`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);

  return { filename, rowCount: allRows.length };
}
