import { Boleta, Client, DistributorConfig } from '../types';
import { calculateAlertStatus, formatCurrency, formatDateEs, getBoletaBalance } from './alerts';

export interface ClientStatementRenderParams {
  client: Client;
  pendingBoletas: Boleta[];
  paidBoletas?: Boleta[];
  config: DistributorConfig;
  currentDateRef?: string;
  includeRecentPaid?: boolean;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 3 && ctx.measureText(`${truncated}...`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}...`;
}

async function renderClientStatementCanvas(
  params: ClientStatementRenderParams
): Promise<HTMLCanvasElement> {
  const {
    client,
    pendingBoletas,
    paidBoletas = [],
    config,
    currentDateRef,
    includeRecentPaid = true,
  } = params;

  const sym = config.currencySymbol || '$';
  const todayStr = currentDateRef || new Date().toISOString().split('T')[0];
  const timeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const sortedPending = [...pendingBoletas]
    .filter((b) => b.status === 'pending')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const visiblePending = sortedPending.slice(0, 14);
  const extraPendingCount = Math.max(0, sortedPending.length - visiblePending.length);

  const totalDebt = sortedPending.reduce((acc, b) => acc + getBoletaBalance(b).balanceDue, 0);
  const totalPartialPaid = sortedPending.reduce((acc, b) => acc + getBoletaBalance(b).totalPaid, 0);

  const recentPaid = includeRecentPaid
    ? [...paidBoletas]
        .sort((a, b) => (b.paidAt || b.saleDate || '').localeCompare(a.paidAt || a.saleDate || ''))
        .slice(0, 3)
    : [];

  const width = 980;
  const padX = 48;

  const headerH = 148;
  const clientInfoH = 132;
  const kpiH = 112;
  const pendingHeaderH = 54;
  const rowH = 54;
  const pendingRowsH =
    visiblePending.length > 0 ? 44 + visiblePending.length * rowH + (extraPendingCount > 0 ? 34 : 0) : 92;
  const recentPaidH = recentPaid.length > 0 ? 64 + recentPaid.length * 36 : 0;
  const showAliasBox = totalDebt > 0 && Boolean(config.merchantPaymentAlias || config.merchantPaymentCvu);
  const aliasH = showAliasBox ? 116 : 0;
  const footerH = 74;

  const totalH =
    headerH +
    20 +
    clientInfoH +
    18 +
    kpiH +
    22 +
    pendingHeaderH +
    pendingRowsH +
    (recentPaidH > 0 ? 22 + recentPaidH : 0) +
    (aliasH > 0 ? 22 + aliasH : 0) +
    24 +
    footerH;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, totalH);

  // Border frame
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, totalH - 2);

  // Header Navy Band
  ctx.fillStyle = '#091428';
  ctx.fillRect(0, 0, width, headerH);

  // Silver bottom hairline under header
  ctx.fillStyle = '#B6C2D2';
  ctx.fillRect(0, headerH - 3, width, 3);

  let titleStartX = padX;
  const logoImg = config.distributorLogoUrl ? await loadImageSafe(config.distributorLogoUrl) : null;
  if (logoImg) {
    const logoSize = 76;
    // Logo con su propia forma, sin cuadro ni fondo detrás
    const ratio = Math.min(logoSize / logoImg.width, logoSize / logoImg.height);
    const lw = logoImg.width * ratio;
    const lh = logoImg.height * ratio;
    ctx.drawImage(logoImg, padX + (logoSize - lw) / 2, 34 + (logoSize - lh) / 2, lw, lh);
    titleStartX = padX + logoSize + 20;
  }

  ctx.fillStyle = '#94A3B8';
  ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('RESUMEN DE CUENTA CORRIENTE EN TIEMPO REAL', titleStartX, 46);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 30px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(truncateText(ctx, config.distributorName || 'Comercio', 460), titleStartX, 86);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '600 14px "Plus Jakarta Sans", system-ui, sans-serif';
  const contactTop = [
    config.distributorPhone ? `Tel: ${config.distributorPhone}` : '',
    config.distributorEmail || '',
  ]
    .filter(Boolean)
    .join(' · ');
  if (contactTop) {
    ctx.fillText(truncateText(ctx, contactTop, 460), titleStartX, 114);
  }

  // Right badge: Date/Time
  ctx.textAlign = 'right';
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '800 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('ESTADO DE CUENTA', width - padX, 52);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 15px "JetBrains Mono", monospace';
  ctx.fillText(`Emitido: ${formatDateEs(todayStr)}`, width - padX, 82);
  ctx.fillText(`Hora: ${timeStr} hs`, width - padX, 106);
  ctx.textAlign = 'left';

  let cursorY = headerH + 20;

  // Client Info Card
  drawRoundedRect(ctx, padX, cursorY, width - padX * 2, clientInfoH, 12);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('TITULAR / CLIENTE CONSULTADO', padX + 22, cursorY + 28);

  ctx.fillStyle = '#091428';
  ctx.font = '800 24px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(truncateText(ctx, client.name || 'Cliente', 560), padX + 22, cursorY + 60);

  ctx.fillStyle = '#475569';
  ctx.font = '500 15px "Plus Jakarta Sans", system-ui, sans-serif';
  const line1 = [
    client.clientNumber ? `N° ${client.clientNumber}` : '',
    client.contactPerson && client.contactPerson !== client.name ? `Contacto: ${client.contactPerson}` : '',
    client.phone ? `WhatsApp: ${client.phone}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');
  ctx.fillText(truncateText(ctx, line1 || 'Ficha comercial registrada', 560), padX + 22, cursorY + 88);

  const line2 = [
    client.address || '',
    client.zone ? `Zona: ${client.zone}` : '',
    client.creditLimit && client.creditLimit > 0 ? `Tope Fiado: ${formatCurrency(client.creditLimit, sym)}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');
  if (line2) {
    ctx.fillStyle = '#64748B';
    ctx.font = '500 13px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(truncateText(ctx, line2, 560), padX + 22, cursorY + 112);
  }

  // Status Pill on Right of Client Box
  const pillW = 195;
  const pillH = 42;
  const pillX = width - padX - pillW - 20;
  const pillY = cursorY + 42;
  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 10);
  if (totalDebt <= 0) {
    ctx.fillStyle = '#ECFDF5';
    ctx.fill();
    ctx.strokeStyle = '#6EE7B7';
    ctx.stroke();
    ctx.fillStyle = '#047857';
  } else {
    ctx.fillStyle = '#FEF2F2';
    ctx.fill();
    ctx.strokeStyle = '#FCA5A5';
    ctx.stroke();
    ctx.fillStyle = '#991B1B';
  }
  ctx.textAlign = 'center';
  ctx.font = '800 14px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(totalDebt <= 0 ? 'CUENTA AL DÍA' : 'SALDO PENDIENTE', pillX + pillW / 2, pillY + 26);
  ctx.textAlign = 'left';

  cursorY += clientInfoH + 18;

  // 3 KPI Boxes
  const gap = 16;
  const boxW = (width - padX * 2 - gap * 2) / 3;

  // KPI 1: Total Balance
  drawRoundedRect(ctx, padX, cursorY, boxW, kpiH, 12);
  ctx.fillStyle = totalDebt > 0 ? '#FEF2F2' : '#ECFDF5';
  ctx.fill();
  ctx.strokeStyle = totalDebt > 0 ? '#FCA5A5' : '#6EE7B7';
  ctx.stroke();

  ctx.fillStyle = totalDebt > 0 ? '#991B1B' : '#047857';
  ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('SALDO TOTAL ADEUDADO', padX + 18, cursorY + 30);
  ctx.font = '800 30px "JetBrains Mono", monospace';
  ctx.fillText(formatCurrency(totalDebt, sym), padX + 18, cursorY + 72);
  ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(totalDebt > 0 ? 'Exigible según vencimiento' : 'Sin deuda abierta', padX + 18, cursorY + 96);

  // KPI 2: Comprobantes
  const kpi2X = padX + boxW + gap;
  drawRoundedRect(ctx, kpi2X, cursorY, boxW, kpiH, 12);
  ctx.fillStyle = '#F4F6F9';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('COMPROBANTES ABIERTOS', kpi2X + 18, cursorY + 30);
  ctx.fillStyle = '#091428';
  ctx.font = '800 30px "JetBrains Mono", monospace';
  ctx.fillText(`${sortedPending.length}`, kpi2X + 18, cursorY + 72);
  ctx.fillStyle = '#64748B';
  ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    sortedPending.length === 1 ? '1 boleta/cuota pendiente' : `${sortedPending.length} boletas/cuotas`,
    kpi2X + 18,
    cursorY + 96
  );

  // KPI 3: Partial Paid on Pending or Available Credit
  const kpi3X = padX + (boxW + gap) * 2;
  drawRoundedRect(ctx, kpi3X, cursorY, boxW, kpiH, 12);
  ctx.fillStyle = '#F4F6F9';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('ENTREGAS PARCIALES RECIBIDAS', kpi3X + 18, cursorY + 30);
  ctx.fillStyle = '#091428';
  ctx.font = '800 28px "JetBrains Mono", monospace';
  ctx.fillText(formatCurrency(totalPartialPaid, sym), kpi3X + 18, cursorY + 72);
  ctx.fillStyle = '#64748B';
  ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('A cuenta sobre boletas abiertas', kpi3X + 18, cursorY + 96);

  cursorY += kpiH + 22;

  // Pending Boletas Section Title
  ctx.fillStyle = '#091428';
  ctx.font = '800 16px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`DETALLE DE COMPROBANTES PENDIENTES (${sortedPending.length})`, padX, cursorY + 24);
  ctx.fillStyle = '#64748B';
  ctx.font = '500 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Ordenado por fecha de vencimiento', padX, cursorY + 44);
  cursorY += pendingHeaderH;

  if (visiblePending.length === 0) {
    drawRoundedRect(ctx, padX, cursorY, width - padX * 2, 82, 12);
    ctx.fillStyle = '#ECFDF5';
    ctx.fill();
    ctx.strokeStyle = '#A7F3D0';
    ctx.stroke();
    ctx.fillStyle = '#065F46';
    ctx.font = '700 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Tu cuenta corriente se encuentra 100% al día. No registrás saldos pendientes.',
      width / 2,
      cursorY + 47
    );
    ctx.textAlign = 'left';
    cursorY += 92;
  } else {
    // Table Header
    ctx.fillStyle = '#0B1933';
    drawRoundedRect(ctx, padX, cursorY, width - padX * 2, 40, 8);
    ctx.fill();

    ctx.fillStyle = '#E2E8F0';
    ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('COMPROBANTE', padX + 16, cursorY + 25);
    ctx.fillText('DETALLE / CONCEPTO', padX + 190, cursorY + 25);
    ctx.fillText('COMPRA', padX + 470, cursorY + 25);
    ctx.fillText('VENCIMIENTO', padX + 585, cursorY + 25);
    ctx.textAlign = 'right';
    ctx.fillText('ENTREGADO', padX + 755, cursorY + 25);
    ctx.fillText('SALDO PEND.', width - padX - 16, cursorY + 25);
    ctx.textAlign = 'left';

    cursorY += 44;

    visiblePending.forEach((b, idx) => {
      const bal = getBoletaBalance(b);
      const st = calculateAlertStatus(b, config, todayStr);

      ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      ctx.fillRect(padX, cursorY, width - padX * 2, rowH);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, cursorY + rowH);
      ctx.lineTo(width - padX, cursorY + rowH);
      ctx.stroke();

      // Column 1: #Boleta + Cuota
      ctx.fillStyle = '#091428';
      ctx.font = '800 14px "JetBrains Mono", monospace';
      ctx.fillText(`#${b.boletaNumber}`, padX + 16, cursorY + 24);
      ctx.fillStyle = st.daysPastDueDate > 0 ? '#991B1B' : '#64748B';
      ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
      const subTag =
        b.totalInstallments && b.installmentNumber
          ? `Cuota ${b.installmentNumber}/${b.totalInstallments}`
          : b.saleMode === 'sena_reserva'
          ? 'Reserva c/ Seña'
          : st.daysPastDueDate > 0
          ? `Vencida +${st.daysPastDueDate}d`
          : 'Vigente';
      ctx.fillText(subTag, padX + 16, cursorY + 42);

      // Column 2: Detail
      ctx.fillStyle = '#1E293B';
      ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(
        truncateText(ctx, b.itemSummary || b.notes || 'Operación comercial', 260),
        padX + 190,
        cursorY + 32
      );

      // Column 3: Sale Date
      ctx.fillStyle = '#475569';
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.fillText(formatDateEs(b.saleDate), padX + 470, cursorY + 32);

      // Column 4: Due Date + State
      ctx.fillStyle = st.daysPastDueDate > 0 ? '#991B1B' : '#091428';
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.fillText(formatDateEs(b.dueDate), padX + 585, cursorY + 25);
      ctx.fillStyle = st.daysPastDueDate > 0 ? '#991B1B' : st.daysRemaining === 0 ? '#B45309' : '#047857';
      ctx.font = '700 11px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(
        st.daysPastDueDate > 0
          ? `Mora ${st.daysPastDueDate}d`
          : st.daysRemaining === 0
          ? 'Vence hoy'
          : `En término`,
        padX + 585,
        cursorY + 42
      );

      // Column 5 & 6: Partial + Balance Due
      ctx.textAlign = 'right';
      ctx.fillStyle = bal.totalPaid > 0 ? '#047857' : '#94A3B8';
      ctx.font = '600 13px "JetBrains Mono", monospace';
      ctx.fillText(bal.totalPaid > 0 ? formatCurrency(bal.totalPaid, sym) : '—', padX + 755, cursorY + 32);

      ctx.fillStyle = '#991B1B';
      ctx.font = '800 15px "JetBrains Mono", monospace';
      ctx.fillText(formatCurrency(bal.balanceDue, sym), width - padX - 16, cursorY + 32);
      ctx.textAlign = 'left';

      cursorY += rowH;
    });

    if (extraPendingCount > 0) {
      ctx.fillStyle = '#475569';
      ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(
        `... y ${extraPendingCount} comprobante(s) pendiente(s) adicional(es) incluidos en el saldo total.`,
        padX + 16,
        cursorY + 24
      );
      cursorY += 34;
    }
  }

  // Recent Paid Summary (Optional)
  if (recentPaid.length > 0) {
    cursorY += 22;
    drawRoundedRect(ctx, padX, cursorY, width - padX * 2, recentPaidH, 12);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = '#CBD5E1';
    ctx.stroke();

    ctx.fillStyle = '#091428';
    ctx.font = '800 14px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('ÚLTIMOS COMPROBANTES CANCELADOS', padX + 20, cursorY + 32);

    let yPaid = cursorY + 60;
    recentPaid.forEach((p) => {
      const pBal = getBoletaBalance(p);
      const pDate = p.paidAt ? formatDateEs(p.paidAt.split('T')[0]) : formatDateEs(p.saleDate);
      ctx.fillStyle = '#047857';
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.fillText(`#${p.boletaNumber}`, padX + 20, yPaid);

      ctx.fillStyle = '#334155';
      ctx.font = '500 13px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(
        truncateText(ctx, `Cancelado el ${pDate} · ${p.itemSummary || 'Comprobante'}`, 520),
        padX + 140,
        yPaid
      );

      ctx.textAlign = 'right';
      ctx.fillStyle = '#047857';
      ctx.font = '700 14px "JetBrains Mono", monospace';
      ctx.fillText(`${formatCurrency(pBal.originalAmount, sym)} · PAGADO`, width - padX - 20, yPaid);
      ctx.textAlign = 'left';

      yPaid += 36;
    });

    cursorY += recentPaidH;
  }

  // Merchant Payment Alias Box (if balance > 0)
  if (showAliasBox) {
    cursorY += 22;
    drawRoundedRect(ctx, padX, cursorY, width - padX * 2, aliasH, 12);
    ctx.fillStyle = '#F0F9FF';
    ctx.fill();
    ctx.strokeStyle = '#7DD3FC';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#0369A1';
    ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('DATOS PARA TRANSFERENCIA / PAGO INMEDIATO', padX + 22, cursorY + 30);

    ctx.fillStyle = '#091428';
    ctx.font = '800 22px "JetBrains Mono", monospace';
    const aliasText = config.merchantPaymentAlias
      ? `Alias: ${config.merchantPaymentAlias}`
      : `CVU/CBU: ${config.merchantPaymentCvu}`;
    ctx.fillText(truncateText(ctx, aliasText, width - padX * 2 - 44), padX + 22, cursorY + 66);

    const bankMeta = [
      config.merchantPaymentCvu && config.merchantPaymentAlias ? `CVU: ${config.merchantPaymentCvu}` : '',
      config.merchantPaymentBank ? `Billetera/Banco: ${config.merchantPaymentBank}` : '',
      config.merchantPaymentHolder ? `Titular: ${config.merchantPaymentHolder}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (bankMeta) {
      ctx.fillStyle = '#334155';
      ctx.font = '600 14px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(truncateText(ctx, bankMeta, width - padX * 2 - 44), padX + 22, cursorY + 95);
    }
    cursorY += aliasH;
  }

  // Footer
  cursorY += 24;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(2, cursorY, width - 4, footerH - 2);
  ctx.strokeStyle = '#CBD5E1';
  ctx.beginPath();
  ctx.moveTo(0, cursorY);
  ctx.lineTo(width, cursorY);
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = '600 14px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    contactTop || `${config.distributorName || 'Comercio'} · Gestión Comercial`,
    padX,
    cursorY + 44
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Estado de cuenta emitido al instante', width - padX, cursorY + 44);
  ctx.textAlign = 'left';

  return canvas;
}

export async function renderClientStatementToDataUrl(
  params: ClientStatementRenderParams
): Promise<string> {
  const canvas = await renderClientStatementCanvas(params);
  return canvas.toDataURL('image/png');
}

function sanitizeFilenamePart(value: string): string {
  return (value || 'Cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export async function downloadClientStatementPng(
  params: ClientStatementRenderParams
): Promise<void> {
  const dataUrl = await renderClientStatementToDataUrl(params);
  const dateTag = (params.currentDateRef || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const safeClient = sanitizeFilenamePart(params.client.name);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `Estado_Cuenta_${safeClient}_${dateTag}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function copyClientStatementImage(
  params: ClientStatementRenderParams
): Promise<boolean> {
  try {
    const dataUrl = await renderClientStatementToDataUrl(params);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Empaqueta el canvas renderizado en un documento PDF binario estándar (%PDF-1.4 /DCTDecode)
 * sin dependencias externas ni ventanas emergentes, para descargar y adjuntar directo en WhatsApp.
 */
export function buildPdfBlobFromJpegCanvas(canvas: HTMLCanvasElement): Blob {
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.94);
  const base64 = jpegDataUrl.split(',')[1] || '';
  const rawStr = atob(base64);
  const jpegBytes = new Uint8Array(rawStr.length);
  for (let i = 0; i < rawStr.length; i++) {
    jpegBytes[i] = rawStr.charCodeAt(i);
  }

  const pageWidthPt = 595.28;
  const pageHeightPt = Number(((canvas.height / canvas.width) * pageWidthPt).toFixed(2));
  const imgWidthPx = canvas.width;
  const imgHeightPx = canvas.height;

  const encoder = new TextEncoder();
  const contentStream = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = encoder.encode(contentStream);

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0]; // 1-based object offsets; index 0 is free obj
  let currentLength = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentLength += bytes.length;
  };
  const pushStr = (str: string) => pushBytes(encoder.encode(str));

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // Obj 1: Catalog
  offsets.push(currentLength);
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Obj 2: Pages
  offsets.push(currentLength);
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // Obj 3: Page
  offsets.push(currentLength);
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`
  );

  // Obj 4: Page content stream
  offsets.push(currentLength);
  pushStr(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
  pushBytes(contentBytes);
  pushStr('\nendstream\nendobj\n');

  // Obj 5: JPEG Image XObject
  offsets.push(currentLength);
  pushStr(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgWidthPx} /Height ${imgHeightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr('\nendstream\nendobj\n');

  // Cross-reference table
  const xrefOffset = currentLength;
  pushStr(`xref\n0 ${offsets.length}\n`);
  pushStr('0000000000 65535 f \n');
  for (let i = 1; i < offsets.length; i++) {
    pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const blobParts: BlobPart[] = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });
  return new Blob(blobParts, { type: 'application/pdf' });
}

export async function downloadClientStatementPdf(
  params: ClientStatementRenderParams
): Promise<void> {
  const canvas = await renderClientStatementCanvas(params);
  const pdfBlob = buildPdfBlobFromJpegCanvas(canvas);
  const blobUrl = URL.createObjectURL(pdfBlob);
  const dateTag = (params.currentDateRef || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const safeClient = sanitizeFilenamePart(params.client.name);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `Estado_Cuenta_${safeClient}_${dateTag}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
}
