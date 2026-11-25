/**
 * Diseñador de flyers (se dibuja en el navegador, sin costo ni claves).
 * Recibe textos estructurados y arma una pieza con jerarquía visual: titular grande,
 * foto destacada, precio protagonista, sello de descuento y datos de contacto.
 */

export type FlyerStyleKey = 'moderno' | 'vibrante' | 'elegante' | 'minimal';

export interface FlyerStyleDef {
  key: FlyerStyleKey;
  label: string;
  note: string;
  accent: string;
}

export const FLYER_STYLES: FlyerStyleDef[] = [
  { key: 'moderno', label: 'Moderno', note: 'Oscuro, con brillo y color', accent: '#22D3EE' },
  { key: 'vibrante', label: 'Vibrante', note: 'Colorido, para ofertas fuertes', accent: '#FF5A1F' },
  { key: 'elegante', label: 'Elegante', note: 'Claro, serifa y detalles dorados', accent: '#B08D57' },
  { key: 'minimal', label: 'Minimal', note: 'Limpio y aireado', accent: '#0B1933' },
];

export interface FlyerOptions {
  style: FlyerStyleKey;
  headline: string;
  detail: string;
  price: string;
  oldPrice: string;
  badge: string;
  validity: string;
  storeName: string;
  phone?: string;
  logoUrl?: string;
  photoUrl?: string;
  accent?: string;
  width: number;
  height: number;
}

type Ctx = CanvasRenderingContext2D;

const SANS = '"Plus Jakarta Sans", "Inter", system-ui, sans-serif';
const SERIF = '"Playfair Display", Georgia, serif';

function hexToRgb(hex: string): [number, number, number] {
  const h = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#0B1933';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function mix(hex: string, other: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(other);
  const c = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `#${[c(r1, r2), c(g1, g2), c(b1, b2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function onColor(bg: string): string {
  return luminance(bg) > 0.45 ? '#0F172A' : '#FFFFFF';
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Achica la letra hasta que el texto entre en `maxLines` renglones. */
function fitText(
  ctx: Ctx,
  text: string,
  weight: string,
  family: string,
  startSize: number,
  minSize: number,
  maxW: number,
  maxLines: number
): { lines: string[]; size: number } {
  let size = startSize;
  for (;;) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines || size <= minSize) {
      return { lines: lines.slice(0, maxLines), size };
    }
    size -= Math.max(1, Math.round(startSize * 0.04));
  }
}

function loadImage(src?: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawCover(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ratio = Math.max(w / img.width, h / img.height);
  const dw = img.width * ratio;
  const dh = img.height * ratio;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function burst(ctx: Ctx, cx: number, cy: number, outer: number, inner: number, points: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`800 40px "Plus Jakarta Sans"`),
      document.fonts.load(`600 40px "Plus Jakarta Sans"`),
      document.fonts.load(`700 40px "Playfair Display"`),
      document.fonts.load(`700 40px "Inter"`),
    ]);
  } catch {
    // si no cargan, se usa la letra del sistema
  }
}

export async function renderFlyer(o: FlyerOptions): Promise<string> {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = o.width;
  canvas.height = o.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar el lienzo gráfico.');
  const w = o.width;
  const h = o.height;
  const u = Math.min(w, h) / 1000; // unidad de escala
  const def = FLYER_STYLES.find((s) => s.key === o.style) || FLYER_STYLES[0];
  const accent = /^#[0-9a-fA-F]{6}$/.test(o.accent || '') ? (o.accent as string) : def.accent;

  // Paleta por estilo
  let bg1 = '#0B1226';
  let bg2 = '#13264A';
  let text = '#FFFFFF';
  let soft = 'rgba(255,255,255,0.78)';
  let headFont = SANS;
  let headWeight = '800';
  let upper = false;
  if (o.style === 'vibrante') {
    bg1 = accent;
    bg2 = mix(accent, '#FFD60A', 0.55);
    text = onColor(mix(accent, '#FFD60A', 0.25));
    soft = text === '#FFFFFF' ? 'rgba(255,255,255,0.88)' : 'rgba(15,23,42,0.78)';
    upper = true;
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
    headWeight = '800';
  } else {
    bg1 = mix('#0B1226', accent, 0.08);
    bg2 = mix('#13264A', accent, 0.22);
  }

  // Fondo
  const g = ctx.createLinearGradient(0, 0, w * 0.8, h);
  g.addColorStop(0, bg1);
  g.addColorStop(1, bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Decoración según estilo
  ctx.save();
  if (o.style === 'moderno') {
    const rg = ctx.createRadialGradient(w * 0.85, h * 0.18, 0, w * 0.85, h * 0.18, w * 0.7);
    rg.addColorStop(0, rgba(accent, 0.45));
    rg.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2 * u;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(w * 0.1, h * 0.95, (180 + i * 90) * u, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (o.style === 'vibrante') {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const px = w * 0.55 + c * 46 * u;
        const py = h * 0.04 + r * 46 * u;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, (9 - r) * 0.9 * u), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = rgba('#FFFFFF', 0.12);
    ctx.beginPath();
    ctx.arc(w * 0.05, h * 0.92, 260 * u, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.style === 'elegante') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3 * u;
    ctx.strokeRect(w * 0.035, h * 0.035, w * 0.93, h * 0.93);
    ctx.lineWidth = 1.2 * u;
    ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 16 * u);
    ctx.fillStyle = rgba(accent, 0.07);
    ctx.beginPath();
    ctx.arc(w * 0.92, h * 0.12, 300 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const pad = w * 0.08;
  const logo = await loadImage(o.logoUrl);
  const photo = await loadImage(o.photoUrl);

  // Pie de contacto (se calcula primero para repartir el espacio)
  const barH = 92 * u;
  const barY = h - barH - (o.style === 'elegante' ? h * 0.05 : 0);

  // Zonas: en formato vertical todo va apilado; en cuadrado u horizontal, texto a la izquierda y foto a la derecha
  const side = w >= h * 0.85;
  const textX = pad;
  const textW = side ? w * 0.54 - pad : w - pad * 2;
  const heroX = side ? w * 0.6 : pad;
  const heroW = side ? w * 0.34 : w - pad * 2;

  // Bloque de precio (anclado abajo)
  const hasOld = Boolean(o.oldPrice.trim());
  const hasPrice = Boolean(o.price.trim());
  const hasValidity = Boolean(o.validity.trim());
  let priceSize = 0;
  let priceBoxW = 0;
  let priceBoxH = 0;
  if (hasPrice) {
    const pr = fitText(ctx, o.price.trim(), '800', SANS, (side ? 130 : 150) * u, 50 * u, textW - 60 * u, 1);
    priceSize = pr.size;
    ctx.font = `800 ${priceSize}px ${SANS}`;
    priceBoxW = ctx.measureText(pr.lines[0] || '').width + 60 * u;
    priceBoxH = priceSize * 1.25;
  }
  const blockH =
    (hasOld ? 56 * u : 0) + (hasPrice ? priceBoxH + 18 * u : 0) + (hasValidity ? 56 * u : 0);
  const blockY = barY - 26 * u - blockH;

  // Marca arriba
  let y = h * (side ? 0.09 : 0.075);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let brandX = textX;
  if (logo) {
    const ls = 64 * u;
    ctx.save();
    rr(ctx, brandX, y - ls / 2, ls, ls, 14 * u);
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(brandX, y - ls / 2, ls, ls);
    drawCover(ctx, logo, brandX, y - ls / 2, ls, ls);
    ctx.restore();
    brandX += ls + 16 * u;
  }
  ctx.fillStyle = o.style === 'moderno' ? accent : text;
  ctx.font = `800 ${Math.round(28 * u)}px ${SANS}`;
  const brand = (o.storeName || 'Mi comercio').toUpperCase();
  const brandMax = textW - (brandX - textX);
  let brandText = brand;
  while (ctx.measureText(brandText).width > brandMax && brandText.length > 4) brandText = brandText.slice(0, -2);
  if (brandText !== brand) brandText += '…';
  ctx.fillText(brandText, brandX, y);

  // Titular: se achica hasta entrar en el ancho y en el alto disponible
  y += 56 * u;
  const headline = (o.headline || 'Oferta especial').trim();
  const headText = upper ? headline.toUpperCase() : headline;
  const detailLines = o.detail.trim() ? (side ? 3 : 2) : 0;
  const detailReserve = detailLines ? 30 * u + 38 * u * 1.35 * Math.min(detailLines, 2) : 0;
  const headRoom = (side ? blockY - 20 * u : y + h * 0.28) - y - detailReserve;
  let head = fitText(ctx, headText, headWeight, headFont, (side ? 100 : 118) * u, 44 * u, textW, side ? 4 : 3);
  while (head.lines.length * head.size * 1.08 > headRoom && head.size > 40 * u) {
    head = fitText(ctx, headText, headWeight, headFont, head.size - 4 * u, 36 * u, textW, side ? 4 : 3);
    if (head.size <= 40 * u) break;
  }
  ctx.textBaseline = 'top';
  ctx.fillStyle = text;
  ctx.font = `${headWeight} ${head.size}px ${headFont}`;
  head.lines.forEach((line, i) => ctx.fillText(line, textX, y + i * head.size * 1.08));
  y += head.lines.length * head.size * 1.08 + 16 * u;

  // Detalle
  if (o.detail.trim()) {
    const det = fitText(ctx, o.detail.trim(), '600', SANS, 36 * u, 24 * u, textW, detailLines);
    ctx.fillStyle = soft;
    ctx.font = `600 ${det.size}px ${SANS}`;
    det.lines.forEach((line, i) => ctx.fillText(line, textX, y + i * det.size * 1.35));
    y += det.lines.length * det.size * 1.35 + 10 * u;
  }

  // Hero (foto o composición)
  const heroY = side ? h * 0.1 : y + 14 * u;
  const heroBottom = side ? barY - 40 * u : blockY - 26 * u;
  const heroH = Math.max(h * 0.12, heroBottom - heroY);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 40 * u;
  ctx.shadowOffsetY = 18 * u;
  rr(ctx, heroX, heroY, heroW, heroH, 36 * u);
  ctx.fillStyle = o.style === 'moderno' ? 'rgba(255,255,255,0.08)' : rgba(accent, 0.14);
  ctx.fill();
  ctx.restore();
  ctx.save();
  rr(ctx, heroX, heroY, heroW, heroH, 36 * u);
  ctx.clip();
  if (photo) {
    drawCover(ctx, photo, heroX, heroY, heroW, heroH);
    const fade = ctx.createLinearGradient(0, heroY + heroH * 0.6, 0, heroY + heroH);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = fade;
    ctx.fillRect(heroX, heroY, heroW, heroH);
  } else {
    const cg = ctx.createRadialGradient(
      heroX + heroW / 2, heroY + heroH / 2, 0, heroX + heroW / 2, heroY + heroH / 2, Math.max(heroW, heroH) * 0.6
    );
    cg.addColorStop(0, rgba(accent, 0.55));
    cg.addColorStop(1, rgba(accent, 0.05));
    ctx.fillStyle = cg;
    ctx.fillRect(heroX, heroY, heroW, heroH);
    ctx.fillStyle = rgba('#FFFFFF', 0.9);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${headWeight} ${Math.round(Math.min(heroW, heroH) * 0.55)}px ${headFont}`;
    ctx.fillText((o.storeName || 'M').trim().charAt(0).toUpperCase(), heroX + heroW / 2, heroY + heroH / 2);
  }
  ctx.restore();

  // Sello de descuento
  if (o.badge.trim()) {
    const R = (side ? 100 : 112) * u;
    const bx = Math.min(w - R - 10 * u, heroX + heroW - R * 0.35);
    const by = heroY + R * 0.45;
    const stickerBg = o.style === 'vibrante' ? '#0F172A' : o.style === 'elegante' ? accent : '#FFD60A';
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate((-12 * Math.PI) / 180);
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 18 * u;
    ctx.shadowOffsetY = 8 * u;
    burst(ctx, 0, 0, R, R * 0.82, 18);
    ctx.fillStyle = stickerBg;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = onColor(stickerBg);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const bt = fitText(ctx, o.badge.trim().toUpperCase(), '800', SANS, 62 * u, 24 * u, R * 1.4, 2);
    ctx.font = `800 ${bt.size}px ${SANS}`;
    const widest = Math.max(...bt.lines.map((l) => ctx.measureText(l).width));
    if (widest > R * 1.35) {
      bt.size = Math.floor((bt.size * R * 1.35) / widest);
      ctx.font = `800 ${bt.size}px ${SANS}`;
    }
    bt.lines.forEach((line, i) =>
      ctx.fillText(line, 0, (i - (bt.lines.length - 1) / 2) * bt.size * 1.05)
    );
    ctx.restore();
  }

  // Precio, precio anterior y vigencia
  let py = blockY;
  const priceX = textX;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  if (hasOld) {
    const oldLabel = `Antes ${o.oldPrice.trim()}`;
    ctx.font = `600 ${Math.round(38 * u)}px ${SANS}`;
    ctx.fillStyle = soft;
    ctx.fillText(oldLabel, priceX, py);
    const mw = ctx.measureText(oldLabel).width;
    ctx.strokeStyle = o.style === 'vibrante' ? text : '#EF4444';
    ctx.lineWidth = 4 * u;
    ctx.beginPath();
    ctx.moveTo(priceX + ctx.measureText('Antes ').width, py + 21 * u);
    ctx.lineTo(priceX + mw, py + 17 * u);
    ctx.stroke();
    py += 56 * u;
  }
  if (hasPrice) {
    const priceBg = o.style === 'vibrante' ? '#0F172A' : accent;
    ctx.save();
    ctx.shadowColor = rgba(accent, 0.45);
    ctx.shadowBlur = 30 * u;
    ctx.shadowOffsetY = 12 * u;
    rr(ctx, priceX, py, priceBoxW, priceBoxH, 26 * u);
    ctx.fillStyle = priceBg;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = o.style === 'vibrante' ? '#FFD60A' : onColor(accent);
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${priceSize}px ${SANS}`;
    ctx.fillText(o.price.trim(), priceX + 30 * u, py + priceBoxH / 2 + 3 * u);
    py += priceBoxH + 18 * u;
  }
  ctx.textBaseline = 'middle';
  if (hasValidity) {
    ctx.font = `700 ${Math.round(26 * u)}px ${SANS}`;
    const label = o.validity.trim();
    const lw = Math.min(ctx.measureText(label).width + 44 * u, textW);
    rr(ctx, priceX, py, lw, 50 * u, 25 * u);
    ctx.strokeStyle = o.style === 'moderno' ? 'rgba(255,255,255,0.5)' : text;
    ctx.lineWidth = 2.5 * u;
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.textAlign = 'left';
    ctx.fillText(label, priceX + 22 * u, py + 26 * u, lw - 30 * u);
  }

  // Pie de contacto
  const barBg = o.style === 'elegante' ? '#1F1A17' : o.style === 'vibrante' ? '#0F172A' : o.style === 'minimal' ? accent : 'rgba(255,255,255,0.1)';
  ctx.fillStyle = barBg;
  if (o.style === 'elegante') {
    ctx.fillRect(w * 0.05, barY, w * 0.9, barH);
  } else {
    ctx.fillRect(0, barY, w, barH);
  }
  ctx.fillStyle = o.style === 'minimal' ? onColor(accent) : '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(32 * u)}px ${SANS}`;
  const contact = o.phone?.trim() ? `Pedidos por WhatsApp · ${o.phone.trim()}` : 'Consultá precios y disponibilidad con tu vendedor';
  ctx.fillText(contact, w / 2, barY + barH / 2, w - pad * 1.2);

  return canvas.toDataURL('image/png');
}

export const FLYER_HEADLINE_IDEAS = [
  'Oferta de la semana',
  'Llegó lo nuevo',
  'Solo por hoy',
  'Liquidación total',
  'Combo ahorro',
  'Precio mayorista',
  'Últimas unidades',
  'Reponé tu stock',
];

export const FLYER_EXAMPLES: Array<
  Pick<FlyerOptions, 'headline' | 'detail' | 'price' | 'oldPrice' | 'badge' | 'validity' | 'style'>
> = [
  {
    headline: 'Oferta de la semana',
    detail: 'Pack de gaseosas 2.25 L x 6 unidades',
    price: '$14.900',
    oldPrice: '$18.500',
    badge: '-20%',
    validity: 'Hasta agotar stock',
    style: 'vibrante',
  },
  {
    headline: 'Llegó lo nuevo',
    detail: 'Colección otoño-invierno ya disponible en el local',
    price: '$29.900',
    oldPrice: '',
    badge: 'Nuevo',
    validity: 'Probate sin cargo',
    style: 'elegante',
  },
  {
    headline: 'Precio mayorista',
    detail: 'Comprá por bulto cerrado y ahorrá en cada compra',
    price: '$8.400',
    oldPrice: '$9.900',
    badge: '3x2',
    validity: 'Válido este mes',
    style: 'moderno',
  },
];
