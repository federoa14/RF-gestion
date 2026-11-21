import { DistributorConfig, SaleLineItem } from '../types';
import { formatCurrency, formatDateEs } from './alerts';
import type { ReceiptModalData } from '../components/PaymentReceiptModal';

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
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
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    const timer = setTimeout(() => resolve(null), 2000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function getItemModeText(mode: SaleLineItem['paymentMode']): string {
  if (mode === 'contado_hoy') return '1 Pago Hoy';
  if (mode === 'un_pago_fiado') return '1 Pago Fiado';
  return 'En Cuotas';
}

export async function renderVisualReceiptToDataUrl(
  receipt: ReceiptModalData,
  config: DistributorConfig
): Promise<string> {
  const sym = config.currencySymbol || '$';
  const isCompleted = Boolean(receipt.isFullSettlement || receipt.remainingBalance <= 0);
  const items = receipt.items || [];
  const summaryLines = receipt.basketSummaryLines || [];
  const hasAliasBlock = !isCompleted && Boolean(config.merchantPaymentAlias);
  const methodDisplay =
    receipt.paymentMethodLabel ||
    (receipt.paymentMethod === 'efectivo'
      ? 'Efectivo'
      : receipt.paymentMethod === 'transferencia'
      ? 'Transferencia / MP'
      : receipt.paymentMethod === 'cheque'
      ? 'Cheque'
      : receipt.paymentMethod === 'link_pago'
      ? 'Link de Pago / MP'
      : receipt.paymentMethod === 'fiado'
      ? 'Cuenta Corriente / Fiado'
      : receipt.paymentMethod || 'A coordinar');

  const width = 920;
  const padX = 48;
  const innerW = width - padX * 2;

  // Pre-measure height dynamically
  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = width;
  probeCanvas.height = 100;
  const pCtx = probeCanvas.getContext('2d')!;
  pCtx.font = '500 20px "Plus Jakarta Sans", system-ui, sans-serif';
  const wrappedNotes = receipt.notes ? wrapTextLines(pCtx, `Obs: ${receipt.notes}`, innerW - 36) : [];

  const headerH = 154;
  const hasDispatchMeta = Boolean(receipt.dispatchModalityLabel);
  const clientCardH = receipt.clientAddress || hasDispatchMeta ? 156 : 126;
  const itemsSectionH =
    items.length > 0 ? 74 + items.length * 52 + 20 : 0;
  const financeCardH = 224 + (wrappedNotes.length > 0 ? wrappedNotes.length * 26 + 18 : 0);
  const scheduleH =
    summaryLines.length > 0 ? 54 + summaryLines.length * 30 + 22 : 0;
  const aliasH = hasAliasBlock ? 116 : 0;
  const footerH = 74;

  const totalHeight =
    headerH +
    28 +
    clientCardH +
    22 +
    (itemsSectionH > 0 ? itemsSectionH + 22 : 0) +
    financeCardH +
    (scheduleH > 0 ? 22 + scheduleH : 0) +
    (aliasH > 0 ? 22 + aliasH : 0) +
    24 +
    footerH;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, totalHeight);

  // Outer hairline frame
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, totalHeight - 2);

  // Header band (Navy)
  ctx.fillStyle = '#091428';
  ctx.fillRect(0, 0, width, headerH);

  // Silver accent strip under header
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(0, headerH - 5, width, 5);

  // Optional logo or monogram box
  let logoX = padX;
  const logoImg = config.distributorLogoUrl
    ? await loadImageSafe(config.distributorLogoUrl)
    : null;

  if (logoImg) {
    drawRoundedRect(ctx, logoX, 34, 72, 72, 14);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(logoX, 34, 72, 72);
    ctx.drawImage(logoImg, logoX, 34, 72, 72);
    ctx.restore();
  } else {
    drawRoundedRect(ctx, logoX, 34, 72, 72, 14);
    ctx.fillStyle = '#162E59';
    ctx.fill();
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const initials = (config.distributorName || 'CO')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('');
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '800 28px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials || 'CO', logoX + 36, 72);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  const textStartX = logoX + 92;
  ctx.fillStyle = '#94A3B8';
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillText(
    `${receipt.receiptNumber} · ${receipt.saleModeLabel || (isCompleted ? 'COMPROBANTE CANCELADO' : 'COMPROBANTE DE OPERACIÓN')}`,
    textStartX,
    56
  );

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 32px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(config.distributorName || 'Comercio', textStartX, 98);

  // Top-right Date badge text
  ctx.textAlign = 'right';
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '600 17px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Fecha emisión', width - padX, 56);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillText(formatDateEs(receipt.paymentDate), width - padX, 92);
  ctx.textAlign = 'left';

  let cursorY = headerH + 28;

  // Client summary card
  drawRoundedRect(ctx, padX, cursorY, innerW, clientCardH, 16);
  ctx.fillStyle = '#F4F6F9';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Cliente / Titular', padX + 24, cursorY + 34);
  ctx.textAlign = 'right';
  ctx.fillText('Comprobante asociado', width - padX - 24, cursorY + 34);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#0B1933';
  ctx.font = '800 25px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(receipt.clientName || 'Cliente', padX + 24, cursorY + 66);

  ctx.textAlign = 'right';
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.fillText(`#${receipt.boletaNumber}`, width - padX - 24, cursorY + 66);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#475569';
  ctx.font = '500 18px "Plus Jakarta Sans", system-ui, sans-serif';
  if (receipt.clientAddress) {
    ctx.fillText(`Dir: ${receipt.clientAddress}`.slice(0, 62), padX + 24, cursorY + 98);
  }
  const metaRight = receipt.isDispatchReceipt
    ? `Pago: ${methodDisplay}${receipt.dispatchModalityLabel ? ` · ${receipt.dispatchModalityLabel}` : ''}`
    : receipt.salespersonName
    ? `Atendió: ${receipt.receivedBy || receipt.salespersonName}`
    : receipt.receivedBy
    ? `Recibió: ${receipt.receivedBy}`
    : '';
  if (metaRight) {
    ctx.fillText(metaRight.slice(0, 68), padX + 24, cursorY + (receipt.clientAddress ? 130 : 102));
  }

  cursorY += clientCardH + 22;

  // Items breakdown (if product items exist)
  if (items.length > 0) {
    drawRoundedRect(ctx, padX, cursorY, innerW, itemsSectionH, 16);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Header bar for items
    ctx.fillStyle = '#0B1933';
    drawRoundedRect(ctx, padX, cursorY, innerW, 48, 14);
    ctx.fill();
    ctx.fillRect(padX, cursorY + 26, innerW, 22);

    ctx.fillStyle = '#E2E8F0';
    ctx.font = '700 17px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`Detalle de Productos (${items.length})`, padX + 20, cursorY + 30);
    ctx.textAlign = 'right';
    ctx.fillText('Modalidad / Importe', width - padX - 20, cursorY + 30);
    ctx.textAlign = 'left';

    let rowY = cursorY + 84;
    items.forEach((item, idx) => {
      if (idx > 0) {
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padX + 20, rowY - 32);
        ctx.lineTo(width - padX - 20, rowY - 32);
        ctx.stroke();
      }

      ctx.fillStyle = '#0B1933';
      ctx.font = '700 19px "Plus Jakarta Sans", system-ui, sans-serif';
      const title = `${item.quantity}x ${item.name}`;
      ctx.fillText(title.slice(0, 44), padX + 20, rowY - 6);

      ctx.fillStyle = '#64748B';
      ctx.font = '500 15px "JetBrains Mono", monospace';
      const unitModeSuffix = receipt.hideUnitModeTag ? '' : ` · ${getItemModeText(item.paymentMode)}`;
      ctx.fillText(
        `Precio unit: ${formatCurrency(item.unitPrice, sym)}${unitModeSuffix}`,
        padX + 20,
        rowY + 14
      );

      ctx.textAlign = 'right';
      ctx.fillStyle = item.paymentMode === 'contado_hoy' || receipt.isDispatchReceipt ? '#047857' : '#0B1933';
      ctx.font = '700 20px "JetBrains Mono", monospace';
      ctx.fillText(formatCurrency(item.subtotal, sym), width - padX - 20, rowY + 4);
      ctx.textAlign = 'left';

      rowY += 52;
    });

    cursorY += itemsSectionH + 22;
  }

  // Financial Summary Card
  drawRoundedRect(ctx, padX, cursorY, innerW, financeCardH, 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#0B1933';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Top dark strip inside finance box
  ctx.fillStyle = '#0B1933';
  drawRoundedRect(ctx, padX, cursorY, innerW, 66, 14);
  ctx.fill();
  ctx.fillRect(padX, cursorY + 34, innerW, 32);

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '700 19px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    receipt.isDispatchReceipt ? 'Valor Final del Despacho' : 'Importe Abonado en este Comprobante',
    padX + 24,
    cursorY + 40
  );
  ctx.textAlign = 'right';
  ctx.fillStyle = '#34D399';
  ctx.font = '800 30px "JetBrains Mono", monospace';
  ctx.fillText(
    formatCurrency(receipt.isDispatchReceipt ? receipt.originalAmount : receipt.amountPaidNow, sym),
    width - padX - 24,
    cursorY + 43
  );
  ctx.textAlign = 'left';

  // Breakdown rows
  ctx.fillStyle = '#475569';
  ctx.font = '600 19px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    receipt.isDispatchReceipt ? 'Forma de pago acordada' : 'Total de la operación / boleta',
    padX + 24,
    cursorY + 106
  );
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0B1933';
  ctx.font = '700 20px "JetBrains Mono", monospace';
  ctx.fillText(
    receipt.isDispatchReceipt ? methodDisplay.slice(0, 32) : formatCurrency(receipt.originalAmount, sym),
    width - padX - 24,
    cursorY + 106
  );
  ctx.textAlign = 'left';

  ctx.fillStyle = '#475569';
  ctx.font = '600 19px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Total abonado / confirmado', padX + 24, cursorY + 142);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#047857';
  ctx.font = '700 21px "JetBrains Mono", monospace';
  ctx.fillText(
    formatCurrency(receipt.totalPaidAccumulated, sym),
    width - padX - 24,
    cursorY + 142
  );
  ctx.textAlign = 'left';

  // Divider
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX + 24, cursorY + 162);
  ctx.lineTo(width - padX - 24, cursorY + 162);
  ctx.stroke();

  ctx.fillStyle = '#0B1933';
  ctx.font = '800 21px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    isCompleted ? 'Estado final' : 'Saldo pendiente a abonar',
    padX + 24,
    cursorY + 200
  );
  ctx.textAlign = 'right';
  if (isCompleted) {
    ctx.fillStyle = '#047857';
    ctx.font = '800 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      receipt.isDispatchReceipt ? 'DESPACHADO · ABONADO' : 'CANCELADO AL 100%',
      width - padX - 24,
      cursorY + 200
    );
  } else {
    ctx.fillStyle = '#991B1B';
    ctx.font = '800 28px "JetBrains Mono", monospace';
    ctx.fillText(formatCurrency(receipt.remainingBalance, sym), width - padX - 24, cursorY + 200);
  }
  ctx.textAlign = 'left';

  if (wrappedNotes.length > 0) {
    let noteY = cursorY + 236;
    ctx.fillStyle = '#475569';
    ctx.font = '500 17px "Plus Jakarta Sans", system-ui, sans-serif';
    for (const line of wrappedNotes) {
      ctx.fillText(line, padX + 24, noteY);
      noteY += 24;
    }
  }

  cursorY += financeCardH;

  // Schedule / Basket Split summary block
  if (summaryLines.length > 0) {
    cursorY += 22;
    drawRoundedRect(ctx, padX, cursorY, innerW, scheduleH, 14);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#0B1933';
    ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Resumen de Cobro y Vencimientos', padX + 24, cursorY + 34);

    let sY = cursorY + 66;
    ctx.fillStyle = '#334155';
    ctx.font = '600 17px "JetBrains Mono", monospace';
    for (const sLine of summaryLines) {
      ctx.fillText(sLine, padX + 24, sY);
      sY += 30;
    }
    cursorY += scheduleH;
  }

  // Merchant Payment Alias block
  if (hasAliasBlock) {
    cursorY += 22;
    drawRoundedRect(ctx, padX, cursorY, innerW, aliasH, 14);
    ctx.fillStyle = '#F4F6F9';
    ctx.fill();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = '700 15px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('DATOS PARA TRANSFERIR EL SALDO PENDIENTE', padX + 24, cursorY + 34);

    ctx.fillStyle = '#091428';
    ctx.font = '800 24px "JetBrains Mono", monospace';
    ctx.fillText(`Alias: ${config.merchantPaymentAlias}`, padX + 24, cursorY + 68);

    const extraBank = [
      config.merchantPaymentBank ? `Banco/App: ${config.merchantPaymentBank}` : '',
      config.merchantPaymentHolder ? `Titular: ${config.merchantPaymentHolder}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    if (extraBank) {
      ctx.fillStyle = '#334155';
      ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(extraBank, padX + 24, cursorY + 96);
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
  ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
  const contactStr = [
    config.distributorPhone ? `Tel: ${config.distributorPhone}` : '',
    config.distributorEmail || '',
  ]
    .filter(Boolean)
    .join(' · ');
  ctx.fillText(
    contactStr || 'Comprobante comercial emitido digitalmente',
    padX,
    cursorY + 44
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = '600 15px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Conservá este comprobante', width - padX, cursorY + 44);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}

export async function downloadVisualReceiptPng(
  receipt: ReceiptModalData,
  config: DistributorConfig
): Promise<void> {
  const dataUrl = await renderVisualReceiptToDataUrl(receipt, config);
  const link = document.createElement('a');
  const safeNum = (receipt.receiptNumber || 'recibo').replace(/[^a-zA-Z0-9_-]/g, '_');
  link.href = dataUrl;
  link.download = `Comprobante_${safeNum}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function copyVisualReceiptImage(
  receipt: ReceiptModalData,
  config: DistributorConfig
): Promise<boolean> {
  try {
    const dataUrl = await renderVisualReceiptToDataUrl(receipt, config);
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
