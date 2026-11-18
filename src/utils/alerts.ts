import { Boleta, DistributorConfig, BoletaAlertStatus } from '../types';

export function calculateAlertStatus(
  boleta: Boleta,
  config: DistributorConfig,
  currentDateStr?: string
): BoletaAlertStatus {
  // Use either provided date or today's local date
  const now = currentDateStr ? new Date(currentDateStr + 'T12:00:00') : new Date();
  const saleDate = new Date(boleta.saleDate + 'T12:00:00');
  const dueDate = new Date(boleta.dueDate + 'T12:00:00');

  const diffTimeSale = now.getTime() - saleDate.getTime();
  const daysElapsed = Math.max(0, Math.floor(diffTimeSale / (1000 * 60 * 60 * 24)));

  const diffTimeDue = dueDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTimeDue / (1000 * 60 * 60 * 24));
  const daysPastDueDate = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

  const graceThreshold = config.overdueGraceDays !== undefined ? config.overdueGraceDays : 5;
  const isPastGracePeriod = daysPastDueDate >= graceThreshold;
  const isExtended = Boolean(boleta.extensionDays && boleta.extensionDays > 0);
  const isOverdueOrToday = daysRemaining <= 0;

  // 1. REGLA ESTRICTA SOLICITADA POR EL USUARIO:
  // 5 días posteriores a la fecha de vencimiento -> ENTRA EN ROJO (FIADO VENCIDO CRÍTICO)
  // Ej: Si vence a los 7 días, el día 12 (7 + 5) ya empieza a aparecer en rojo como plata que ya debió cobrarse
  if (isPastGracePeriod) {
    return {
      daysElapsed,
      daysRemaining,
      daysPastDueDate,
      isPastGracePeriod: true,
      isExtended,
      category: 'critical_overdue_grace',
      categoryLabel: `Fiado Vencido (+${daysPastDueDate}d)`,
      badgeColor: 'bg-[#B91C1C] text-white border-[#991B1B] font-bold',
      actionMessage: `Fiado vencido hace ${daysPastDueDate} días (superó los ${graceThreshold} días posteriores al vencimiento). Plata pendiente de cobro prioritario.`,
      shouldNotifyVendedor: true,
      shouldNotifyAdmin: true,
      isOverdueOrToday: true,
      isUrgentAlertMode: true,
    };
  }

  // 2. Si tiene prórroga activa y está dentro del nuevo plazo
  if (isExtended && !isOverdueOrToday) {
    return {
      daysElapsed,
      daysRemaining,
      daysPastDueDate: 0,
      isPastGracePeriod: false,
      isExtended: true,
      category: 'normal',
      categoryLabel: `Prorrogada (+${boleta.extensionDays}d · ${daysRemaining}d rest.)`,
      badgeColor: 'bg-[#E9EEF5] text-[#0B1933] border-[#B6C2D2] dark:bg-[#13264A] dark:text-[#E2E8F0] dark:border-[#B6C2D2]/30 font-semibold',
      actionMessage: `Boleta con prórroga activa de ${boleta.extensionDays} días. Nuevo vencimiento: ${formatDateEs(boleta.dueDate)}.`,
      shouldNotifyVendedor: false,
      shouldNotifyAdmin: false,
      isOverdueOrToday: false,
      isUrgentAlertMode: false,
    };
  }

  // 3. MORA CRÍTICA MÁXIMA (15+ días desde la venta)
  if (daysElapsed >= 15) {
    return {
      daysElapsed,
      daysRemaining,
      daysPastDueDate,
      isPastGracePeriod,
      isExtended,
      category: 'critical_15d',
      categoryLabel: `Mora Crítica (${daysElapsed}d sin pago)`,
      badgeColor: 'bg-[#991B1B] text-white border-[#7F1D1D] font-bold',
      actionMessage: `Alerta crítica: la boleta #${boleta.boletaNumber} lleva ${daysElapsed} días sin estar paga. Prioridad máxima de cobro.`,
      shouldNotifyVendedor: true,
      shouldNotifyAdmin: true,
      isOverdueOrToday: true,
      isUrgentAlertMode: true,
    };
  }

  // 4. MODO ALERTA (10+ días desde la venta)
  if (daysElapsed >= 10) {
    return {
      daysElapsed,
      daysRemaining,
      daysPastDueDate,
      isPastGracePeriod,
      isExtended,
      category: 'critical_10d',
      categoryLabel: `Modo Alerta (${daysElapsed}d sin pago)`,
      badgeColor: 'bg-[#DC2626] text-white border-[#B91C1C] font-semibold',
      actionMessage: `Boleta #${boleta.boletaNumber} con ${daysElapsed} días emitida sin pago. Notificación enviada a dueños y vendedor.`,
      shouldNotifyVendedor: true,
      shouldNotifyAdmin: true,
      isOverdueOrToday: true,
      isUrgentAlertMode: true,
    };
  }

  // 5. Vencida o vence hoy (1 a 4 días tras vencimiento, antes del límite de gracia de 5 días)
  if (isOverdueOrToday) {
    return {
      daysElapsed,
      daysRemaining,
      daysPastDueDate,
      isPastGracePeriod: false,
      isExtended,
      category: 'overdue_today',
      categoryLabel: daysRemaining === 0 ? 'Vence Hoy · Cobrar' : `Vencida hace ${daysPastDueDate}d`,
      badgeColor: 'bg-rose-50 text-[#991B1B] border-rose-200 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-800',
      actionMessage: 'Boleta en fecha de cobro. El vendedor debe pasar por el comercio hoy.',
      shouldNotifyVendedor: true,
      shouldNotifyAdmin: true,
      isOverdueOrToday: true,
      isUrgentAlertMode: false,
    };
  }

  // 6. Alerta 6 días a Dueños
  const adminAlertThreshold = config.adminAlertDays || 6;
  if (daysElapsed >= adminAlertThreshold) {
    return {
      daysElapsed,
      daysRemaining,
      daysPastDueDate,
      isPastGracePeriod: false,
      isExtended,
      category: 'admin_6d',
      categoryLabel: 'Alerta 6 Días (Dueños)',
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800',
      actionMessage: `Lleva ${daysElapsed} días sin cobro. Aviso enviado a dueños y vendedor a cargo.`,
      shouldNotifyVendedor: true,
      shouldNotifyAdmin: true,
      isOverdueOrToday: false,
      isUrgentAlertMode: false,
    };
  }

  // 7. Recordatorio 2 días a Vendedor
  const vendedorReminderThreshold = config.vendedorReminderDays || 2;
  if (daysElapsed >= vendedorReminderThreshold) {
    return {
      daysElapsed,
      daysRemaining,
      daysPastDueDate,
      isPastGracePeriod: false,
      isExtended,
      category: 'vendedor_2d',
      categoryLabel: 'Recordatorio 2 Días',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
      actionMessage: `Lleva ${daysElapsed} días emitida. Recordatorio preventivo al vendedor.`,
      shouldNotifyVendedor: true,
      shouldNotifyAdmin: false,
      isOverdueOrToday: false,
      isUrgentAlertMode: false,
    };
  }

  // 8. Al día en término
  return {
    daysElapsed,
    daysRemaining,
    daysPastDueDate: 0,
    isPastGracePeriod: false,
    isExtended,
    category: 'normal',
    categoryLabel: `Al día (${daysRemaining}d rest.)`,
    badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-800',
    actionMessage: `Boleta firmada en término. Vence en ${daysRemaining} días.`,
    shouldNotifyVendedor: false,
    shouldNotifyAdmin: false,
    isOverdueOrToday: false,
    isUrgentAlertMode: false,
  };
}

export function formatCurrency(amount: number, symbol = '$'): string {
  return `${symbol} ${Number(amount || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateEs(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Calcula la fecha del próximo miércoles a partir de una fecha dada
 */
export function getNextWednesday(fromDateStr?: string): { dateStr: string; daysUntil: number } {
  const base = fromDateStr ? new Date(fromDateStr + 'T12:00:00') : new Date();
  const dayOfWeek = base.getDay(); // 0: Dom, 1: Lun, 2: Mar, 3: Mié, 4: Jue, 5: Vie, 6: Sáb
  let daysToAdd = (3 - dayOfWeek + 7) % 7;
  if (daysToAdd === 0) daysToAdd = 7; // Si hoy es miércoles, el próximo miércoles es en 7 días

  const targetDate = new Date(base);
  targetDate.setDate(base.getDate() + daysToAdd);
  return {
    dateStr: targetDate.toISOString().split('T')[0],
    daysUntil: daysToAdd,
  };
}

/**
 * Calcula el desglose financiero de una boleta considerando pagos parciales / entregas a cuenta.
 * Permite que la boleta mantenga su monto original y se visualice el saldo restante adeudado.
 */
export function getBoletaBalance(boleta: Boleta): {
  originalAmount: number;
  totalCreditNotes: number;
  hasCreditNotes: boolean;
  netAmount: number;
  totalPaid: number;
  balanceDue: number;
  isFullyPaid: boolean;
  hasPartialPayments: boolean;
  percentagePaid: number;
  lateSurchargeApplied: number;
  earlyPaymentDiscountApplied: number;
} {
  const originalAmount = Number(boleta.amount) || 0;
  const totalCreditNotes = (boleta.creditNotes || []).reduce(
    (acc, cn) => acc + (Number(cn.amount) || 0),
    0
  );
  const netAmount = Math.max(0, Math.round((originalAmount - totalCreditNotes) * 100) / 100);
  const totalPaid = (boleta.partialPayments || []).reduce(
    (acc, p) => acc + (Number(p.amount) || 0),
    0
  );
  const balanceDue = Math.max(0, Math.round((netAmount - totalPaid) * 100) / 100);
  const percentagePaid =
    netAmount > 0 ? Math.min(100, Math.round((totalPaid / netAmount) * 100)) : 100;

  return {
    originalAmount,
    totalCreditNotes: Math.round(totalCreditNotes * 100) / 100,
    hasCreditNotes: (boleta.creditNotes && boleta.creditNotes.length > 0) || totalCreditNotes > 0,
    netAmount,
    totalPaid,
    balanceDue,
    isFullyPaid: balanceDue <= 0,
    hasPartialPayments: (boleta.partialPayments && boleta.partialPayments.length > 0) || false,
    percentagePaid,
    lateSurchargeApplied: Number(boleta.lateSurchargeApplied) || 0,
    earlyPaymentDiscountApplied: Number(boleta.earlyPaymentDiscountApplied) || 0,
  };
}

/**
 * Sugerencia de recargo opcional por mora en plazos largos (sin descuentos por pago en término).
 */
export function getSuggestedLateSurcharge(
  boleta: Boleta,
  config: DistributorConfig,
  currentDateStr?: string
): {
  isEnabled: boolean;
  isEligible: boolean;
  daysPastDueDate: number;
  afterDaysThreshold: number;
  surchargePercent: number;
  suggestedAmount: number;
} {
  const isEnabled = Boolean(config.lateSurchargeEnabled);
  const surchargePercent = Math.max(0, Number(config.lateSurchargePercent) || 0);
  const afterDaysThreshold = Math.max(1, Number(config.lateSurchargeAfterDays) || 5);
  const status = calculateAlertStatus(boleta, config, currentDateStr);
  const bal = getBoletaBalance(boleta);

  const isEligible =
    isEnabled &&
    surchargePercent > 0 &&
    bal.balanceDue > 0 &&
    status.daysPastDueDate >= afterDaysThreshold;

  const suggestedAmount = isEligible
    ? Math.round(bal.balanceDue * (surchargePercent / 100) * 100) / 100
    : 0;

  return {
    isEnabled,
    isEligible,
    daysPastDueDate: status.daysPastDueDate,
    afterDaysThreshold,
    surchargePercent,
    suggestedAmount,
  };
}

