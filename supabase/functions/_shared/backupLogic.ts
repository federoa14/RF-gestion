// Lógica pura del respaldo semanal (testeable sin Supabase).

/** Tablas con datos de cada comercio. business_secrets NO se respalda (tokens). */
export const BACKUP_TABLES = [
  'business_settings',
  'clients',
  'salespeople',
  'administrators',
  'boletas',
  'rendiciones',
  'broadcasts',
  'dispatch_logs',
  'catalog_products',
  'catalog_orders',
  'catalog_stock_alerts',
  'catalog_promo_subscribers',
  'catalog_loyalty_accounts',
  'catalog_abandoned_carts',
  'catalog_gift_cards',
  'public_catalogs',
] as const;

/** Cuántos respaldos semanales se guardan por comercio (2 meses). */
export const BACKUPS_TO_KEEP = 8;

export function backupFileName(date: Date): string {
  return `${date.toISOString().slice(0, 10)}.json`;
}

/** Archivos a borrar: deja los `keep` más nuevos (los nombres son fechas AAAA-MM-DD.json). */
export function filesToPrune(names: string[], keep = BACKUPS_TO_KEEP): string[] {
  const sorted = names.filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
  return sorted.slice(keep);
}

/** Saca cualquier campo con aspecto de secreto (se usa solo sobre la configuración del comercio). */
export function stripSecrets<T>(value: T): T {
  const SECRET_KEY = /(token|secret|password|apikey|api_key|accesskey)/i;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !SECRET_KEY.test(k))
          .map(([k, val]) => [k, walk(val)])
      );
    }
    return v;
  };
  return walk(value) as T;
}
