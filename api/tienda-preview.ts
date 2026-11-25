import { buildStorePreviewHtml, type StorePreviewData } from './_storePreview';

declare const process: { env: Record<string, string | undefined> };

/**
 * Vista previa del link de la tienda (?catalog=...) para WhatsApp y redes.
 * vercel.json manda acá solo a los robots de vista previa; las personas
 * reciben la app normal. Usa la clave pública (anon), igual que la tienda.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const handle = (url.searchParams.get('catalog') || '').trim().slice(0, 160);
  const origin = `${url.protocol}//${url.host}`;
  const pageUrl = `${origin}/?catalog=${encodeURIComponent(handle)}`;
  let data: StorePreviewData | null = null;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (handle && supabaseUrl && anonKey) {
    try {
      const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/public_catalog_get`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_handle: handle }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) data = (await res.json()) as StorePreviewData | null;
    } catch {
      // Sin datos: se muestra una vista previa genérica
    }
  }
  return new Response(buildStorePreviewHtml(data, pageUrl, origin), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400',
    },
  });
}
