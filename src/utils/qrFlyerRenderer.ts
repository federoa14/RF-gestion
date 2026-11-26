import QRCode from 'qrcode';
import {
  FLYER_STYLES,
  SANS,
  SERIF,
  type FlyerStyleKey,
  drawCover,
  ensureFonts,
  fitText,
  loadImage,
  mix,
  onColor,
  rgba,
  rr,
} from './flyerRenderer';

export type QrFlyerFormat = 'a4' | 'story' | 'post';

export const QR_FLYER_FORMATS: Array<{ key: QrFlyerFormat; label: string; width: number; height: number }> = [
  { key: 'a4', label: 'Para imprimir (A4)', width: 1240, height: 1754 },
  { key: 'story', label: 'Estado / historia (9:16)', width: 1080, height: 1920 },
  { key: 'post', label: 'Publicación cuadrada', width: 1080, height: 1080 },
];

export interface QrFlyerOptions {
  style: FlyerStyleKey;
  format: QrFlyerFormat;
  badge: string; // "E-COMMERCE"
  storeName: string;
  tagline: string;
  cta: string; // "Escaneá y comprá"
  contact: string; // WhatsApp / teléfono
  extra: string; // Instagram, dirección, horarios…
  url: string;
  logoUrl?: string;
  accent?: string;
}

export const DEFAULT_QR_FLYER_TEXTS = {
  badge: 'E-COMMERCE',
  tagline: 'Comprá online y retirá o recibí tu pedido',
  cta: 'Escaneá y comprá',
};

/** QR del link de la tienda como imagen (para descargarlo solo). */
export async function renderQrOnly(url: string, size = 1024): Promise<string> {
  return QRCode.toDataURL(url, { margin: 2, width: size, errorCorrectionLevel: 'M', color: { dark: '#0B1933', light: '#FFFFFF' } });
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/\?catalog=/, '/?catalog=');
}

/** Flyer con el QR de la tienda: título "E-commerce", nombre del comercio y datos editables. */
export async function renderQrFlyer(o: QrFlyerOptions): Promise<string> {
  await ensureFonts();
  const fmt = QR_FLYER_FORMATS.find((f) => f.key === o.format) || QR_FLYER_FORMATS[0];
  const w = fmt.width;
  const h = fmt.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar el lienzo gráfico.');
  const u = Math.min(w, h) / 1000;
  const side = o.format === 'post';
  const def = FLYER_STYLES.find((s) => s.key === o.style) || FLYER_STYLES[0];
  const accent = /^#[0-9a-fA-F]{6}$/.test(o.accent || '') ? (o.accent as string) : def.accent;

  let bg1 = mix('#0B1226', accent, 0.1);
  let bg2 = mix('#13264A', accent, 0.25);
  let text = '#FFFFFF';
  let soft = 'rgba(255,255,255,0.8)';
  let headFont = SANS;
  let headWeight = '800';
  if (o.style === 'vibrante') {
    bg1 = accent;
    bg2 = mix(accent, '#FFD60A', 0.55);
    text = onColor(mix(accent, '#FFD60A', 0.25));
    soft = text === '#FFFFFF' ? 'rgba(255,255,255,0.9)' : 'rgba(15,23,42,0.8)';
  } else if (o.style === 'elegante') {
    bg1 = '#FBF7F0';
    bg2 = '#F1E8D8';
    text = '#1F1A17';
    soft = 'rgba(31,26,23,0.72)';
    headFont = SERIF;
    headWeight = '700';
  } else if (o.style === 'minimal') {
    bg1 = '#FFFFFF';
    bg2 = '#F1F5F9';
    text = '#0F172A';
    soft = 'rgba(15,23,42,0.68)';
    headFont = '"Inter", system-ui, sans-serif';
  }

  const g = ctx.createLinearGradient(0, 0, w * 0.8, h);
  g.addColorStop(0, bg1);
  g.addColorStop(1, bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // decoración
  ctx.save();
  if (o.style === 'moderno') {
    const rg = ctx.createRadialGradient(w * 0.85, h * 0.12, 0, w * 0.85, h * 0.12, w * 0.8);
    rg.addColorStop(0, rgba(accent, 0.45));
    rg.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  } else if (o.style === 'vibrante') {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        ctx.beginPath();
        ctx.arc(w * 0.6 + c * 46 * u, h * 0.03 + r * 46 * u, Math.max(1, (8 - r) * 0.9 * u), 0, Math.PI * 2);
        ctx.fill();
      }
  } else if (o.style === 'elegante') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3 * u;
    ctx.strokeRect(w * 0.035, h * 0.03, w * 0.93, h * 0.94);
    ctx.lineWidth = 1.2 * u;
    ctx.strokeRect(w * 0.05, h * 0.042, w * 0.9, h * 0.916);
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 16 * u);
  }
  ctx.restore();

  const logo = await loadImage(o.logoUrl);
  const qrDark = o.style === 'vibrante' ? '#0F172A' : '#0B1933';
  const qrUrl = await QRCode.toDataURL(o.url, { margin: 1, width: 900, errorCorrectionLevel: 'M', color: { dark: qrDark, light: '#FFFFFF' } });
  const qrImg = await loadImage(qrUrl);

  const pad = w * 0.08;
  const contentW = side ? w * 0.5 - pad : w - pad * 2;
  const cx = side ? pad + contentW / 2 : w / 2;
  ctx.textBaseline = 'top';

  // logo + insignia E-COMMERCE
  let y = h * (side ? 0.1 : 0.07);
  const logoSize = (side ? 110 : 150) * u;
  if (logo) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 20 * u;
    rr(ctx, cx - logoSize / 2, y, logoSize, logoSize, 26 * u);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
    ctx.save();
    rr(ctx, cx - logoSize / 2, y, logoSize, logoSize, 26 * u);
    ctx.clip();
    drawCover(ctx, logo, cx - logoSize / 2, y, logoSize, logoSize);
    ctx.restore();
    y += logoSize + 28 * u;
  }

  const badgeText = (o.badge || 'E-COMMERCE').toUpperCase();
  ctx.font = `800 ${Math.round((side ? 34 : 40) * u)}px ${SANS}`;
  const bw = Math.min(contentW, ctx.measureText(badgeText).width + 80 * u);
  const bh = (side ? 66 : 78) * u;
  const badgeBg = o.style === 'vibrante' ? '#0F172A' : accent;
  rr(ctx, cx - bw / 2, y, bw, bh, bh / 2);
  ctx.fillStyle = badgeBg;
  ctx.fill();
  ctx.fillStyle = o.style === 'vibrante' ? '#FFD60A' : onColor(accent);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, cx, y + bh / 2 + 2 * u, bw - 20 * u);
  y += bh + 34 * u;

  // nombre de la tienda
  ctx.textBaseline = 'top';
  const name = (o.storeName || 'Mi tienda').trim();
  const nameFit = fitText(ctx, o.style === 'vibrante' ? name.toUpperCase() : name, headWeight, headFont, (side ? 96 : 130) * u, 46 * u, contentW, 3);
  ctx.fillStyle = text;
  ctx.font = `${headWeight} ${nameFit.size}px ${headFont}`;
  nameFit.lines.forEach((line, i) => ctx.fillText(line, cx, y + i * nameFit.size * 1.08));
  y += nameFit.lines.length * nameFit.size * 1.08 + 22 * u;

  if (o.tagline.trim()) {
    const tag = fitText(ctx, o.tagline.trim(), '600', SANS, (side ? 34 : 44) * u, 18 * u, contentW, 3);
    ctx.fillStyle = soft;
    ctx.font = `600 ${tag.size}px ${SANS}`;
    tag.lines.forEach((line, i) => ctx.fillText(line, cx, y + i * tag.size * 1.35));
    y += tag.lines.length * tag.size * 1.35 + 20 * u;
  }

  // pie de contacto (se calcula antes para repartir el espacio del QR)
  const contactLines = [o.contact.trim(), o.extra.trim()].filter(Boolean);
  const footH = contactLines.length ? (contactLines.length === 2 ? 150 : 100) * u : 0;
  const footY = h - footH - (o.style === 'elegante' ? h * 0.04 : 0);

  // tarjeta con el QR
  const qrArea = side
    ? { x: w * 0.55, top: h * 0.1, bottom: footY - 30 * u, width: w * 0.4 }
    : { x: pad, top: y + 6 * u, bottom: footY - 270 * u, width: w - pad * 2 };
  const cardSize = Math.max(200 * u, Math.min(qrArea.width, qrArea.bottom - qrArea.top, side ? 520 * u : 640 * u));
  const cardX = side ? qrArea.x + (qrArea.width - cardSize) / 2 : (w - cardSize) / 2;
  const cardY = side ? (qrArea.top + qrArea.bottom) / 2 - cardSize / 2 - 40 * u : qrArea.top;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 40 * u;
  ctx.shadowOffsetY = 18 * u;
  rr(ctx, cardX, cardY, cardSize, cardSize, 36 * u);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();
  if (qrImg) {
    const inner = cardSize - 56 * u;
    ctx.drawImage(qrImg, cardX + 28 * u, cardY + 28 * u, inner, inner);
  }

  // llamado a la acción
  const ctaText = (o.cta || DEFAULT_QR_FLYER_TEXTS.cta).trim();
  ctx.font = `800 ${Math.round((side ? 40 : 52) * u)}px ${SANS}`;
  const ctaW = Math.min(side ? qrArea.width : w - pad * 2, ctx.measureText(ctaText).width + 90 * u);
  const ctaH = (side ? 78 : 100) * u;
  const ctaX = cardX + cardSize / 2 - ctaW / 2;
  const ctaY = cardY + cardSize + 30 * u;
  ctx.save();
  ctx.shadowColor = rgba(accent, 0.45);
  ctx.shadowBlur = 24 * u;
  rr(ctx, ctaX, ctaY, ctaW, ctaH, ctaH / 2);
  ctx.fillStyle = o.style === 'vibrante' ? '#0F172A' : accent;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = o.style === 'vibrante' ? '#FFD60A' : onColor(accent);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ctaText, ctaX + ctaW / 2, ctaY + ctaH / 2 + 2 * u, ctaW - 24 * u);

  // link corto debajo del llamado
  ctx.fillStyle = soft;
  ctx.font = `600 ${Math.round(24 * u)}px ${SANS}`;
  ctx.fillText(shortUrl(o.url), ctaX + ctaW / 2, ctaY + ctaH + 34 * u, side ? qrArea.width : w - pad * 2);

  // pie de contacto
  if (contactLines.length) {
    const barBg = o.style === 'elegante' ? '#1F1A17' : o.style === 'vibrante' ? '#0F172A' : o.style === 'minimal' ? accent : 'rgba(255,255,255,0.1)';
    ctx.fillStyle = barBg;
    if (o.style === 'elegante') ctx.fillRect(w * 0.05, footY, w * 0.9, footH);
    else ctx.fillRect(0, footY, w, footH);
    ctx.fillStyle = o.style === 'minimal' ? onColor(accent) : '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    contactLines.forEach((line, i) => {
      ctx.font = `${i === 0 ? 700 : 600} ${Math.round((i === 0 ? 38 : 30) * u)}px ${SANS}`;
      const ly = footY + footH / (contactLines.length + 1) * (i + 1);
      ctx.fillText(line, w / 2, ly, w - pad * 1.2);
    });
  }

  return canvas.toDataURL('image/png');
}
