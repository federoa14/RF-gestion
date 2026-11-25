import type { CSSProperties } from 'react';
import type { CatalogStoreTheme } from '../types';

/**
 * Diseño de la tienda online (Plan 3).
 * Se aplica con variables CSS sobre el contenedor de la tienda (.rf-store):
 * ver las reglas "Diseño de tienda" en index.css.
 */

export type StorePaletteKey = NonNullable<CatalogStoreTheme['palette']>;
export type StoreFontKey = NonNullable<CatalogStoreTheme['font']>;

export const STORE_PALETTES: Array<{ key: Exclude<StorePaletteKey, 'personalizada'>; label: string; primary: string; accent: string }> = [
  { key: 'marino', label: 'Marino', primary: '#0B1933', accent: '#10B981' },
  { key: 'esmeralda', label: 'Esmeralda', primary: '#065F46', accent: '#F59E0B' },
  { key: 'bordo', label: 'Bordó', primary: '#7F1D1D', accent: '#F59E0B' },
  { key: 'naranja', label: 'Naranja', primary: '#C2410C', accent: '#0F172A' },
  { key: 'violeta', label: 'Violeta', primary: '#5B21B6', accent: '#EC4899' },
  { key: 'grafito', label: 'Grafito', primary: '#1F2937', accent: '#EAB308' },
];

export const STORE_FONTS: Array<{ key: StoreFontKey; label: string; family: string; note: string }> = [
  { key: 'jakarta', label: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans', system-ui, sans-serif", note: 'Moderna (la de siempre)' },
  { key: 'inter', label: 'Inter', family: "'Inter', system-ui, sans-serif", note: 'Neutra y muy legible' },
  { key: 'nunito', label: 'Nunito', family: "'Nunito', system-ui, sans-serif", note: 'Redondeada y amigable' },
  { key: 'lora', label: 'Lora', family: "'Lora', Georgia, serif", note: 'Clásica, con serifa' },
  { key: 'playfair', label: 'Playfair Display', family: "'Playfair Display', Georgia, serif", note: 'Elegante, para moda y regalos' },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string | undefined): value is string {
  return Boolean(value && HEX_RE.test(value));
}

/** Luminancia relativa (0 = negro, 1 = blanco). */
export function hexLuminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** true si un texto blanco sobre ese color no se lee bien (contraste < 4,5:1). */
export function isTooLightForWhiteText(hex: string): boolean {
  return 1.05 / (hexLuminance(hex) + 0.05) < 4.5;
}

export interface ResolvedStoreTheme {
  primary: string;
  accent: string;
  fontFamily: string;
  fontKey: StoreFontKey;
  fontSize: 'normal' | 'grande';
  cardStyle: 'borde' | 'sombra' | 'plano';
  cardCorners: 'redondeado' | 'recto';
  bannerColors: 'propios' | 'tienda';
  bannerBackground: 'oscuro' | 'claro';
  bannerTitleSize: 'normal' | 'grande';
}

export function resolveStoreTheme(theme: CatalogStoreTheme | undefined): ResolvedStoreTheme {
  const t = theme || {};
  const preset = STORE_PALETTES.find((p) => p.key === t.palette) || STORE_PALETTES[0];
  const custom = t.palette === 'personalizada';
  const font = STORE_FONTS.find((f) => f.key === t.font) || STORE_FONTS[0];
  return {
    primary: custom && isValidHexColor(t.primaryColor) ? t.primaryColor : preset.primary,
    accent: custom && isValidHexColor(t.accentColor) ? t.accentColor : preset.accent,
    fontFamily: font.family,
    fontKey: font.key,
    fontSize: t.fontSize === 'grande' ? 'grande' : 'normal',
    cardStyle: t.cardStyle === 'sombra' || t.cardStyle === 'plano' ? t.cardStyle : 'borde',
    cardCorners: t.cardCorners === 'recto' ? 'recto' : 'redondeado',
    bannerColors: t.bannerColors === 'tienda' ? 'tienda' : 'propios',
    bannerBackground: t.bannerBackground === 'claro' ? 'claro' : 'oscuro',
    bannerTitleSize: t.bannerTitleSize === 'grande' ? 'grande' : 'normal',
  };
}

/**
 * Atributos para el contenedor de la tienda. Sin diseño (o fuera de Plan 3)
 * devuelve solo la clase base, y la tienda se ve exactamente como antes.
 */
export function getStoreThemeRootProps(
  theme: CatalogStoreTheme | undefined,
  enabled: boolean
): { className: string; style?: CSSProperties; [dataAttr: `data-${string}`]: string } {
  if (!enabled || !theme) return { className: 'rf-store' };
  const r = resolveStoreTheme(theme);
  return {
    className: 'rf-store',
    'data-themed': 'true',
    'data-size': r.fontSize,
    'data-card': r.cardStyle,
    'data-corners': r.cardCorners,
    'data-banner-title': r.bannerTitleSize,
    style: {
      ['--store-primary' as string]: r.primary,
      ['--store-accent' as string]: r.accent,
      ['--store-on-accent' as string]: isTooLightForWhiteText(r.accent) ? '#0F172A' : '#FFFFFF',
      fontFamily: r.fontFamily,
    } as CSSProperties,
  };
}

/**
 * Atributos para el contenedor del panel de gestión (.rf-panel). Solo cambia el color principal
 * y la letra; ver las reglas ".rf-panel[data-themed]" en index.css.
 */
export function getPanelThemeRootProps(
  theme: CatalogStoreTheme | undefined,
  enabled: boolean
): { 'data-themed'?: string; style?: CSSProperties } {
  if (!enabled || !theme) return {};
  const r = resolveStoreTheme(theme);
  return {
    'data-themed': 'true',
    style: {
      ['--panel-primary' as string]: r.primary,
      ['--panel-accent' as string]: r.accent,
      fontFamily: r.fontFamily,
    } as CSSProperties,
  };
}
