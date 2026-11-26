declare const process: { env: Record<string, string | undefined> };

/** Lee la tienda publicada con la clave pública (igual que la tienda). */
export async function fetchPublicCatalog<T>(handle: string): Promise<T | null> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!handle || !supabaseUrl || !anonKey) return null;
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/public_catalog_get`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_handle: handle }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok ? ((await res.json()) as T | null) : null;
  } catch {
    return null;
  }
}
