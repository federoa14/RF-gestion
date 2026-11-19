/**
 * Base de Datos Interna Local del Dispositivo (IndexedDB) + Sincronización Supabase
 * -----------------------------------------------------------------------------
 * Mantiene caché local rápida en IndexedDB y sincroniza automáticamente
 * empresas, usuarios, clientes, boletas, rendiciones y configuraciones en Supabase.
 */
import {
  hydrateFromSupabase,
  queueSupabaseUpsert,
  queueSupabaseDelete,
  refreshKeysFromSupabase,
  startSupabaseRealtimeSubscription,
} from './supabaseSync';

const IDB_NAME = 'cobranzas_base_interna_v1';
const IDB_VERSION = 1;
const STORE_NAME = 'records';
const BACKUP_FORMAT = 'cobranzas_base_interna_backup_v1';

interface StoredRecord {
  key: string;
  value: string;
  updatedAt?: number;
}

const memoryStore = new Map<string, string>();
let idbInstance: IDBDatabase | null = null;
let dbEngine: 'IndexedDB' | 'localStorage' = 'localStorage';
let initPromise: Promise<void> | null = null;
let isPersistedFlag = false;

const MIGRATABLE_PREFIXES = [
  'distribuidora_',
  'saas_',
  'client_payment_links_',
];

function isRelevantKey(key: string): boolean {
  return MIGRATABLE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function openIdbConnection(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 1500);

    try {
      const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(request.result);
        }
      };
      request.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      };
      request.onblocked = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      };
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

function readAllRecordsFromIdb(db: IDBDatabase): Promise<StoredRecord[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        resolve(Array.isArray(req.result) ? req.result : []);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function writeBatchToIdb(db: IDBDatabase, records: StoredRecord[]): Promise<boolean> {
  return new Promise((resolve) => {
    if (records.length === 0) {
      resolve(true);
      return;
    }
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      records.forEach((rec) => store.put(rec));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function writeSingleToIdb(key: string, value: string): void {
  if (!idbInstance) return;
  try {
    const tx = idbInstance.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      key,
      value,
      updatedAt: Date.now(),
    } satisfies StoredRecord);
  } catch {
    // Silent fallback — memoryStore stays up to date
  }
}

function deleteSingleFromIdb(key: string): void {
  if (!idbInstance) return;
  try {
    const tx = idbInstance.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
  } catch {
    // Silent
  }
}

/**
 * Inicializa la base interna IndexedDB antes de montar la interfaz React.
 * Migra automáticamente cualquier dato previo de localStorage hacia IndexedDB.
 */
export async function initInternalDatabase(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const db = await openIdbConnection();

    if (db) {
      idbInstance = db;
      dbEngine = 'IndexedDB';
      const existingRecords = await readAllRecordsFromIdb(db);
      for (const rec of existingRecords) {
        if (rec && typeof rec.key === 'string' && typeof rec.value === 'string') {
          memoryStore.set(rec.key, rec.value);
        }
      }

      // Solicitar persistencia al navegador para proteger la base interna local
      try {
        if (navigator.storage && typeof navigator.storage.persist === 'function') {
          const already = await navigator.storage.persisted?.();
          isPersistedFlag = Boolean(already || (await navigator.storage.persist()));
        }
      } catch {
        isPersistedFlag = false;
      }
    }

    // Migrar claves preexistentes desde localStorage hacia IndexedDB si faltan en memoryStore
    const toMigrate: StoredRecord[] = [];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (!k || !isRelevantKey(k)) continue;
          const v = window.localStorage.getItem(k);
          if (v !== null && !memoryStore.has(k)) {
            memoryStore.set(k, v);
            toMigrate.push({ key: k, value: v, updatedAt: Date.now() });
          }
        }
      }
    } catch {
      // ignore localStorage access restrictions
    }

    if (db && toMigrate.length > 0) {
      await writeBatchToIdb(db, toMigrate);
    }

    // Hidratar y sincronizar con Supabase (si está configurado en variables de entorno)
    await hydrateFromSupabase(memoryStore, applyExternalSyncedRecord);
    startSupabaseRealtimeSubscription(applyExternalSyncedRecord, deleteExternalSyncedRecord);
  })();

  return initPromise;
}

export function applyExternalSyncedRecord(key: string, value: string): void {
  memoryStore.set(key, value);
  writeSingleToIdb(key, value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // IndexedDB guarda igual incluso si supera cuota de localStorage
  }
}

export function deleteExternalSyncedRecord(key: string): void {
  memoryStore.delete(key);
  deleteSingleFromIdb(key);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export async function syncKeysFromCloud(keys: string[]): Promise<string[]> {
  return refreshKeysFromSupabase(keys, applyExternalSyncedRecord);
}

export function dbGetItem(key: string): string | null {
  if (memoryStore.has(key)) {
    return memoryStore.get(key) ?? null;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = window.localStorage.getItem(key);
      if (val !== null) {
        memoryStore.set(key, val);
        if (idbInstance) {
          writeSingleToIdb(key, val);
        }
      }
      return val;
    }
  } catch {
    // ignore
  }
  return null;
}

export function dbSetItem(key: string, value: string): void {
  memoryStore.set(key, value);
  writeSingleToIdb(key, value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Si localStorage excede su cuota de 5MB (por fotos/flyers), IndexedDB conserva todo sin fallar
  }
  queueSupabaseUpsert(key, value);
}

export function dbRemoveItem(key: string): void {
  memoryStore.delete(key);
  deleteSingleFromIdb(key);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
  queueSupabaseDelete(key);
}

export interface InternalDbStatus {
  engine: 'IndexedDB' | 'localStorage';
  dbName: string;
  recordCount: number;
  usedBytes: number;
  quotaBytes: number | null;
  persisted: boolean;
}

export async function getInternalDatabaseStatus(): Promise<InternalDbStatus> {
  await initInternalDatabase();
  let approxBytes = 0;
  memoryStore.forEach((val, key) => {
    approxBytes += (key.length + val.length) * 2;
  });

  let quotaBytes: number | null = null;
  let usageBytes = approxBytes;
  try {
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate();
      if (typeof est.quota === 'number') quotaBytes = est.quota;
      if (typeof est.usage === 'number' && est.usage > usageBytes) {
        usageBytes = est.usage;
      }
    }
  } catch {
    // ignore
  }

  return {
    engine: dbEngine,
    dbName: IDB_NAME,
    recordCount: memoryStore.size,
    usedBytes: usageBytes,
    quotaBytes,
    persisted: isPersistedFlag,
  };
}

export function exportInternalDatabaseBackup(labelPrefix = 'Respaldo_Base_Interna'): {
  filename: string;
  jsonString: string;
  recordCount: number;
  sizeBytes: number;
} {
  const entries: Record<string, string> = {};
  memoryStore.forEach((value, key) => {
    if (isRelevantKey(key)) {
      entries[key] = value;
    }
  });

  // Incluir cualquier clave adicional en localStorage por seguridad
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && isRelevantKey(k) && !(k in entries)) {
          const v = window.localStorage.getItem(k);
          if (v !== null) entries[k] = v;
        }
      }
    }
  } catch {
    // ignore
  }

  const payload = {
    format: BACKUP_FORMAT,
    dbName: IDB_NAME,
    exportedAt: new Date().toISOString(),
    recordCount: Object.keys(entries).length,
    entries,
  };

  const jsonString = JSON.stringify(payload, null, 2);
  const dateTag = new Date().toISOString().split('T')[0];
  const filename = `${labelPrefix}_${dateTag}.json`;
  return {
    filename,
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
  return {
    filename: backup.filename,
    recordCount: backup.recordCount,
    sizeBytes: backup.sizeBytes,
  };
}

export async function importInternalDatabaseBackup(rawJson: string): Promise<{
  success: boolean;
  importedCount: number;
  tenantsCount: number;
  usersCount: number;
  error?: string;
}> {
  await initInternalDatabase();
  try {
    const parsed = JSON.parse(rawJson);
    if (
      !parsed ||
      parsed.format !== BACKUP_FORMAT ||
      typeof parsed.entries !== 'object' ||
      Array.isArray(parsed.entries)
    ) {
      return {
        success: false,
        importedCount: 0,
        tenantsCount: 0,
        usersCount: 0,
        error: 'El archivo seleccionado no es un respaldo válido de la base interna.',
      };
    }

    const entries = parsed.entries as Record<string, unknown>;
    const batch: StoredRecord[] = [];
    let tenantsCount = 0;
    let usersCount = 0;

    for (const [key, value] of Object.entries(entries)) {
      if (typeof key !== 'string' || typeof value !== 'string' || !isRelevantKey(key)) continue;
      memoryStore.set(key, value);
      batch.push({ key, value, updatedAt: Date.now() });

      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
      } catch {
        // IndexedDB guarda igual incluso si supera cuota de localStorage
      }

      if (key === 'saas_distribuidoras_tenants_v2_zero') {
        try {
          const arr = JSON.parse(value);
          if (Array.isArray(arr)) tenantsCount = arr.length;
        } catch {}
      }
      if (key === 'saas_distribuidoras_users_v2_zero') {
        try {
          const arr = JSON.parse(value);
          if (Array.isArray(arr)) usersCount = arr.length;
        } catch {}
      }
    }

    if (batch.length === 0) {
      return {
        success: false,
        importedCount: 0,
        tenantsCount: 0,
        usersCount: 0,
        error: 'El archivo de respaldo no contiene registros compatibles.',
      };
    }

    if (idbInstance) {
      await writeBatchToIdb(idbInstance, batch);
    }

    return {
      success: true,
      importedCount: batch.length,
      tenantsCount,
      usersCount,
    };
  } catch {
    return {
      success: false,
      importedCount: 0,
      tenantsCount: 0,
      usersCount: 0,
      error: 'No se pudo leer el archivo JSON de respaldo.',
    };
  }
}
