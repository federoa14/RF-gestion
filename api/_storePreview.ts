// Arma el HTML con la vista previa (Open Graph) de una tienda, para WhatsApp,
// Facebook, Telegram, etc. Solo lo reciben los robots que generan la vista previa.

export interface StorePreviewData {
  storeName?: string;
  tagline?: string;
  logoUrl?: string;
  products?: Array<{ imageUrl?: string; available?: boolean }>;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const isHttpUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\/\S+$/i.test(value) && value.length < 2000;

export function buildStorePreviewHtml(data: StorePreviewData | null, pageUrl: string, origin: string): string {
  const storeName = (data?.storeName || '').trim();
  const name = storeName || 'Tienda online';
  const description =
    (data?.tagline || '').trim() || `Mirá los productos de ${name} y hacé tu pedido por WhatsApp.`;
  const productImage = (data?.products || []).find((p) => p.available !== false && isHttpUrl(p.imageUrl))?.imageUrl;
  const image = isHttpUrl(data?.logoUrl) ? data!.logoUrl! : productImage || `${origin}/assets/aistudio/file_0000000080a8820e83e95938baa4fbe8_5866e787.png`;
  const title = storeName ? `${storeName} · Tienda online` : 'Tienda online';
  const e = escapeHtml;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${e(title)}</title>
<meta name="description" content="${e(description)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${e(name)}" />
<meta property="og:title" content="${e(title)}" />
<meta property="og:description" content="${e(description)}" />
<meta property="og:url" content="${e(pageUrl)}" />
<meta property="og:image" content="${e(image)}" />
<meta property="og:locale" content="es_AR" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${e(title)}" />
<meta name="twitter:description" content="${e(description)}" />
<meta name="twitter:image" content="${e(image)}" />
<link rel="canonical" href="${e(pageUrl)}" />
</head>
<body>
<h1>${e(name)}</h1>
<p>${e(description)}</p>
<p><a href="${e(pageUrl)}">Ver la tienda</a></p>
</body>
</html>`;
}
