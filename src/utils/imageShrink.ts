import type { PublishedPublicCatalog } from '../types';

/**
 * La tienda pública se publica como un solo documento. Las fotos subidas por el comercio
 * viven dentro como imágenes en base64 y el documento llegaba a pesar varios MB:
 * el servidor lo rechazaba por tiempo (error 500) y la tienda nunca se actualizaba
 * (ni colores, ni filtros). Acá se achican para la versión pública.
 */
const cache = new Map<string, string>();

export async function shrinkDataUrl(
  src: string | undefined,
  maxSide: number,
  quality = 0.72
): Promise<string | undefined> {
  if (!src || !src.startsWith('data:image') || src.length < 70_000) return src;
  if (typeof document === 'undefined') return src;
  const key = `${src.length}:${src.slice(-48)}:${maxSide}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('img'));
      el.src = src;
    });
    const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return src;
    const isPng = src.startsWith('data:image/png');
    if (!isPng) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality);
    const result = out.length < src.length ? out : src;
    cache.set(key, result);
    return result;
  } catch {
    return src;
  }
}

export async function slimCatalogSnapshotImages(
  snapshot: PublishedPublicCatalog
): Promise<PublishedPublicCatalog> {
  const products = await Promise.all(
    (snapshot.products || []).map(async (p) => ({
      ...p,
      imageUrl: await shrinkDataUrl(p.imageUrl, 560),
      additionalImageUrls: p.additionalImageUrls
        ? (await Promise.all(p.additionalImageUrls.slice(0, 3).map((u) => shrinkDataUrl(u, 480)))).filter(
            (u): u is string => Boolean(u)
          )
        : undefined,
    }))
  );
  const banners = snapshot.promoBanners
    ? await Promise.all(
        snapshot.promoBanners.map(async (b) => ({ ...b, imageUrl: await shrinkDataUrl(b.imageUrl, 900) }))
      )
    : snapshot.promoBanners;
  return {
    ...snapshot,
    logoUrl: await shrinkDataUrl(snapshot.logoUrl, 256),
    products,
    promoBanners: banners,
  };
}
