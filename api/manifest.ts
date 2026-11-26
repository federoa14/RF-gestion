import { buildStoreManifest, type StoreManifestData } from './_manifest';
import { fetchPublicCatalog } from './_catalogFetch';

/** Manifiesto de la app instalable de una tienda (?catalog=...), con el nombre, colores y logo del comercio. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const handle = (url.searchParams.get('catalog') || '').trim().slice(0, 160);
  const data = await fetchPublicCatalog<StoreManifestData>(handle);
  const manifest = buildStoreManifest(data, handle, `${url.protocol}//${url.host}`);
  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400',
    },
  });
}
