import { resolveStoreTheme } from '../src/utils/storeTheme';
import type { CatalogStoreTheme } from '../src/types';

// Manifiesto de la app instalable de una tienda: nombre, colores y logo propios del comercio.

export interface StoreManifestData {
  storeName?: string;
  tagline?: string;
  logoUrl?: string;
  storeTheme?: CatalogStoreTheme;
  canAccessFullFeatures?: boolean;
}

export function buildStoreManifest(data: StoreManifestData | null, handle: string, origin: string) {
  const name = (data?.storeName || '').trim() || 'Tienda online';
  const theme = data?.canAccessFullFeatures !== false && data?.storeTheme ? resolveStoreTheme(data.storeTheme) : null;
  const iconUrl = `${origin}/api/icon?catalog=${encodeURIComponent(handle)}`;
  const startUrl = `/?catalog=${encodeURIComponent(handle)}`;
  return {
    id: startUrl,
    name,
    short_name: name.length > 12 ? name.slice(0, 12).trim() : name,
    description: (data?.tagline || '').trim() || `Hacé tu pedido en ${name} desde el celular.`,
    lang: 'es-AR',
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFFFFF',
    theme_color: theme?.primary || '#0B1933',
    icons: [
      { src: iconUrl, sizes: '192x192', purpose: 'any' },
      { src: iconUrl, sizes: '512x512', purpose: 'any' },
    ],
  };
}

const escapeXml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string);

/** Ícono de respaldo cuando el comercio no cargó logo: su inicial sobre su color. */
export function buildFallbackIconSvg(name: string, color: string): string {
  const letter = escapeXml((name.trim().charAt(0) || 'T').toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${escapeXml(color)}"/><text x="256" y="340" font-family="Arial,Helvetica,sans-serif" font-size="280" font-weight="700" fill="#FFFFFF" text-anchor="middle">${letter}</text></svg>`;
}

/** Decodifica una imagen data URL para servirla como archivo. */
export function decodeImageDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime: m[1], bytes };
  } catch {
    return null;
  }
}
