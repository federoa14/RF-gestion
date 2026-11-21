import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ClientPaymentOrder } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

const CLOUD_TABLE = 'app_cloud_store';
export const SUPABASE_SYNC_EVENT = 'supabase-cloud-sync';

export type SupabaseSyncStatus = 'not_configured' | 'connected' | 'missing_table' | 'error';

export interface SupabaseSyncInfo {
  status: SupabaseSyncStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const syncInfo: SupabaseSyncInfo = {
  status: isSupabaseConfigured() ? 'connected' : 'not_configured',
  lastSyncedAt: null,
  lastError: null,
};

// Keys that stay strictly local per browser/device (active session, UI dismissals & unpartitioned scratch keys)
const DEVICE_ONLY_EXACT_KEYS = new Set([
  'saas_distribuidoras_session_user_v2_zero',
  'saas_distribuidoras_active_tenant_id_v2_zero',
  'saas_demo_seeds_purged_v1',
]);

const DEVICE_ONLY_PREFIXES = [
  'saas_dismissed_announcements_v1',
  'distribuidora_',
];

const CLOUD_SYNCED_PREFIXES = [
  'saas_distribuidoras_tenants_v2_zero',
  'saas_distribuidoras_users_v2_zero',
  'saas_distribuidora_data_v2_',
  'saas_platform_billing_config_v1',
  'saas_platform_support_config_v1',
  'saas_platform_announcements_v1',
  'saas_verified_tenant_payments_v1',
  'merchant_mp_token_',
  'client_payment_order_',
  'public_catalog_',
  'catalog_order_',
  'rec:',
];

const TENANT_DATA_PREFIX = 'saas_distribuidora_data_v2_';
const TENANTS_KEY = 'saas_distribuidoras_tenants_v2_zero';
const USERS_KEY = 'saas_distribuidoras_users_v2_zero';
const ANNOUNCEMENTS_KEY = 'saas_platform_announcements_v1';
const BILLING_KEY = 'saas_platform_billing_config_v1';
const SUPPORT_KEY = 'saas_platform_support_config_v1';
const VERIFIED_PAYMENTS_KEY = 'saas_verified_tenant_payments_v1';

export function isCloudSyncedKey(key: string): boolean {
  if (!key) return false;
  if (DEVICE_ONLY_EXACT_KEYS.has(key)) return false;
  if (DEVICE_ONLY_PREFIXES.some((p) => key.startsWith(p))) return false;
  return CLOUD_SYNCED_PREFIXES.some((p) => key.startsWith(p));
}

export function getSupabaseSyncInfo(): SupabaseSyncInfo {
  return { ...syncInfo };
}

let cloudHydratedFlag = false;
export function isCloudHydrated(): boolean {
  return cloudHydratedFlag;
}

function parseJsonSafely(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function serializeValueSafely(val: unknown): string {
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

function isNonEmptyBusinessValue(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length > 0;
    if (parsed && typeof parsed === 'object') return Object.keys(parsed).length > 0;
    return Boolean(parsed);
  } catch {
    return Boolean(raw && raw.trim());
  }
}

function isPlainObject(val: unknown): val is Record<string, any> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function handleSupabaseError(err: { code?: string; message?: string } | null): void {
  if (!err) return;
  const msg = String(err.message || '');
  if (err.code === '42P01' || msg.includes('does not exist') || msg.includes('Could not find the table')) {
    syncInfo.status = 'missing_table';
    syncInfo.lastError = 'Falta crear la tabla public.app_cloud_store (ejecutá supabase_bridge.sql).';
  } else {
    syncInfo.status = 'error';
    syncInfo.lastError = msg || 'Error de conexión con Supabase.';
  }
}

// ============================================================================
// BASELINE & EXPLICIT TOMBSTONE TRACKING (PREVIENE SOBRESCRITURA AL REMOTO)
// ============================================================================

// Baseline snapshot of what was last synchronized with Supabase per aggregate key
const syncedBaselineValues = new Map<string, string>();
// Individual entity snapshots last synchronized: entityKey -> serialized JSON
const syncedEntityCache = new Map<string, string>();
// Keys of individual entities explicitly deleted by the user during this session
const explicitDeletedEntityKeys = new Set<string>();

const pendingUpserts = new Map<string, string>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
let activeFlushPromise: Promise<void> | null = null;
const recentlyAppliedRemoteKeys = new Map<string, number>();

// Callback registered by localInternalDb so background merges can immediately update memoryStore + IDB
let externalApplyCallback: ((key: string, value: string) => void) | null = null;

function markRecentlyAppliedRemote(key: string): void {
  recentlyAppliedRemoteKeys.set(key, Date.now());
}

function wasJustAppliedRemotely(key: string): boolean {
  const ts = recentlyAppliedRemoteKeys.get(key);
  if (!ts) return false;
  if (Date.now() - ts < 400) return true;
  recentlyAppliedRemoteKeys.delete(key);
  return false;
}

type IdEntity = { id: string; [k: string]: any };

const TENANT_ARRAY_COLLECTIONS = [
  'clients',
  'salespeople',
  'admins',
  'boletas',
  'paidBoletas',
  'broadcasts',
  'autoLogs',
  'rendiciones',
  'catalogProducts',
  'catalogOrders',
] as const;

function getEntityPrefixForAggregateKey(
  key: string
): { scope: string; isTenantData: boolean; collection?: string } | null {
  if (key.startsWith(TENANT_DATA_PREFIX)) {
    const tenantId = key.slice(TENANT_DATA_PREFIX.length);
    return { scope: tenantId, isTenantData: true };
  }
  if (key === TENANTS_KEY) return { scope: 'platform', isTenantData: false, collection: 'tenants' };
  if (key === USERS_KEY) return { scope: 'platform', isTenantData: false, collection: 'users' };
  if (key === ANNOUNCEMENTS_KEY) {
    return { scope: 'platform', isTenantData: false, collection: 'announcements' };
  }
  return null;
}

function buildEntityKey(scope: string, collection: string, id: string): string {
  return `rec:${scope}:${collection}:${id}`;
}

function parseEntityKey(entityKey: string): {
  scope: string;
  collection: string;
  id: string;
} | null {
  if (!entityKey.startsWith('rec:')) return null;
  const parts = entityKey.split(':');
  if (parts.length < 4) return null;
  const [, scope, collection, ...rest] = parts;
  const id = rest.join(':');
  if (!scope || !collection || !id) return null;
  return { scope, collection, id };
}

function extractEntityMap(aggregateKey: string, parsedVal: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  const meta = getEntityPrefixForAggregateKey(aggregateKey);
  if (!meta || !parsedVal) return map;

  if (meta.isTenantData && isPlainObject(parsedVal)) {
    if (isPlainObject(parsedVal.config)) {
      map.set(buildEntityKey(meta.scope, 'config', 'main'), parsedVal.config);
    }
    if (isPlainObject(parsedVal.catalogSettings)) {
      map.set(buildEntityKey(meta.scope, 'catalogSettings', 'main'), parsedVal.catalogSettings);
    }
    for (const col of TENANT_ARRAY_COLLECTIONS) {
      const arr = parsedVal[col];
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (isPlainObject(item) && typeof item.id === 'string' && item.id) {
          map.set(buildEntityKey(meta.scope, col, item.id), item);
        }
      }
    }
  } else if (!meta.isTenantData && meta.collection && Array.isArray(parsedVal)) {
    for (const item of parsedVal) {
      if (isPlainObject(item) && typeof item.id === 'string' && item.id) {
        map.set(buildEntityKey(meta.scope, meta.collection, item.id), item);
      }
    }
  }
  return map;
}

function recordBaseline(aggregateKey: string, rawVal: string): void {
  syncedBaselineValues.set(aggregateKey, rawVal);
  const parsed = parseJsonSafely(rawVal);
  const entities = extractEntityMap(aggregateKey, parsed);
  entities.forEach((entityVal, entityKey) => {
    syncedEntityCache.set(entityKey, JSON.stringify(entityVal));
  });
}

// ============================================================================
// MERGE NO DESTRUCTIVO POR ID (NUNCA BORRA DATOS REMOTOS EXISTENTES)
// ============================================================================

function mergeIdArraysNonDestructive(params: {
  remoteArr: IdEntity[];
  localArr: IdEntity[];
  baselineArr: IdEntity[];
  scope: string;
  collection: string;
  locallyDeletedIds: Set<string>;
}): IdEntity[] {
  const { remoteArr, localArr, baselineArr, scope, collection, locallyDeletedIds } = params;

  const remoteMap = new Map<string, IdEntity>();
  for (const r of remoteArr) {
    if (isPlainObject(r) && typeof r.id === 'string' && r.id) {
      remoteMap.set(r.id, r);
    }
  }

  const localMap = new Map<string, IdEntity>();
  for (const l of localArr) {
    if (isPlainObject(l) && typeof l.id === 'string' && l.id) {
      localMap.set(l.id, l);
    }
  }

  const baselineMap = new Map<string, string>();
  for (const b of baselineArr) {
    if (isPlainObject(b) && typeof b.id === 'string' && b.id) {
      baselineMap.set(b.id, JSON.stringify(b));
    }
  }

  const mergedMap = new Map<string, IdEntity>();

  // 1. Preserve ALL remote records unless explicitly deleted by the user locally
  remoteMap.forEach((remoteItem, id) => {
    const entityKey = buildEntityKey(scope, collection, id);
    if (locallyDeletedIds.has(id) || explicitDeletedEntityKeys.has(entityKey)) {
      return;
    }
    mergedMap.set(id, remoteItem);
  });

  // 2. Add NEW local items & apply ONLY items actually modified locally relative to baseline
  localMap.forEach((localItem, id) => {
    const entityKey = buildEntityKey(scope, collection, id);
    explicitDeletedEntityKeys.delete(entityKey);

    const remoteItem = remoteMap.get(id);
    if (!remoteItem) {
      // Brand new local item -> INSERT / append alongside remote items
      mergedMap.set(id, localItem);
      return;
    }

    const baseStr = baselineMap.get(id);
    const localStr = JSON.stringify(localItem);
    const localWasModified = baseStr !== undefined && baseStr !== localStr;

    if (localWasModified) {
      mergedMap.set(id, localItem);
    } else {
      // Untouched locally -> keep remote version so stale local state NEVER overwrites remote
      mergedMap.set(id, remoteItem);
    }
  });

  // Preserve intuitive ordering (newest local additions first, followed by remote items)
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const l of localArr) {
    if (isPlainObject(l) && typeof l.id === 'string' && mergedMap.has(l.id) && !seen.has(l.id)) {
      orderedIds.push(l.id);
      seen.add(l.id);
    }
  }
  for (const r of remoteArr) {
    if (isPlainObject(r) && typeof r.id === 'string' && mergedMap.has(r.id) && !seen.has(r.id)) {
      orderedIds.push(r.id);
      seen.add(r.id);
    }
  }
  return orderedIds.map((id) => mergedMap.get(id)!);
}

function mergeConfigNonDestructive(
  remoteCfg: Record<string, any> | undefined,
  localCfg: Record<string, any> | undefined,
  baselineCfg: Record<string, any> | undefined
): Record<string, any> {
  if (!isPlainObject(remoteCfg)) return isPlainObject(localCfg) ? localCfg : {};
  if (!isPlainObject(localCfg)) return remoteCfg;
  if (!isPlainObject(baselineCfg)) {
    // No baseline yet (e.g. cold hydration): remote wins on populated fields, keep non-empty local extras
    const result: Record<string, any> = { ...localCfg };
    for (const [k, rv] of Object.entries(remoteCfg)) {
      if (rv !== undefined && rv !== null && rv !== '') {
        result[k] = rv;
      }
    }
    return result;
  }

  // Merge field-by-field: only fields actually changed locally overwrite remote
  const result: Record<string, any> = { ...remoteCfg };
  const allKeys = new Set([...Object.keys(localCfg), ...Object.keys(baselineCfg)]);
  allKeys.forEach((k) => {
    const localVal = localCfg[k];
    const baseVal = baselineCfg[k];
    if (JSON.stringify(localVal) !== JSON.stringify(baseVal)) {
      if (localVal === undefined) {
        delete result[k];
      } else {
        result[k] = localVal;
      }
    }
  });
  return result;
}

function mergeKeyValueNonDestructive(params: {
  key: string;
  remoteVal: unknown;
  localVal: unknown;
  baselineVal: unknown;
  locallyDeletedEntityKeys?: Set<string>;
}): unknown {
  const { key, remoteVal, localVal, baselineVal, locallyDeletedEntityKeys = new Set() } = params;
  const meta = getEntityPrefixForAggregateKey(key);

  if (!remoteVal) return localVal;
  if (!localVal) return remoteVal;

  if (meta?.isTenantData && isPlainObject(remoteVal) && isPlainObject(localVal)) {
    const baseObj = isPlainObject(baselineVal) ? baselineVal : {};
    const merged: Record<string, any> = {
      config: mergeConfigNonDestructive(remoteVal.config, localVal.config, baseObj.config),
      catalogSettings: mergeConfigNonDestructive(
        remoteVal.catalogSettings,
        localVal.catalogSettings,
        baseObj.catalogSettings
      ),
    };

    for (const col of TENANT_ARRAY_COLLECTIONS) {
      const deletedIdsForCol = new Set<string>();
      locallyDeletedEntityKeys.forEach((ek) => {
        const parsed = parseEntityKey(ek);
        if (parsed && parsed.scope === meta.scope && parsed.collection === col) {
          deletedIdsForCol.add(parsed.id);
        }
      });

      merged[col] = mergeIdArraysNonDestructive({
        remoteArr: Array.isArray(remoteVal[col]) ? remoteVal[col] : [],
        localArr: Array.isArray(localVal[col]) ? localVal[col] : [],
        baselineArr: Array.isArray(baseObj[col]) ? baseObj[col] : [],
        scope: meta.scope,
        collection: col,
        locallyDeletedIds: deletedIdsForCol,
      });
    }

    // Consistency guard: never keep a boleta in pending `boletas` if it is settled in `paidBoletas`
    const paidIds = new Set(
      (merged.paidBoletas as IdEntity[]).map((b) => b.id)
    );
    const localPaidIds = new Set(
      (Array.isArray(localVal.paidBoletas) ? localVal.paidBoletas : []).map((b: IdEntity) => b.id)
    );
    const localPendingIds = new Set(
      (Array.isArray(localVal.boletas) ? localVal.boletas : []).map((b: IdEntity) => b.id)
    );
    merged.boletas = (merged.boletas as IdEntity[]).filter((b) => {
      if (!paidIds.has(b.id)) return true;
      // Only allow staying in pending if user explicitly restored it from paidBoletas in THIS edit
      const wasInPaidBefore =
        Array.isArray(baseObj.paidBoletas) &&
        baseObj.paidBoletas.some((pb: IdEntity) => pb.id === b.id);
      const restoredLocally = wasInPaidBefore && !localPaidIds.has(b.id) && localPendingIds.has(b.id);
      return restoredLocally;
    });

    return merged;
  }

  if (meta && !meta.isTenantData && meta.collection && Array.isArray(remoteVal) && Array.isArray(localVal)) {
    const deletedIds = new Set<string>();
    locallyDeletedEntityKeys.forEach((ek) => {
      const parsed = parseEntityKey(ek);
      if (parsed && parsed.scope === meta.scope && parsed.collection === meta.collection) {
        deletedIds.add(parsed.id);
      }
    });

    return mergeIdArraysNonDestructive({
      remoteArr: remoteVal,
      localArr: localVal,
      baselineArr: Array.isArray(baselineVal) ? baselineVal : [],
      scope: meta.scope,
      collection: meta.collection,
      locallyDeletedIds: deletedIds,
    });
  }

  if (isPlainObject(remoteVal) && isPlainObject(localVal)) {
    return mergeConfigNonDestructive(
      remoteVal,
      localVal,
      isPlainObject(baselineVal) ? baselineVal : undefined
    );
  }

  return localVal;
}

// ============================================================================
// OPERACIONES INDIVIDUALES DE INSERCIÓN (INSERT) Y ACTUALIZACIÓN (UPDATE)
// ============================================================================

async function insertOrUpdateSingleRow(
  entityKey: string,
  entityVal: unknown,
  isNew: boolean
): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const now = new Date().toISOString();

  if (isNew) {
    // Operación explícita INSERT para agregar el nuevo registro sin tocar existentes
    const { error } = await supabase.from(CLOUD_TABLE).insert({
      key: entityKey,
      value: entityVal,
      updated_at: now,
    });
    if (!error) return true;
    // Si otro dispositivo insertó la misma clave (23505), actualizar solo si es necesario
    if (error.code === '23505') {
      const { error: updErr } = await supabase
        .from(CLOUD_TABLE)
        .update({ value: entityVal, updated_at: now })
        .eq('key', entityKey);
      return !updErr;
    }
    handleSupabaseError(error);
    return false;
  }

  // Operación individual UPDATE solo sobre el registro modificado
  const { data: updatedRows, error: updErr } = await supabase
    .from(CLOUD_TABLE)
    .update({ value: entityVal, updated_at: now })
    .eq('key', entityKey)
    .select('key');

  if (updErr) {
    handleSupabaseError(updErr);
    return false;
  }

  // Si aún no existía fila individual en la nube (dato heredado), insertar individualmente
  if (!updatedRows || updatedRows.length === 0) {
    const { error: insErr } = await supabase.from(CLOUD_TABLE).insert({
      key: entityKey,
      value: entityVal,
      updated_at: now,
    });
    if (insErr && insErr.code !== '23505') {
      handleSupabaseError(insErr);
      return false;
    }
  }
  return true;
}

async function runInChunks<T>(
  items: T[],
  chunkSize: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    await Promise.all(items.slice(i, i + chunkSize).map(worker));
  }
}

async function applyIndividualEntityOps(
  aggregateKey: string,
  localParsed: unknown,
  baselineParsed: unknown
): Promise<Set<string>> {
  const supabase = getSupabaseClient();
  const locallyDeletedKeys = new Set<string>();
  if (!supabase) return locallyDeletedKeys;

  const meta = getEntityPrefixForAggregateKey(aggregateKey);
  if (!meta) return locallyDeletedKeys;

  const nextEntities = extractEntityMap(aggregateKey, localParsed);
  const prevEntities = extractEntityMap(aggregateKey, baselineParsed);

  const pendingOps: Array<{ entityKey: string; nextVal: unknown; nextStr: string; isNew: boolean }> = [];

  // 1. Detectar nuevas inserciones y actualizaciones individuales
  for (const [entityKey, nextVal] of nextEntities.entries()) {
    explicitDeletedEntityKeys.delete(entityKey);
    const nextStr = JSON.stringify(nextVal);
    const prevStr = syncedEntityCache.get(entityKey);

    if (prevStr === undefined && !prevEntities.has(entityKey)) {
      pendingOps.push({ entityKey, nextVal, nextStr, isNew: true });
    } else if (prevStr !== nextStr) {
      pendingOps.push({ entityKey, nextVal, nextStr, isNew: false });
    }
  }

  await runInChunks(pendingOps, 16, async (op) => {
    const ok = await insertOrUpdateSingleRow(op.entityKey, op.nextVal, op.isNew);
    if (ok) syncedEntityCache.set(op.entityKey, op.nextStr);
  });

  // 2. Solo eliminar individualmente registros que estaban en el baseline local y el usuario quitó explícitamente
  const deleteKeys: string[] = [];
  for (const [prevKey] of prevEntities.entries()) {
    if (!nextEntities.has(prevKey)) {
      locallyDeletedKeys.add(prevKey);
      explicitDeletedEntityKeys.add(prevKey);
      syncedEntityCache.delete(prevKey);
      deleteKeys.push(prevKey);
    }
  }

  await runInChunks(deleteKeys, 16, async (prevKey) => {
    await supabase.from(CLOUD_TABLE).delete().eq('key', prevKey);
  });

  return locallyDeletedKeys;
}

async function executeUpsertEntry(key: string, rawVal: string, now: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const baselineRaw = syncedBaselineValues.get(key);
    if (baselineRaw === rawVal) {
      return;
    }

    const localParsed = parseJsonSafely(rawVal);
    const baselineParsed = baselineRaw ? parseJsonSafely(baselineRaw) : undefined;

    // Ejecutar en paralelo:
    // 1. INSERT/UPDATE/DELETE individual por entidad modificada (filas `rec:...`)
    // 2. Lectura del agregado remoto actual para merge no destructivo (fila `key`)
    const [locallyDeletedEntityKeys, remoteRes] = await Promise.all([
      applyIndividualEntityOps(key, localParsed, baselineParsed),
      supabase.from(CLOUD_TABLE).select('key, value').eq('key', key).maybeSingle(),
    ]);

    const { data: existingRemote, error: selectErr } = remoteRes;
    if (selectErr) {
      handleSupabaseError(selectErr);
      return;
    }

    let finalValueToSave: unknown = localParsed;
    if (existingRemote && existingRemote.value !== undefined) {
      finalValueToSave = mergeKeyValueNonDestructive({
        key,
        remoteVal: existingRemote.value,
        localVal: localParsed,
        baselineVal: baselineParsed,
        locallyDeletedEntityKeys,
      });

      const { error: updErr } = await supabase
        .from(CLOUD_TABLE)
        .update({ value: finalValueToSave, updated_at: now })
        .eq('key', key);

      if (updErr) {
        handleSupabaseError(updErr);
        console.warn('[Supabase] Error al actualizar registro:', updErr.message);
        return;
      }
    } else {
      const { error: insErr } = await supabase.from(CLOUD_TABLE).insert({
        key,
        value: finalValueToSave,
        updated_at: now,
      });
      if (insErr) {
        if (insErr.code === '23505') {
          await supabase
            .from(CLOUD_TABLE)
            .update({ value: finalValueToSave, updated_at: now })
            .eq('key', key);
        } else {
          handleSupabaseError(insErr);
          console.warn('[Supabase] Error al insertar registro:', insErr.message);
          return;
        }
      }
    }

    const finalSerialized = serializeValueSafely(finalValueToSave);
    recordBaseline(key, finalSerialized);

    // Si el merge incorporó registros remotos nuevos que no estaban en memoria local, actualizar UI inmediatamente
    if (finalSerialized !== rawVal && externalApplyCallback) {
      markRecentlyAppliedRemote(key);
      externalApplyCallback(key, finalSerialized);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SUPABASE_SYNC_EVENT, { detail: { keys: [key] } }));
      }
    }

    syncInfo.status = 'connected';
    syncInfo.lastSyncedAt = now;
    syncInfo.lastError = null;
  } catch (err) {
    handleSupabaseError({ message: err instanceof Error ? err.message : 'Network error' });
  }
}

async function executeUpsertBatch(entries: Array<[string, string]>): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || entries.length === 0) return;

  const now = new Date().toISOString();
  await Promise.all(entries.map(([key, rawVal]) => executeUpsertEntry(key, rawVal, now)));
}

export function queueSupabaseUpsert(key: string, rawValue: string): void {
  if (!isSupabaseConfigured() || !isCloudSyncedKey(key)) return;
  if (wasJustAppliedRemotely(key)) return;

  // No empujar datos locales por defecto hasta completar la hidratación inicial desde Supabase
  if (!cloudHydratedFlag) return;

  pendingUpserts.set(key, rawValue);
  const prevTimer = debounceTimers.get(key);
  if (prevTimer) clearTimeout(prevTimer);

  const timer = setTimeout(() => {
    debounceTimers.delete(key);
    const val = pendingUpserts.get(key);
    if (val !== undefined) {
      pendingUpserts.delete(key);
      void executeUpsertBatch([[key, val]]);
    }
  }, 50);
  debounceTimers.set(key, timer);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flushSupabaseSync();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushSupabaseSync();
    }
  });
}

export function queueSupabaseDelete(key: string): void {
  if (!isSupabaseConfigured() || !isCloudSyncedKey(key)) return;
  if (wasJustAppliedRemotely(key)) return;
  if (!cloudHydratedFlag) return;

  pendingUpserts.delete(key);
  const prevTimer = debounceTimers.get(key);
  if (prevTimer) {
    clearTimeout(prevTimer);
    debounceTimers.delete(key);
  }

  syncedBaselineValues.delete(key);

  const supabase = getSupabaseClient();
  if (!supabase) return;

  void supabase
    .from(CLOUD_TABLE)
    .delete()
    .eq('key', key)
    .then(({ error }) => {
      if (error) handleSupabaseError(error);
      else {
        syncInfo.status = 'connected';
        syncInfo.lastSyncedAt = new Date().toISOString();
      }
    });
}

export async function flushSupabaseSync(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (activeFlushPromise) return activeFlushPromise;

  activeFlushPromise = (async () => {
    debounceTimers.forEach((t) => clearTimeout(t));
    debounceTimers.clear();

    if (pendingUpserts.size === 0) return;
    const entries = Array.from(pendingUpserts.entries());
    pendingUpserts.clear();
    await executeUpsertBatch(entries);
  })().finally(() => {
    activeFlushPromise = null;
  });

  return activeFlushPromise;
}

// Reconstruye/enriquece claves agregadas a partir de filas individuales `rec:...` presentes en Supabase
function integrateGranularRowsIntoRemoteMap(
  rows: Array<{ key: string; value: unknown }>
): Map<string, unknown> {
  const aggregateMap = new Map<string, unknown>();
  const recRows: Array<{ scope: string; collection: string; id: string; value: unknown }> = [];

  for (const row of rows) {
    if (!row || typeof row.key !== 'string') continue;
    if (row.key.startsWith('rec:')) {
      const parsed = parseEntityKey(row.key);
      if (parsed) {
        recRows.push({ ...parsed, value: row.value });
        syncedEntityCache.set(row.key, JSON.stringify(row.value));
      }
      continue;
    }
    if (isCloudSyncedKey(row.key)) {
      aggregateMap.set(row.key, row.value);
    }
  }

  // Integrar filas granulares dentro de sus claves agregadas (respetando prioridad de fila individual más reciente)
  for (const rec of recRows) {
    let targetKey = '';
    if (rec.scope === 'platform') {
      if (rec.collection === 'tenants') targetKey = TENANTS_KEY;
      else if (rec.collection === 'users') targetKey = USERS_KEY;
      else if (rec.collection === 'announcements') targetKey = ANNOUNCEMENTS_KEY;
    } else {
      targetKey = `${TENANT_DATA_PREFIX}${rec.scope}`;
    }
    if (!targetKey) continue;

    if (rec.scope === 'platform') {
      const existing = aggregateMap.get(targetKey);
      const arr: IdEntity[] = Array.isArray(existing) ? [...existing] : [];
      const recVal = rec.value;
      if (isPlainObject(recVal) && typeof recVal.id === 'string') {
        const recId = recVal.id;
        const idx = arr.findIndex((x) => x.id === recId);
        if (idx >= 0) arr[idx] = recVal as IdEntity;
        else arr.push(recVal as IdEntity);
      }
      aggregateMap.set(targetKey, arr);
    } else {
      const existing = aggregateMap.get(targetKey);
      const obj: Record<string, any> = isPlainObject(existing) ? { ...existing } : {};
      const recVal = rec.value;
      if (rec.collection === 'config' && isPlainObject(recVal)) {
        obj.config = { ...(isPlainObject(obj.config) ? obj.config : {}), ...recVal };
      } else if (rec.collection === 'catalogSettings' && isPlainObject(recVal)) {
        obj.catalogSettings = {
          ...(isPlainObject(obj.catalogSettings) ? obj.catalogSettings : {}),
          ...recVal,
        };
      } else if (
        TENANT_ARRAY_COLLECTIONS.includes(rec.collection as any) &&
        isPlainObject(recVal) &&
        typeof recVal.id === 'string'
      ) {
        const recId = recVal.id;
        const arr: IdEntity[] = Array.isArray(obj[rec.collection])
          ? [...obj[rec.collection]]
          : [];
        const idx = arr.findIndex((x) => x.id === recId);
        if (idx >= 0) arr[idx] = recVal as IdEntity;
        else arr.push(recVal as IdEntity);
        obj[rec.collection] = arr;
      }
      aggregateMap.set(targetKey, obj);
    }
  }

  return aggregateMap;
}

function collectHydrationTargetScopes(localEntries: Map<string, string>): string[] {
  const scopes = new Set<string>();

  const activeTenantId = localEntries.get('saas_distribuidoras_active_tenant_id_v2_zero');
  if (activeTenantId && activeTenantId.trim()) {
    scopes.add(activeTenantId.trim());
  }

  const sessionRaw = localEntries.get('saas_distribuidoras_session_user_v2_zero');
  if (sessionRaw) {
    try {
      const parsed = JSON.parse(sessionRaw);
      if (parsed && typeof parsed.tenantId === 'string' && parsed.tenantId && parsed.tenantId !== 'all') {
        scopes.add(parsed.tenantId);
      }
    } catch {
      // ignore
    }
  }

  localEntries.forEach((_, key) => {
    if (key.startsWith(TENANT_DATA_PREFIX)) {
      const tId = key.slice(TENANT_DATA_PREFIX.length);
      if (tId) scopes.add(tId);
    }
  });

  return Array.from(scopes).slice(0, 10);
}

type CloudKeyValueRow = { key: string; value: unknown };

async function fetchExactCloudKeys(
  exactKeys: string[]
): Promise<{ rows: CloudKeyValueRow[]; error: { code?: string; message?: string } | null }> {
  const supabase = getSupabaseClient();
  const cleanKeys = Array.from(new Set(exactKeys.filter(Boolean)));
  if (!supabase || cleanKeys.length === 0) return { rows: [], error: null };

  const collected: CloudKeyValueRow[] = [];
  const chunkSize = 100;
  for (let i = 0; i < cleanKeys.length; i += chunkSize) {
    const chunk = cleanKeys.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select('key, value')
      .in('key', chunk);

    if (error) {
      return { rows: collected, error };
    }
    if (Array.isArray(data)) {
      collected.push(...(data as CloudKeyValueRow[]));
    }
  }
  return { rows: collected, error: null };
}

async function fetchPrefixCloudRows(
  likePattern: string,
  pageSize = 1000,
  maxPages = 5
): Promise<{ rows: CloudKeyValueRow[]; error: { code?: string; message?: string } | null }> {
  const supabase = getSupabaseClient();
  if (!supabase || !likePattern) return { rows: [], error: null };

  const collected: CloudKeyValueRow[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select('key, value')
      .like('key', likePattern)
      .range(from, to);

    if (error) {
      return { rows: collected, error };
    }
    const batch = (data || []) as CloudKeyValueRow[];
    collected.push(...batch);
    if (batch.length < pageSize) break;
  }
  return { rows: collected, error: null };
}

async function fetchParallelExactAndPrefixes(
  exactKeys: string[],
  likePatterns: string[],
  pageSize = 1000,
  maxPages = 5
): Promise<{ rows: CloudKeyValueRow[]; error: { code?: string; message?: string } | null }> {
  const uniquePatterns = Array.from(new Set(likePatterns.filter(Boolean)));
  const results = await Promise.all([
    fetchExactCloudKeys(exactKeys),
    ...uniquePatterns.map((pattern) => fetchPrefixCloudRows(pattern, pageSize, maxPages)),
  ]);

  const firstErr = results.find((r) => r.error)?.error || null;
  const rows: CloudKeyValueRow[] = [];
  for (const r of results) {
    if (r.rows.length > 0) rows.push(...r.rows);
  }
  return { rows, error: firstErr };
}

export async function hydrateFromSupabase(
  localEntries: Map<string, string>,
  applyRemoteEntry: (key: string, value: string) => void
): Promise<void> {
  externalApplyCallback = applyRemoteEntry;

  const supabase = getSupabaseClient();
  if (!supabase) {
    syncInfo.status = 'not_configured';
    cloudHydratedFlag = true;
    return;
  }

  try {
    const catalogKeys = [
      TENANTS_KEY,
      USERS_KEY,
      BILLING_KEY,
      SUPPORT_KEY,
      ANNOUNCEMENTS_KEY,
      VERIFIED_PAYMENTS_KEY,
    ];
    const targetScopes = collectHydrationTargetScopes(localEntries);
    const tenantAggregateKeys = targetScopes.map((s) => `${TENANT_DATA_PREFIX}${s}`);
    const exactKeys = [...catalogKeys, ...tenantAggregateKeys];
    const prefixPatterns = [
      'rec:platform:%',
      'merchant_mp_token_%',
      ...targetScopes.map((scope) => `rec:${scope}:%`),
    ];

    const { rows, error } = await fetchParallelExactAndPrefixes(exactKeys, prefixPatterns, 1000, 5);

    if (error) {
      handleSupabaseError(error);
      cloudHydratedFlag = true;
      console.warn('[Supabase] No se pudo hidratar la nube:', error.message);
      return;
    }

    syncInfo.status = 'connected';
    syncInfo.lastSyncedAt = new Date().toISOString();
    syncInfo.lastError = null;

    const localSnapshot = new Map(localEntries);
    const remoteAggregateMap = integrateGranularRowsIntoRemoteMap(rows);

    const toPushUnmergedLocal: Array<[string, string]> = [];

    remoteAggregateMap.forEach((remoteValObj, key) => {
      const remoteSerialized = serializeValueSafely(remoteValObj);
      const localRaw = localSnapshot.get(key);
      const localHasData = localRaw !== undefined && isNonEmptyBusinessValue(localRaw);
      const remoteHasData = isNonEmptyBusinessValue(remoteSerialized);

      // Nunca sobrescribir datos locales reales con remoto vacío
      if (localHasData && !remoteHasData) {
        toPushUnmergedLocal.push([key, localRaw]);
        return;
      }

      if (localHasData && remoteHasData) {
        // Merge no destructivo: conservar TODOS los registros remotos + agregar nuevos locales
        const localObj = parseJsonSafely(localRaw);
        const mergedObj = mergeKeyValueNonDestructive({
          key,
          remoteVal: remoteValObj,
          localVal: localObj,
          baselineVal: undefined, // Cold hydrate: remote wins on shared IDs; local additions preserved
        });
        const mergedSerialized = serializeValueSafely(mergedObj);
        recordBaseline(key, mergedSerialized);
        markRecentlyAppliedRemote(key);
        applyRemoteEntry(key, mergedSerialized);

        // Si el estado local aportó registros nuevos que no estaban en remoto, subirlos vía INSERT individual
        if (mergedSerialized !== remoteSerialized) {
          toPushUnmergedLocal.push([key, mergedSerialized]);
        }
        return;
      }

      recordBaseline(key, remoteSerialized);
      markRecentlyAppliedRemote(key);
      applyRemoteEntry(key, remoteSerialized);
    });

    // Empujar claves locales existentes que aún no existían en Supabase (INSERT individual sin pisar)
    localSnapshot.forEach((rawVal, key) => {
      if (!isCloudSyncedKey(key) || key.startsWith('rec:') || !isNonEmptyBusinessValue(rawVal)) {
        return;
      }
      if (!remoteAggregateMap.has(key)) {
        toPushUnmergedLocal.push([key, rawVal]);
      }
    });

    cloudHydratedFlag = true;

    if (toPushUnmergedLocal.length > 0) {
      // Subir diferencias locales en segundo plano sin bloquear el montaje de la UI
      void executeUpsertBatch(toPushUnmergedLocal);
    }
  } catch (err) {
    cloudHydratedFlag = true;
    handleSupabaseError({ message: err instanceof Error ? err.message : 'Hydration failed' });
  }
}

export async function refreshKeysFromSupabase(
  keys: string[],
  applyRemoteEntry: (key: string, value: string) => void,
  readLocalEntry?: (key: string) => string | null
): Promise<string[]> {
  externalApplyCallback = applyRemoteEntry;

  const supabase = getSupabaseClient();
  if (!supabase || keys.length === 0) return [];

  const updatedKeys: string[] = [];
  try {
    // Consultar clave exacta por PK + prefijos granulares `rec:<scope>:%` en paralelo (usando índice text_pattern_ops)
    const prefixPatterns: string[] = [];
    for (const k of keys) {
      const meta = getEntityPrefixForAggregateKey(k);
      if (meta?.isTenantData) {
        prefixPatterns.push(`rec:${meta.scope}:%`);
      } else if (meta && !meta.isTenantData && meta.collection) {
        prefixPatterns.push(`rec:platform:${meta.collection}:%`);
      }
    }

    const { rows, error } = await fetchParallelExactAndPrefixes(keys, prefixPatterns, 1000, 5);

    if (error) {
      handleSupabaseError(error);
      return [];
    }

    syncInfo.status = 'connected';
    syncInfo.lastSyncedAt = new Date().toISOString();
    syncInfo.lastError = null;

    const remoteMap = integrateGranularRowsIntoRemoteMap(rows);

    remoteMap.forEach((remoteObj, key) => {
      if (!keys.includes(key)) return;
      const localRaw = readLocalEntry ? readLocalEntry(key) : null;
      const remoteSerialized = serializeValueSafely(remoteObj);

      let nextSerialized = remoteSerialized;
      if (localRaw && isNonEmptyBusinessValue(localRaw) && isNonEmptyBusinessValue(remoteSerialized)) {
        const baseRaw = syncedBaselineValues.get(key);
        const merged = mergeKeyValueNonDestructive({
          key,
          remoteVal: remoteObj,
          localVal: parseJsonSafely(localRaw),
          baselineVal: baseRaw ? parseJsonSafely(baseRaw) : undefined,
        });
        nextSerialized = serializeValueSafely(merged);
      } else if (localRaw && isNonEmptyBusinessValue(localRaw) && !isNonEmptyBusinessValue(remoteSerialized)) {
        return;
      }

      recordBaseline(key, nextSerialized);
      markRecentlyAppliedRemote(key);
      applyRemoteEntry(key, nextSerialized);
      updatedKeys.push(key);
    });
  } catch (err) {
    handleSupabaseError({ message: err instanceof Error ? err.message : 'Refresh failed' });
  }
  return updatedKeys;
}

let realtimeChannel: RealtimeChannel | null = null;

export function startSupabaseRealtimeSubscription(
  applyRemoteEntry: (key: string, value: string) => void,
  deleteRemoteEntry: (key: string) => void,
  readLocalEntry?: (key: string) => string | null
): () => void {
  externalApplyCallback = applyRemoteEntry;

  const supabase = getSupabaseClient();
  if (!supabase || realtimeChannel) return () => {};

  const applyIncrementalGranularRealtime = (
    entityKey: string,
    newVal: unknown,
    isDelete: boolean
  ): string | null => {
    const parsedKey = parseEntityKey(entityKey);
    if (!parsedKey) return null;

    let aggregateKey = '';
    if (parsedKey.scope === 'platform') {
      if (parsedKey.collection === 'tenants') aggregateKey = TENANTS_KEY;
      else if (parsedKey.collection === 'users') aggregateKey = USERS_KEY;
      else if (parsedKey.collection === 'announcements') aggregateKey = ANNOUNCEMENTS_KEY;
    } else {
      aggregateKey = `${TENANT_DATA_PREFIX}${parsedKey.scope}`;
    }
    if (!aggregateKey) return null;

    const currentRaw = readLocalEntry
      ? readLocalEntry(aggregateKey)
      : syncedBaselineValues.get(aggregateKey) || null;
    const currentObj = currentRaw ? parseJsonSafely(currentRaw) : parsedKey.scope === 'platform' ? [] : {};

    if (parsedKey.scope === 'platform' && Array.isArray(currentObj)) {
      const arr = [...currentObj] as IdEntity[];
      if (isDelete) {
        const filtered = arr.filter((x) => x.id !== parsedKey.id);
        const ser = JSON.stringify(filtered);
        syncedEntityCache.delete(entityKey);
        recordBaseline(aggregateKey, ser);
        markRecentlyAppliedRemote(aggregateKey);
        applyRemoteEntry(aggregateKey, ser);
        return aggregateKey;
      }
      if (isPlainObject(newVal)) {
        const idx = arr.findIndex((x) => x.id === parsedKey.id);
        if (idx >= 0) arr[idx] = newVal as IdEntity;
        else arr.unshift(newVal as IdEntity);
        const ser = JSON.stringify(arr);
        syncedEntityCache.set(entityKey, JSON.stringify(newVal));
        recordBaseline(aggregateKey, ser);
        markRecentlyAppliedRemote(aggregateKey);
        applyRemoteEntry(aggregateKey, ser);
        return aggregateKey;
      }
    } else if (parsedKey.scope !== 'platform' && isPlainObject(currentObj)) {
      const obj = { ...currentObj } as Record<string, any>;
      if (parsedKey.collection === 'config' && !isDelete && isPlainObject(newVal)) {
        obj.config = { ...(isPlainObject(obj.config) ? obj.config : {}), ...newVal };
      } else if (parsedKey.collection === 'catalogSettings' && !isDelete && isPlainObject(newVal)) {
        obj.catalogSettings = {
          ...(isPlainObject(obj.catalogSettings) ? obj.catalogSettings : {}),
          ...newVal,
        };
      } else if (TENANT_ARRAY_COLLECTIONS.includes(parsedKey.collection as any)) {
        const arr: IdEntity[] = Array.isArray(obj[parsedKey.collection])
          ? [...obj[parsedKey.collection]]
          : [];
        if (isDelete) {
          obj[parsedKey.collection] = arr.filter((x) => x.id !== parsedKey.id);
          syncedEntityCache.delete(entityKey);
        } else if (isPlainObject(newVal)) {
          const idx = arr.findIndex((x) => x.id === parsedKey.id);
          if (idx >= 0) arr[idx] = newVal as IdEntity;
          else arr.unshift(newVal as IdEntity);
          obj[parsedKey.collection] = arr;
          syncedEntityCache.set(entityKey, JSON.stringify(newVal));
        }
      }
      const ser = JSON.stringify(obj);
      recordBaseline(aggregateKey, ser);
      markRecentlyAppliedRemote(aggregateKey);
      applyRemoteEntry(aggregateKey, ser);
      return aggregateKey;
    }

    return null;
  };

  realtimeChannel = supabase
    .channel('app_cloud_store_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: CLOUD_TABLE },
      (payload) => {
        const eventType = payload.eventType;
        if (eventType === 'DELETE') {
          const oldKey = (payload.old as { key?: string } | null)?.key;
          if (!oldKey || !isCloudSyncedKey(oldKey)) return;

          if (oldKey.startsWith('rec:')) {
            const affectedAgg = applyIncrementalGranularRealtime(oldKey, null, true);
            if (affectedAgg && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent(SUPABASE_SYNC_EVENT, { detail: { keys: [affectedAgg] } }));
            }
            return;
          }

          syncedBaselineValues.delete(oldKey);
          markRecentlyAppliedRemote(oldKey);
          deleteRemoteEntry(oldKey);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(SUPABASE_SYNC_EVENT, { detail: { keys: [oldKey] } }));
          }
          return;
        }

        const newRow = payload.new as { key?: string; value?: unknown } | null;
        if (!newRow?.key || !isCloudSyncedKey(newRow.key)) return;

        if (newRow.key.startsWith('rec:')) {
          const affectedAgg = applyIncrementalGranularRealtime(newRow.key, newRow.value, false);
          if (affectedAgg && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(SUPABASE_SYNC_EVENT, { detail: { keys: [affectedAgg] } }));
          }
          return;
        }

        const remoteSerialized = serializeValueSafely(newRow.value);
        const localRaw = readLocalEntry ? readLocalEntry(newRow.key) : null;
        let finalSerialized = remoteSerialized;

        if (localRaw && isNonEmptyBusinessValue(localRaw) && isNonEmptyBusinessValue(remoteSerialized)) {
          const baseRaw = syncedBaselineValues.get(newRow.key);
          const merged = mergeKeyValueNonDestructive({
            key: newRow.key,
            remoteVal: newRow.value,
            localVal: parseJsonSafely(localRaw),
            baselineVal: baseRaw ? parseJsonSafely(baseRaw) : undefined,
          });
          finalSerialized = serializeValueSafely(merged);
        }

        recordBaseline(newRow.key, finalSerialized);
        markRecentlyAppliedRemote(newRow.key);
        applyRemoteEntry(newRow.key, finalSerialized);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(SUPABASE_SYNC_EVENT, { detail: { keys: [newRow.key] } }));
        }
      }
    )
    .subscribe();

  return () => {
    if (realtimeChannel && supabase) {
      void supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}

// ============================================================================
// CLIENT PAYMENT ORDERS (INSERCIÓN / ACTUALIZACIÓN INDIVIDUAL POR TOKEN)
// ============================================================================

export async function saveClientPaymentOrderToSupabase(order: ClientPaymentOrder): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !order?.token) return;
  const key = `client_payment_order_${order.token}`;
  const now = new Date().toISOString();
  try {
    const { data: updatedRows, error: updErr } = await supabase
      .from(CLOUD_TABLE)
      .update({ value: order, updated_at: now })
      .eq('key', key)
      .select('key');

    if (updErr) return;
    if (updatedRows && updatedRows.length > 0) return;

    const { error: insErr } = await supabase.from(CLOUD_TABLE).insert({
      key,
      value: order,
      updated_at: now,
    });
    if (insErr?.code === '23505') {
      await supabase
        .from(CLOUD_TABLE)
        .update({ value: order, updated_at: now })
        .eq('key', key);
    }
  } catch {
    // Non-blocking fallback
  }
}

export async function fetchClientPaymentOrderFromSupabase(
  token: string
): Promise<ClientPaymentOrder | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !token) return null;
  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select('value')
      .eq('key', `client_payment_order_${token}`)
      .maybeSingle();

    if (error || !data?.value) return null;
    return data.value as ClientPaymentOrder;
  } catch {
    return null;
  }
}

export { BILLING_KEY, SUPPORT_KEY, VERIFIED_PAYMENTS_KEY };
