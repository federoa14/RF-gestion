import { buildFallbackIconSvg, decodeImageDataUrl, type StoreManifestData } from './_manifest';
import { resolveStoreTheme } from '../src/utils/storeTheme';
import { fetchPublicCatalog } from './_catalogFetch';

/** Ícono de la app instalable de una tienda: el logo del comercio (o su inicial si no cargó logo). */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const handle = (url.searchParams.get('catalog') || '').trim().slice(0, 160);
  const data = await fetchPublicCatalog<StoreManifestData>(handle);
  const cache = 'public, s-maxage=600, stale-while-revalidate=86400';
  const logo = data?.logoUrl || '';
  if (/^https?:\/\/\S+$/i.test(logo) && logo.length < 2000) {
    return new Response(null, { status: 302, headers: { Location: logo, 'Cache-Control': cache } });
  }
  const decoded = logo ? decodeImageDataUrl(logo) : null;
  if (decoded) {
    return new Response(new Blob([decoded.bytes as BlobPart], { type: decoded.mime }), { status: 200, headers: { 'Content-Type': decoded.mime, 'Cache-Control': cache } });
  }
  const color =
    data?.canAccessFullFeatures !== false && data?.storeTheme ? resolveStoreTheme(data.storeTheme).primary : '#0B1933';
  return new Response(buildFallbackIconSvg(data?.storeName || 'Tienda', color), {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': cache },
  });
}
