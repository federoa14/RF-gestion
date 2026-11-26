import { useEffect, useState } from 'react';

/** Registra el service worker mínimo que habilita la instalación de la app. */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const secure = window.isSecureContext || window.location.hostname === 'localhost';
  if (!secure) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // sin service worker la página funciona igual, solo no se ofrece instalar
    });
  });
}

function upsertLink(rel: string, href: string, extra: Record<string, string> = {}): HTMLLinkElement {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"][data-rf-pwa="1"]`);
  if (!el) {
    // saca el del index.html para que no compitan
    document.head.querySelectorAll(`link[rel="${rel}"]`).forEach((n) => n.remove());
    el = document.createElement('link');
    el.rel = rel;
    el.setAttribute('data-rf-pwa', '1');
    document.head.appendChild(el);
  }
  el.href = href;
  Object.entries(extra).forEach(([k, v]) => el!.setAttribute(k, v));
  return el;
}

export function setThemeColor(color: string): void {
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = color;
}

/** Tienda: manifiesto, ícono y colores del comercio (los arma el servidor en /api). */
export function applyStorePwa(handle: string, themeColor?: string): void {
  if (typeof document === 'undefined' || !handle) return;
  const h = encodeURIComponent(handle);
  upsertLink('manifest', `/api/manifest?catalog=${h}`);
  upsertLink('apple-touch-icon', `/api/icon?catalog=${h}`);
  if (themeColor) setThemeColor(themeColor);
}

/** Panel: manifiesto armado en el navegador con el logo y el nombre de la empresa. */
export function applyPanelPwa(opts: { name: string; logoUrl?: string; themeColor?: string }): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const name = (opts.name || '').trim() || 'Mi comercio';
  const icon = opts.logoUrl || `${window.location.origin}/assets/aistudio/file_0000000080a8820e83e95938baa4fbe8_5866e787.png`;
  const manifest = {
    id: '/',
    name,
    short_name: name.length > 12 ? name.slice(0, 12).trim() : name,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F4F6F9',
    theme_color: opts.themeColor || '#0B1933',
    icons: [
      { src: icon, sizes: '192x192', purpose: 'any' },
      { src: icon, sizes: '512x512', purpose: 'any' },
    ],
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
  upsertLink('manifest', url);
  upsertLink('apple-touch-icon', icon);
  if (opts.themeColor) setThemeColor(opts.themeColor);
  return () => URL.revokeObjectURL(url);
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event('rf-install-available'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new Event('rf-install-available'));
  });
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Estado del botón "Instalar app": Android/Chrome instala con un toque; en iPhone se muestra cómo hacerlo. */
export function useInstallApp() {
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => force((n) => n + 1);
    window.addEventListener('rf-install-available', h);
    return () => window.removeEventListener('rf-install-available', h);
  }, []);
  const standalone = isStandalone();
  const ios = isIos();
  return {
    visible: !standalone && (Boolean(deferredPrompt) || ios),
    isIos: ios,
    async install(): Promise<'installed' | 'ios-help' | 'unavailable'> {
      if (deferredPrompt) {
        const p = deferredPrompt;
        deferredPrompt = null;
        await p.prompt();
        const choice = await p.userChoice;
        window.dispatchEvent(new Event('rf-install-available'));
        return choice.outcome === 'accepted' ? 'installed' : 'unavailable';
      }
      return ios ? 'ios-help' : 'unavailable';
    },
  };
}
