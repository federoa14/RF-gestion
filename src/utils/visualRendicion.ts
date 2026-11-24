import { DistributorConfig, RendicionItemStatus, RendicionRouteItem, Salesperson, SalespersonRendicion } from '../types';
import { formatCurrency, formatDateEs } from './alerts';
import { buildPdfBlobFromJpegCanvas } from './visualStatement';

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

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(`${t}...`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}...`;
}

function sanitizeFilePart(value: string): string {
  return (value || 'Reparto')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
}

const OUTCOME_LABEL: Record<RendicionItemStatus, string> = {
  cobrada_total: 'Cobrada (Efect.)',
  transferencia_directa: 'Transferencia',
  pago_parcial: 'Pago Parcial',
  cheque_otro: 'Cheque / Otro',
  prorroga_promesa: 'Prórroga',
  no_cobrada: 'No Cobrada',
};

export interface RouteSheetPdfParams {
  config: DistributorConfig;
  salesperson: Salesperson;
  routeDate: string;
  scope: 'due_or_overdue' | 'all_pending';
  items: RendicionRouteItem[];
}

export async function downloadRouteSheetPdf(params: RouteSheetPdfParams): Promise<void> {
  const { config, salesperson, routeDate, scope, items } = params;
  const sym = config.currencySymbol || '$';
  const visibleRows = items.slice(0, 26);
  const rowH = 44;
  const width = 1120;
  const height = Math.max(760, 330 + visibleRows.length * rowH + 110);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 0, width, height);

  // Header Navy
  ctx.fillStyle = '#091428';
  ctx.fillRect(0, 0, width, 132);
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(0, 129, width, 3);

  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
  ctx.fillText('HOJA DE RUTA Y COBRANZA EN CALLE — MAYORISTA / DISTRIBUIDORA', 40, 34);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText(truncateText(ctx, config.distributorName || 'Distribuidora', 620), 40, 72);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '15px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `Preventista / Repartidor: ${salesperson.name} · Zona: ${salesperson.zone || 'General'} · Alcance: ${
      scope === 'due_or_overdue' ? 'Vencidas y Hoy' : 'Todas las Pendientes'
    }`,
    40,
    104
  );

  // Date & Total badge
  const totalExpected = items.reduce((s, r) => s + r.expectedBalance, 0);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Fecha de Ruta: ${formatDateEs(routeDate)}`, width - 40, 48);
  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(`A Cobrar: ${formatCurrency(totalExpected, sym)}`, width - 40, 86);
  ctx.fillStyle = '#94A3B8';
  ctx.font = '13px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${items.length} comprobante(s) en hoja`, width - 40, 110);
  ctx.textAlign = 'left';

  // Table Container
  const tableY = 160;
  const tableW = width - 80;
  drawRoundedRect(ctx, 40, tableY, tableW, 44 + Math.max(1, visibleRows.length) * rowH, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Table Header
  ctx.fillStyle = '#0B1933';
  ctx.fillRect(40, tableY, tableW, 42);
  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
  ctx.fillText('BOLETA', 58, tableY + 26);
  ctx.fillText('CLIENTE / DIRECCIÓN', 178, tableY + 26);
  ctx.fillText('VENCIMIENTO', 565, tableY + 26);
  ctx.textAlign = 'right';
  ctx.fillText('SALDO', 775, tableY + 26);
  ctx.textAlign = 'left';
  ctx.fillText('COBRADO ($)', 808, tableY + 26);
  ctx.fillText('EFEC / TRF / OBS.', 945, tableY + 26);

  visibleRows.forEach((row, idx) => {
    const ry = tableY + 42 + idx * rowH;
    if (idx % 2 === 1) {
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(41, ry, tableW - 2, rowH);
    }
    ctx.strokeStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.moveTo(40, ry + rowH);
    ctx.lineTo(40 + tableW, ry + rowH);
    ctx.stroke();

    ctx.fillStyle = '#0B1933';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`#${row.boletaNumber}`, 58, ry + 27);

    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.fillText(truncateText(ctx, row.clientName, 360), 178, ry + 20);
    ctx.fillStyle = '#64748B';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.fillText(truncateText(ctx, row.clientAddress || 'Sin dirección cargada', 360), 178, ry + 36);

    ctx.fillStyle = row.dueDate <= routeDate ? '#991B1B' : '#334155';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(formatDateEs(row.dueDate), 565, ry + 27);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0B1933';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(formatCurrency(row.expectedBalance, sym), 775, ry + 27);
    ctx.textAlign = 'left';

    // Blank write-in box for street collection
    ctx.strokeStyle = '#94A3B8';
    ctx.strokeRect(808, ry + 10, 118, 24);
    ctx.strokeRect(945, ry + 10, 118, 24);
  });

  if (items.length > visibleRows.length) {
    ctx.fillStyle = '#475569';
    ctx.font = 'italic 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      `+ ${items.length - visibleRows.length} comprobante(s) adicional(es) en el sistema.`,
      44,
      tableY + 42 + visibleRows.length * rowH + 22
    );
  }

  // Footer Signature Box
  const footerY = height - 88;
  ctx.fillStyle = '#0B1933';
  ctx.fillRect(0, footerY, width, 88);
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '13px system-ui, -apple-system, sans-serif';
  ctx.fillText('Firma Preventista / Repartidor: ________________________________', 40, footerY + 38);
  ctx.fillText('Recibió Caja Administración: ________________________________', 580, footerY + 38);
  ctx.fillStyle = '#94A3B8';
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `Emitido desde ${config.distributorName || 'Sistema'} · Total en hoja: ${formatCurrency(totalExpected, sym)}`,
    40,
    footerY + 66
  );

  const blob = buildPdfBlobFromJpegCanvas(canvas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Hoja_Ruta_${sanitizeFilePart(salesperson.name)}_${routeDate.replace(/-/g, '')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

export async function downloadRendicionComprobantePdf(
  rendicion: SalespersonRendicion,
  config: DistributorConfig
): Promise<void> {
  const sym = config.currencySymbol || '$';
  const visibleRows = rendicion.items.slice(0, 24);
  const rowH = 40;
  const width = 1120;
  const height = Math.max(820, 390 + visibleRows.length * rowH + 100);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = '#091428';
  ctx.fillRect(0, 0, width, 134);
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(0, 131, width, 3);

  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
  ctx.fillText('COMPROBANTE DE RENDICIÓN DE CAJA — REPARTO MAYORISTA', 40, 34);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${rendicion.rendicionNumber} · ${truncateText(ctx, rendicion.salespersonName, 540)}`, 40, 74);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '15px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `${config.distributorName || 'Distribuidora'} · Zona: ${rendicion.zone || 'General'} · Controló: ${rendicion.settledByAdmin}`,
    40,
    106
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Fecha: ${formatDateEs(rendicion.date)}`, width - 40, 52);
  ctx.fillStyle = '#94A3B8';
  ctx.font = '13px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    rendicion.appliedToBoletas ? 'Pagos aplicados a boletas' : 'Solo arqueo informativo',
    width - 40,
    80
  );
  ctx.textAlign = 'left';

  // 4 Summary Cards
  const cardsY = 154;
  const cardW = (width - 80 - 36) / 4;
  const diffColor =
    Math.abs(rendicion.cashDifference) < 0.01
      ? '#065F46'
      : rendicion.cashDifference < 0
      ? '#991B1B'
      : '#1D4ED8';
  const diffLabel =
    Math.abs(rendicion.cashDifference) < 0.01
      ? 'CUADRA EXACTO'
      : rendicion.cashDifference < 0
      ? `FALTANTE ${formatCurrency(Math.abs(rendicion.cashDifference), sym)}`
      : `SOBRANTE +${formatCurrency(rendicion.cashDifference, sym)}`;

  const summaryBoxes = [
    { label: 'EFECTIVO SEGÚN BOLETAS', value: formatCurrency(rendicion.systemCashCollected, sym), color: '#0B1933' },
    { label: 'EFECTIVO FÍSICO RENDIDO', value: formatCurrency(rendicion.declaredCashInHand, sym), color: '#0B1933' },
    { label: 'DIFERENCIA DE CAJA', value: diffLabel, color: diffColor },
    {
      label: 'TRANSF. + CHEQUES/OTROS',
      value: formatCurrency(rendicion.systemTransferCollected + rendicion.systemOtherCollected, sym),
      color: '#0B1933',
    },
  ];

  summaryBoxes.forEach((box, idx) => {
    const bx = 40 + idx * (cardW + 12);
    drawRoundedRect(ctx, bx, cardsY, cardW, 78, 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillText(box.label, bx + 14, cardsY + 26);

    ctx.fillStyle = box.color;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(truncateText(ctx, box.value, cardW - 24), bx + 14, cardsY + 56);
  });

  // Table
  const tableY = 252;
  const tableW = width - 80;
  drawRoundedRect(ctx, 40, tableY, tableW, 40 + Math.max(1, visibleRows.length) * rowH, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.stroke();

  ctx.fillStyle = '#0B1933';
  ctx.fillRect(40, tableY, tableW, 40);
  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('BOLETA', 56, tableY + 25);
  ctx.fillText('CLIENTE', 165, tableY + 25);
  ctx.fillText('RESULTADO', 475, tableY + 25);
  ctx.textAlign = 'right';
  ctx.fillText('EFECTIVO', 760, tableY + 25);
  ctx.fillText('TRANSF / OTRO', 905, tableY + 25);
  ctx.textAlign = 'left';
  ctx.fillText('OBSERVACIÓN', 925, tableY + 25);

  visibleRows.forEach((row, idx) => {
    const ry = tableY + 40 + idx * rowH;
    if (idx % 2 === 1) {
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(41, ry, tableW - 2, rowH);
    }
    ctx.fillStyle = '#0B1933';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`#${row.boletaNumber}`, 56, ry + 25);

    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(truncateText(ctx, row.clientName, 290), 165, ry + 25);

    ctx.fillStyle = '#334155';
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    ctx.fillText(OUTCOME_LABEL[row.outcome], 475, ry + 25);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0B1933';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(formatCurrency(row.collectedCash, sym), 760, ry + 25);
    ctx.fillText(formatCurrency(row.collectedTransfer + row.collectedOther, sym), 905, ry + 25);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#64748B';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    const obsText =
      row.outcome === 'prorroga_promesa' && row.extensionDays
        ? `+${row.extensionDays}d${row.note ? ` · ${row.note}` : ''}`
        : row.note || '-';
    ctx.fillText(truncateText(ctx, obsText, 140), 925, ry + 25);
  });

  // Footer
  const footerY = height - 76;
  ctx.fillStyle = '#0B1933';
  ctx.fillRect(0, footerY, width, 76);
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '13px system-ui, -apple-system, sans-serif';
  ctx.fillText('Firma Preventista: ______________________________', 40, footerY + 42);
  ctx.fillText(`Recibió (${rendicion.settledByAdmin}): ______________________________`, 540, footerY + 42);

  const blob = buildPdfBlobFromJpegCanvas(canvas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${rendicion.rendicionNumber}_${sanitizeFilePart(rendicion.salespersonName)}_${rendicion.date.replace(/-/g, '')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}
