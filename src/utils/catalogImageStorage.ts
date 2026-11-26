import { getSupabaseClient } from './supabaseClient';

const BUCKET = 'catalog-images';
const CACHE_PREFIX = 'rf_img_url_';

async function sha1Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Sube una foto (data URL) al bucket público y devuelve su link.
 * La carpeta es el id del comercio y el nombre sale del contenido: la misma foto no se sube dos veces.
 * Devuelve null si no se pudo (sin sesión, sin conexión, bucket sin crear): se usa la foto incrustada.
 */
export async function uploadDataUrlToCatalogStorage(businessId: string, dataUrl: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase || !businessId || !dataUrl.startsWith('data:image')) return null;
    const hash = await sha1Hex(dataUrl);
    try {
      const cached = window.localStorage.getItem(CACHE_PREFIX + businessId + hash);
      if (cached) return cached;
    } catch {
      // sin almacenamiento local
    }
    const mime = /^data:(image\/(?:jpeg|png|webp));/.exec(dataUrl)?.[1];
    if (!mime) return null;
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${businessId}/${hash}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: mime,
      upsert: true,
      cacheControl: '31536000',
    });
    if (error) return null;
    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    if (!url) return null;
    try {
      window.localStorage.setItem(CACHE_PREFIX + businessId + hash, url);
    } catch {
      // ignore
    }
    return url;
  } catch {
    return null;
  }
}

/** Hace una lista de tareas con un máximo de pedidos en paralelo. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
