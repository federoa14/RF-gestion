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

// Keys that stay strictly local per browser/device (active session & UI dismissals)
const DEVICE_ONLY_EXACT_KEYS = new Set([
  'saas_distribuidoras_session_user_v2_zero',
  'saas_distribuidoras_active_tenant_id_v2_zero',
  'saas_demo_seeds_purged_v1',
]);

const DEVICE_ONLY_PREFIXES = ['saas_dismissed_announcements_v1'];

const CLOUD_SYNCED_PREFIXES = [
  'distribuidora_',
  'saas_distribuidoras_tenants_v2_zero',
  'saas_distribuidoras_users_v2_zero',
  'saas_distribuidora_data_v2_',
  'saas_platform_billing_config_v1',
  'saas_platform_support_config_v1',
  'saas_platform_announcements_v1',
  'client_payment_order_',
];

export function isCloudSyncedKey(key: string): boolean {
  if (!key) return false;
  if (DEVICE_ONLY_EXACT_KEYS.has(key)) return false;
  if (DEVICE_ONLY_PREFIXES.some((p) => key.startsWith(p))) return false;
  return CLOUD_SYNCED_PREFIXES.some((p) => key.startsWith(p));
}

export function getSupabaseSyncInfo(): SupabaseSyncInfo {
  return { ...syncInfo };
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

// Debounced write queue + flush support
const pendingUpserts = new Map<string, string>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
let activeFlushPromise: Promise<void> | null = null;
const recentlyAppliedRemoteKeys = new Map<string, number>();

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

async function executeUpsertBatch(entries: Array<[string, string]>): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || entries.length === 0) return;

  try {
    const rows = entries.map(([key, rawVal]) => ({
      key,
      value: parseJsonSafely(rawVal),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from(CLOUD_TABLE).upsert(rows, { onConflict: 'key' });
    if (error) {
      handleSupabaseError(error);
      console.warn('[Supabase] Error al guardar:', error.message);
      return;
    }

    syncInfo.status = 'connected';
    syncInfo.lastSyncedAt = new Date().toISOString();
    syncInfo.lastError = null;
  } catch (err) {
    handleSupabaseError({ message: err instanceof Error ? err.message : 'Network error' });
  }
}

export function queueSupabaseUpsert(key: string, rawValue: string): void {
  if (!isSupabaseConfigured() || !isCloudSyncedKey(key)) return;
  if (wasJustAppliedRemotely(key)) return;

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

  pendingUpserts.delete(key);
  const prevTimer = debounceTimers.get(key);
  if (prevTimer) {
    clearTimeout(prevTimer);
    debounceTimers.delete(key);
  }

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

export async function hydrateFromSupabase(
  localEntries: Map<string, string>,
  applyRemoteEntry: (key: string, value: string) => void
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    syncInfo.status = 'not_configured';
    return;
  }

  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select('key, value, updated_at')
      .not('key', 'like', 'client_payment_order_%');

    if (error) {
      handleSupabaseError(error);
      console.warn('[Supabase] No se pudo hidratar la nube:', error.message);
      return;
    }

    syncInfo.status = 'connected';
    syncInfo.lastSyncedAt = new Date().toISOString();
    syncInfo.lastError = null;

    const localSnapshot = new Map(localEntries);
    const remoteMap = new Map<string, string>();
    for (const row of data || []) {
      if (!row || typeof row.key !== 'string' || !isCloudSyncedKey(row.key)) continue;
      const serialized = serializeValueSafely(row.value);
      remoteMap.set(row.key, serialized);

      const localVal = localSnapshot.get(row.key);
      const localHasData = localVal !== undefined && isNonEmptyBusinessValue(localVal);
      const remoteHasData = isNonEmptyBusinessValue(serialized);

      // Never overwrite real existing local data with an empty remote array/object
      if (localHasData && !remoteHasData) {
        continue;
      }

      markRecentlyAppliedRemote(row.key);
      applyRemoteEntry(row.key, serialized);
    }

    // Push all existing local data that is missing or empty in Supabase immediately
    const toPush: Array<[string, string]> = [];
    localSnapshot.forEach((rawVal, key) => {
      if (!isCloudSyncedKey(key) || !isNonEmptyBusinessValue(rawVal)) return;
      const remoteVal = remoteMap.get(key);
      if (remoteVal === undefined || !isNonEmptyBusinessValue(remoteVal)) {
        toPush.push([key, rawVal]);
      }
    });

    if (toPush.length > 0) {
      await executeUpsertBatch(toPush);
    }
  } catch (err) {
    handleSupabaseError({ message: err instanceof Error ? err.message : 'Hydration failed' });
  }
}

export async function refreshKeysFromSupabase(
  keys: string[],
  applyRemoteEntry: (key: string, value: string) => void
): Promise<string[]> {
  const supabase = getSupabaseClient();
  if (!supabase || keys.length === 0) return [];

  const updatedKeys: string[] = [];
  try {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select('key, value')
      .in('key', keys);

    if (error) {
      handleSupabaseError(error);
      return [];
    }

    syncInfo.status = 'connected';
    syncInfo.lastSyncedAt = new Date().toISOString();
    syncInfo.lastError = null;

    for (const row of data || []) {
      if (!row || typeof row.key !== 'string') continue;
      const serialized = serializeValueSafely(row.value);
      markRecentlyAppliedRemote(row.key);
      applyRemoteEntry(row.key, serialized);
      updatedKeys.push(row.key);
    }
  } catch (err) {
    handleSupabaseError({ message: err instanceof Error ? err.message : 'Refresh failed' });
  }
  return updatedKeys;
}

let realtimeChannel: RealtimeChannel | null = null;

export function startSupabaseRealtimeSubscription(
  applyRemoteEntry: (key: string, value: string) => void,
  deleteRemoteEntry: (key: string) => void
): () => void {
  const supabase = getSupabaseClient();
  if (!supabase || realtimeChannel) return () => {};

  realtimeChannel = supabase
    .channel('app_cloud_store_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: CLOUD_TABLE },
      (payload) => {
        const eventType = payload.eventType;
        if (eventType === 'DELETE') {
          const oldKey = (payload.old as { key?: string } | null)?.key;
          if (oldKey && isCloudSyncedKey(oldKey)) {
            markRecentlyAppliedRemote(oldKey);
            deleteRemoteEntry(oldKey);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent(SUPABASE_SYNC_EVENT, { detail: { keys: [oldKey] } }));
            }
          }
          return;
        }

        const newRow = payload.new as { key?: string; value?: unknown } | null;
        if (newRow?.key && isCloudSyncedKey(newRow.key)) {
          const serialized = serializeValueSafely(newRow.value);
          markRecentlyAppliedRemote(newRow.key);
          applyRemoteEntry(newRow.key, serialized);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(SUPABASE_SYNC_EVENT, { detail: { keys: [newRow.key] } }));
          }
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

// Public Client Payment Orders helpers (works in static Vercel deploys too)
export async function saveClientPaymentOrderToSupabase(order: ClientPaymentOrder): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !order?.token) return;
  try {
    await supabase.from(CLOUD_TABLE).upsert(
      {
        key: `client_payment_order_${order.token}`,
        value: order,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
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
