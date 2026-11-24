import { Boleta, BusinessRubro, DistributorConfig, SaleLineItem } from '../types';
import { addDaysToDate, getBoletaBalance } from './alerts';
import { RUBRO_ESCALATION_DEFAULTS } from './alertThresholds';

export interface RubroProfile {
  id: BusinessRubro;
  label: string;
  shortLabel: string;
  badgeTag: string;
  description: string;
  // Criterio único de términos: "Boleta" para el documento de deuda en todos los rubros,
  // "Cuota" solo cuando está financiada, "Venta" para el acto comercial, "Pago" para el dinero que entra.
  saleSingular: string;
  salePlural: string;
  sellerLabel: string;
  clientLabel: string;
  clientPlaceholder: string;
  itemPlaceholder: string;
  enforceSingleBoletaDefault: boolean;
  allowInstallments: boolean;
  allowSenaReserva: boolean;
  allowBasketMode: boolean;
  allowMultipleOperationsPerClient: boolean;
  requireSalesperson: boolean;
  emphasizeCreditLimit: boolean;
  defaultClientCreditLimit: number;
  defaultTermDays: number;
  defaultVendedorReminderDays: number;
  defaultAdminAlertDays: number;
  defaultOverdueGraceDays: number;
  defaultInstallmentInterestPercent: number;
  suggestedTerms: number[];
  featureBullets: string[];
}

export const RUBRO_PROFILES: Record<BusinessRubro, RubroProfile> = {
  distribuidora: {
    id: 'distribuidora',
    label: 'Mayorista / Distribuidora',
    shortLabel: 'Mayorista / Distrib.',
    badgeTag: '1 FACTURA P/ CLIENTE · TOPE $',
    description:
      'Perfil mayorista: estricto control de 1 sola boleta pendiente por cliente, tope máximo en pesos ($), preventistas en ruta y plazos cortos.',
    saleSingular: 'Boleta',
    salePlural: 'Boletas',
    sellerLabel: 'Preventista / Vendedor',
    clientLabel: 'Comercio / Cliente',
    clientPlaceholder: 'Ej. Almacén Los Amigos',
    itemPlaceholder: 'Ej. Pedido mayorista de bebidas / lácteos / mercadería',
    enforceSingleBoletaDefault: true,
    allowInstallments: false,
    allowSenaReserva: false,
    allowBasketMode: false,
    allowMultipleOperationsPerClient: false,
    requireSalesperson: true,
    emphasizeCreditLimit: true,
    defaultClientCreditLimit: 250000,
    defaultTermDays: 7,
    defaultVendedorReminderDays: 2,
    defaultAdminAlertDays: 6,
    defaultOverdueGraceDays: 5,
    defaultInstallmentInterestPercent: 0,
    suggestedTerms: [5, 7, 10, 15],
    featureBullets: [
      'Máximo 1 boleta pendiente por cliente (bloqueo automático)',
      'Tope máximo de fiado ($) editable por comercio',
      'Sin cuotas personales ni canasto · Plazos cortos (5 a 15d)',
    ],
  },
  indumentaria: {
    id: 'indumentaria',
    label: 'Local de Ropa / Indumentaria / Calzado',
    shortLabel: 'Indumentaria',
    badgeTag: 'CUOTAS 2-12 · SEÑAS · PRENDAS',
    description:
      'Perfil indumentaria: múltiples compras y prendas abiertas por cliente, señas/reservas y financiación en 2, 3, 4, 5, 6, 9 o 12 cuotas personales con interés.',
    saleSingular: 'Boleta',
    salePlural: 'Boletas',
    sellerLabel: 'Vendedora / Mostrador',
    clientLabel: 'Cliente',
    clientPlaceholder: 'Ej. Camila Fernández',
    itemPlaceholder: 'Ej. Jean Mom T38 + Campera Eco Cuero Negra',
    enforceSingleBoletaDefault: false,
    allowInstallments: true,
    allowSenaReserva: true,
    allowBasketMode: true,
    allowMultipleOperationsPerClient: true,
    requireSalesperson: false,
    emphasizeCreditLimit: false,
    defaultClientCreditLimit: 0,
    defaultTermDays: 30,
    defaultVendedorReminderDays: 7,
    defaultAdminAlertDays: 15,
    defaultOverdueGraceDays: 7,
    defaultInstallmentInterestPercent: 10,
    suggestedTerms: [15, 30, 45, 60],
    featureBullets: [
      'Múltiples prendas y compras simultáneas por persona',
      'Planes de 2 a 12 cuotas personales con interés sugerido en vivo (%)',
      'Señas / Reservas y Canasto por prenda con comprobante',
    ],
  },
  ecommerce_kiosco: {
    id: 'ecommerce_kiosco',
    label: 'E-Commerce / Despensa / Kiosco',
    shortLabel: 'E-Commerce / Kiosco',
    badgeTag: 'CANASTO MIXTO · POR PRODUCTO',
    description:
      'Perfil minorista ágil: canasto dinámico por producto (qué va en 1 pago hoy, qué en fiado y qué en cuotas) con comprobante visual.',
    saleSingular: 'Boleta',
    salePlural: 'Boletas',
    sellerLabel: 'Caja / Despacho',
    clientLabel: 'Cliente',
    clientPlaceholder: 'Ej. Lucas Pereyra / Pedido Web #412',
    itemPlaceholder: 'Ej. Combo Despensa / Remera Oversize / Gaseosa x6',
    enforceSingleBoletaDefault: false,
    allowInstallments: true,
    allowSenaReserva: true,
    allowBasketMode: true,
    allowMultipleOperationsPerClient: true,
    requireSalesperson: false,
    emphasizeCreditLimit: true,
    defaultClientCreditLimit: 150000,
    defaultTermDays: 15,
    defaultVendedorReminderDays: 3,
    defaultAdminAlertDays: 7,
    defaultOverdueGraceDays: 5,
    defaultInstallmentInterestPercent: 8,
    suggestedTerms: [7, 15, 30, 45],
    featureBullets: [
      'Canasto dinámico por producto (1 Pago Hoy / Fiado / Cuotas)',
      'Carga rápida uno por uno al mismo cliente',
      'Tope sugerido por cliente y alertas cada 3 / 7 días',
    ],
  },
  comercio_fiado: {
    id: 'comercio_fiado',
    label: 'Comercio / Almacén / Barrio con Fiado',
    shortLabel: 'Comercio c/ Fiado',
    badgeTag: 'LIBRETA FIADO · ENTREGAS',
    description:
      'Perfil libreta digital: múltiples tickets simples y entregas a cuenta con tope máximo por cliente (sin cuotas financieras complejas).',
    saleSingular: 'Boleta',
    salePlural: 'Boletas',
    sellerLabel: 'Caja / Atendido por',
    clientLabel: 'Cliente / Vecino',
    clientPlaceholder: 'Ej. Marta Sánchez (Vecina)',
    itemPlaceholder: 'Ej. Compra semanal / despensa / productos varios',
    enforceSingleBoletaDefault: false,
    allowInstallments: false,
    allowSenaReserva: true,
    allowBasketMode: false,
    allowMultipleOperationsPerClient: true,
    requireSalesperson: false,
    emphasizeCreditLimit: true,
    defaultClientCreditLimit: 100000,
    defaultTermDays: 15,
    defaultVendedorReminderDays: 3,
    defaultAdminAlertDays: 10,
    defaultOverdueGraceDays: 5,
    defaultInstallmentInterestPercent: 0,
    suggestedTerms: [7, 15, 30],
    featureBullets: [
      'Varias boletas por cliente y pagos parciales',
      'Control de Tope de Fiado mensual por cliente',
      'Envío directo de resumen de deuda por WhatsApp',
    ],
  },
  cuenta_corriente: {
    id: 'cuenta_corriente',
    label: 'Cuenta Corriente / Corralón / Taller',
    shortLabel: 'Cuenta Corriente',
    badgeTag: 'MÚLTIPLES REMITOS · FIFO',
    description:
      'Perfil cuenta corriente comercial: múltiples remitos abiertos por empresa u obra, imputación FIFO de pagos a cuenta y plazos largos.',
    saleSingular: 'Boleta',
    salePlural: 'Boletas',
    sellerLabel: 'Responsable / Mostrador',
    clientLabel: 'Cliente / Empresa',
    clientPlaceholder: 'Ej. Constructora Sur / Taller El Rayo',
    itemPlaceholder: 'Ej. Materiales de obra / repuestos / servicio',
    enforceSingleBoletaDefault: false,
    allowInstallments: true,
    allowSenaReserva: true,
    allowBasketMode: true,
    allowMultipleOperationsPerClient: true,
    requireSalesperson: false,
    emphasizeCreditLimit: true,
    defaultClientCreditLimit: 500000,
    defaultTermDays: 30,
    defaultVendedorReminderDays: 10,
    defaultAdminAlertDays: 20,
    defaultOverdueGraceDays: 10,
    defaultInstallmentInterestPercent: 10,
    suggestedTerms: [15, 30, 45, 60],
    featureBullets: [
      'Múltiples remitos abiertos por cliente con cancelación FIFO',
      'Tope de cuenta corriente elevado y plazos de 15 a 60 días',
      'Estado de cuenta unificado y prórrogas rápidas',
    ],
  },
};

export function getRubroProfile(rubro?: BusinessRubro): RubroProfile {
  if (rubro && RUBRO_PROFILES[rubro]) {
    return RUBRO_PROFILES[rubro];
  }
  return RUBRO_PROFILES.distribuidora;
}

export function getBusinessLabels(config?: Partial<DistributorConfig>): RubroProfile & {
  enforceSingleBoleta: boolean;
} {
  const profile = getRubroProfile(config?.businessRubro);
  const enforceSingleBoleta =
    config?.enforceSinglePendingBoleta !== undefined
      ? config.enforceSinglePendingBoleta
      : profile.enforceSingleBoletaDefault;

  return {
    ...profile,
    enforceSingleBoleta,
  };
}

/**
 * Aplica completamente el perfil operativo de un rubro sobre la configuración del negocio
 * al cambiar de rubro sobre la marcha o crear una empresa/usuario nuevo.
 */
export function applyRubroProfileToConfig(
  currentConfig: DistributorConfig,
  nextRubro: BusinessRubro
): DistributorConfig {
  const profile = getRubroProfile(nextRubro);
  return {
    ...currentConfig,
    businessRubro: profile.id,
    enforceSinglePendingBoleta: profile.enforceSingleBoletaDefault,
    defaultTermDays: profile.defaultTermDays,
    vendedorReminderDays: profile.defaultVendedorReminderDays,
    adminAlertDays: profile.defaultAdminAlertDays,
    overdueGraceDays: profile.defaultOverdueGraceDays,
    overdueAlertDays: profile.defaultTermDays,
    saleAlertModeDays: RUBRO_ESCALATION_DEFAULTS[profile.id]?.alertModeDays,
    saleCriticalDays: RUBRO_ESCALATION_DEFAULTS[profile.id]?.criticalSaleDays,
    defaultClientCreditLimit: profile.defaultClientCreditLimit,
    defaultInstallmentInterestPercent: profile.defaultInstallmentInterestPercent,
  };
}

export interface InstallmentPlanPreviewItem {
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  capitalPart: number;
  interestPart: number;
  dueDate: string;
  termDays: number;
}

export interface InstallmentPlanPreview {
  baseAmount: number;
  downPayment: number;
  financedCapital: number;
  interestPercent: number;
  totalInterest: number;
  totalFinancedWithInterest: number;
  totalOperationValue: number; // downPayment + totalFinancedWithInterest
  installmentsCount: number;
  installmentBaseAmount: number;
  installments: InstallmentPlanPreviewItem[];
}

export function calculateInstallmentPlanPreview(params: {
  baseAmount: number;
  downPayment?: number;
  installmentsCount: number;
  interestPercent: number;
  intervalDays: number;
  saleDate: string;
  firstDueDate?: string;
}): InstallmentPlanPreview {
  const baseAmount = Math.max(0, Number(params.baseAmount) || 0);
  const downPayment = Math.min(baseAmount, Math.max(0, Number(params.downPayment) || 0));
  const financedCapital = Math.max(0, Math.round((baseAmount - downPayment) * 100) / 100);
  const interestPercent = Math.max(0, Number(params.interestPercent) || 0);
  const count = Math.min(12, Math.max(2, Math.floor(params.installmentsCount || 2)));
  const intervalDays = Math.max(1, Math.floor(params.intervalDays || 30));

  const totalInterest = Math.round(financedCapital * (interestPercent / 100) * 100) / 100;
  const totalFinancedWithInterest = Math.round((financedCapital + totalInterest) * 100) / 100;

  const perInstallmentRaw = Math.floor((totalFinancedWithInterest / count) * 100) / 100;
  const capitalPerInstallmentRaw = Math.floor((financedCapital / count) * 100) / 100;
  const interestPerInstallmentRaw = Math.floor((totalInterest / count) * 100) / 100;

  const firstDue =
    params.firstDueDate && params.firstDueDate >= params.saleDate
      ? params.firstDueDate
      : addDaysToDate(params.saleDate, intervalDays);

  const saleMs = new Date(`${params.saleDate}T12:00:00`).getTime();

  const installments: InstallmentPlanPreviewItem[] = [];
  let accumulatedAmount = 0;
  let accumulatedCapital = 0;
  let accumulatedInterest = 0;

  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const amount = isLast
      ? Math.round((totalFinancedWithInterest - accumulatedAmount) * 100) / 100
      : perInstallmentRaw;
    const capitalPart = isLast
      ? Math.round((financedCapital - accumulatedCapital) * 100) / 100
      : capitalPerInstallmentRaw;
    const interestPart = isLast
      ? Math.round((totalInterest - accumulatedInterest) * 100) / 100
      : interestPerInstallmentRaw;

    accumulatedAmount += amount;
    accumulatedCapital += capitalPart;
    accumulatedInterest += interestPart;

    const dueDate = i === 0 ? firstDue : addDaysToDate(firstDue, intervalDays * i);
    const dueMs = new Date(`${dueDate}T12:00:00`).getTime();
    const termDays = Math.max(1, Math.round((dueMs - saleMs) / (1000 * 60 * 60 * 24)));

    installments.push({
      installmentNumber: i + 1,
      totalInstallments: count,
      amount,
      capitalPart,
      interestPart,
      dueDate,
      termDays,
    });
  }

  return {
    baseAmount,
    downPayment,
    financedCapital,
    interestPercent,
    totalInterest,
    totalFinancedWithInterest,
    totalOperationValue: Math.round((downPayment + totalFinancedWithInterest) * 100) / 100,
    installmentsCount: count,
    installmentBaseAmount: perInstallmentRaw,
    installments,
  };
}

export interface ExcessPaymentAllocationLine {
  boletaId: string;
  boletaNumber: string;
  installmentLabel: string;
  previousBalanceDue: number;
  appliedPayment: number;
  interestReduction: number;
  newBalanceDue: number;
  willSettleCompletely: boolean;
}

export interface ExcessPaymentAllocationPlan {
  totalAmountEntered: number;
  totalInterestReduction: number;
  totalAppliedAcrossPlan: number;
  remainingPlanDebtAfter: number;
  unappliedSurplus: number;
  lines: ExcessPaymentAllocationLine[];
}

/**
 * Calcula cómo se distribuye un pago superior al saldo de la boleta/cuota actual
 * ("pagó una boleta y media", "adelantó cuotas", etc.), descontando proporcionalmente
 * los intereses finales de las cuotas siguientes abonadas por adelantado.
 */
export function calculateExcessPaymentAllocation(params: {
  currentBoleta: Boleta;
  candidateBoletas: Boleta[];
  totalAmountEntered: number;
}): ExcessPaymentAllocationPlan {
  const entered = Math.max(0, Number(params.totalAmountEntered) || 0);
  const lines: ExcessPaymentAllocationLine[] = [];

  const currentBal = getBoletaBalance(params.currentBoleta).balanceDue;
  const appliedToCurrent = Math.min(entered, currentBal);
  const newCurrentDue = Math.max(0, Math.round((currentBal - appliedToCurrent) * 100) / 100);

  lines.push({
    boletaId: params.currentBoleta.id,
    boletaNumber: params.currentBoleta.boletaNumber,
    installmentLabel: params.currentBoleta.totalInstallments
      ? `Cuota ${params.currentBoleta.installmentNumber}/${params.currentBoleta.totalInstallments}`
      : `Boleta #${params.currentBoleta.boletaNumber}`,
    previousBalanceDue: currentBal,
    appliedPayment: appliedToCurrent,
    interestReduction: 0,
    newBalanceDue: newCurrentDue,
    willSettleCompletely: newCurrentDue <= 0.01,
  });

  let surplus = Math.max(0, Math.round((entered - appliedToCurrent) * 100) / 100);
  let totalInterestReduction = 0;

  // Order subsequent pending boletas (sibling plan cuotas first, ordered by installmentNumber / dueDate)
  const orderedSiblings = [...params.candidateBoletas]
    .filter((b) => b.id !== params.currentBoleta.id && b.status === 'pending')
    .sort((a, b) => {
      if (a.planId && b.planId && a.planId === b.planId) {
        return (a.installmentNumber || 0) - (b.installmentNumber || 0);
      }
      return a.dueDate.localeCompare(b.dueDate);
    });

  for (const sibling of orderedSiblings) {
    const sibBal = getBoletaBalance(sibling).balanceDue;
    if (sibBal <= 0) continue;

    if (surplus <= 0) {
      lines.push({
        boletaId: sibling.id,
        boletaNumber: sibling.boletaNumber,
        installmentLabel: sibling.totalInstallments
          ? `Cuota ${sibling.installmentNumber}/${sibling.totalInstallments}`
          : `Boleta #${sibling.boletaNumber}`,
        previousBalanceDue: sibBal,
        appliedPayment: 0,
        interestReduction: 0,
        newBalanceDue: sibBal,
        willSettleCompletely: false,
      });
      continue;
    }

    // Check uncredited interest remaining on this sibling cuota
    const alreadyDiscounted = Number(sibling.earlyPaymentDiscountApplied || 0);
    const rawInterest = Math.max(0, Number(sibling.interestAmount || 0) - alreadyDiscounted);
    const interestRatio =
      sibling.amount > 0 && rawInterest > 0
        ? Math.min(0.85, rawInterest / sibling.amount)
        : 0;

    // Max cash needed to settle sibling after full interest bonification
    const minCashToSettleSibling = Math.max(0, Math.round((sibBal - rawInterest) * 100) / 100);

    let appliedToSibling = 0;
    let interestReduction = 0;

    if (surplus >= minCashToSettleSibling) {
      // Pays enough to cancel sibling completely + bonifies remaining interest!
      appliedToSibling = minCashToSettleSibling;
      interestReduction = Math.round(rawInterest * 100) / 100;
      surplus = Math.max(0, Math.round((surplus - appliedToSibling) * 100) / 100);
    } else {
      // Partial advance (e.g., paid half of the next cuota -> proportional interest reduced)
      appliedToSibling = surplus;
      if (interestRatio > 0) {
        const capitalCovered = appliedToSibling;
        // Proportional interest saved based on the portion of net capital paid early
        const netCapitalRemaining = Math.max(1, sibBal - rawInterest);
        const proportion = Math.min(1, capitalCovered / netCapitalRemaining);
        interestReduction = Math.min(
          rawInterest,
          Math.round(rawInterest * proportion * 100) / 100
        );
      }
      surplus = 0;
    }

    totalInterestReduction = Math.round((totalInterestReduction + interestReduction) * 100) / 100;
    const newDue = Math.max(
      0,
      Math.round((sibBal - appliedToSibling - interestReduction) * 100) / 100
    );

    lines.push({
      boletaId: sibling.id,
      boletaNumber: sibling.boletaNumber,
      installmentLabel: sibling.totalInstallments
        ? `Cuota ${sibling.installmentNumber}/${sibling.totalInstallments}`
        : `Boleta #${sibling.boletaNumber}`,
      previousBalanceDue: sibBal,
      appliedPayment: appliedToSibling,
      interestReduction,
      newBalanceDue: newDue,
      willSettleCompletely: newDue <= 0.01,
    });
  }

  const remainingPlanDebtAfter = lines.reduce((acc, l) => acc + l.newBalanceDue, 0);
  const totalAppliedAcrossPlan = lines.reduce((acc, l) => acc + l.appliedPayment, 0);

  return {
    totalAmountEntered: entered,
    totalInterestReduction,
    totalAppliedAcrossPlan: Math.round(totalAppliedAcrossPlan * 100) / 100,
    remainingPlanDebtAfter: Math.round(remainingPlanDebtAfter * 100) / 100,
    unappliedSurplus: surplus,
    lines,
  };
}

export interface BasketCheckoutSummary {
  contadoItems: SaleLineItem[];
  singleDeferredItems: SaleLineItem[];
  installmentItems: SaleLineItem[];
  contadoTotal: number;
  singleDeferredTotal: number;
  installmentBaseTotal: number;
  installmentPlanPreview: InstallmentPlanPreview | null;
  grandBaseTotal: number;
  totalWithInterest: number;
  totalCashCollectedToday: number;
  totalPendingDebtGenerated: number;
}

/**
 * Calcula dinámicamente la división de un canasto de múltiples productos donde cada ítem
 * puede ir a "1 Pago Hoy (Contado)", "1 Pago Fiado (A término)" o "En Cuotas (2, 3, 4, 5, 6, 9 o 12 cuotas c/ interés)".
 */
export function calculateBasketCheckoutSummary(params: {
  items: SaleLineItem[];
  downPaymentOnInstallments?: number;
  installmentsCount: number;
  interestPercent: number;
  intervalDays: number;
  saleDate: string;
  firstDueDate?: string;
}): BasketCheckoutSummary {
  const validItems = params.items.filter((i) => i.name.trim() && i.quantity > 0 && i.unitPrice >= 0);
  const contadoItems = validItems.filter((i) => i.paymentMode === 'contado_hoy');
  const singleDeferredItems = validItems.filter((i) => i.paymentMode === 'un_pago_fiado');
  const installmentItems = validItems.filter((i) => i.paymentMode === 'cuotas');

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const contadoTotal = round2(contadoItems.reduce((acc, i) => acc + i.subtotal, 0));
  const singleDeferredTotal = round2(singleDeferredItems.reduce((acc, i) => acc + i.subtotal, 0));
  const installmentBaseTotal = round2(installmentItems.reduce((acc, i) => acc + i.subtotal, 0));

  const installmentPlanPreview =
    installmentBaseTotal > 0
      ? calculateInstallmentPlanPreview({
          baseAmount: installmentBaseTotal,
          downPayment: params.downPaymentOnInstallments || 0,
          installmentsCount: params.installmentsCount,
          interestPercent: params.interestPercent,
          intervalDays: params.intervalDays,
          saleDate: params.saleDate,
          firstDueDate: params.firstDueDate,
        })
      : null;

  const grandBaseTotal = round2(contadoTotal + singleDeferredTotal + installmentBaseTotal);
  const totalWithInterest = round2(
    contadoTotal +
      singleDeferredTotal +
      (installmentPlanPreview ? installmentPlanPreview.totalOperationValue : 0)
  );
  const totalCashCollectedToday = round2(
    contadoTotal + (installmentPlanPreview ? installmentPlanPreview.downPayment : 0)
  );
  const totalPendingDebtGenerated = round2(
    singleDeferredTotal + (installmentPlanPreview ? installmentPlanPreview.totalFinancedWithInterest : 0)
  );

  return {
    contadoItems,
    singleDeferredItems,
    installmentItems,
    contadoTotal,
    singleDeferredTotal,
    installmentBaseTotal,
    installmentPlanPreview,
    grandBaseTotal,
    totalWithInterest,
    totalCashCollectedToday,
    totalPendingDebtGenerated,
  };
}

export interface CreditNoteAllocationLine {
  boletaId: string;
  boletaNumber: string;
  installmentLabel: string;
  previousBalanceDue: number;
  appliedCredit: number;
  newBalanceDue: number;
  willSettleCompletely: boolean;
}

export interface CreditNoteAllocationPlan {
  totalCreditEntered: number;
  totalAppliedCredit: number;
  unappliedSurplus: number;
  remainingPlanDebtAfter: number;
  lines: CreditNoteAllocationLine[];
}

/**
 * Calcula cómo se descuenta una Devolución / Nota de Crédito en el rubro Indumentaria:
 * - 'last_to_first': descuenta primero de la última cuota hacia atrás (Cuota N -> 1), achicando el fin del plan.
 * - 'current_first': descuenta primero la cuota/boleta seleccionada y el excedente pasa a las siguientes.
 */
export function calculateCreditNoteAllocation(params: {
  currentBoleta: Boleta;
  candidateBoletas: Boleta[];
  creditAmount: number;
  strategy: 'last_to_first' | 'current_first';
}): CreditNoteAllocationPlan {
  const entered = Math.max(0, Math.round((Number(params.creditAmount) || 0) * 100) / 100);
  const pool =
    params.candidateBoletas.length > 0
      ? params.candidateBoletas.filter((b) => b.status === 'pending')
      : [params.currentBoleta];

  const uniqueMap = new Map<string, Boleta>();
  uniqueMap.set(params.currentBoleta.id, params.currentBoleta);
  for (const b of pool) {
    uniqueMap.set(b.id, b);
  }
  const allTargets = Array.from(uniqueMap.values());

  const orderedTargets = [...allTargets].sort((a, b) => {
    if (params.strategy === 'last_to_first') {
      const instDiff = (b.installmentNumber || 0) - (a.installmentNumber || 0);
      if (instDiff !== 0) return instDiff;
      return b.dueDate.localeCompare(a.dueDate);
    }
    if (a.id === params.currentBoleta.id && b.id !== params.currentBoleta.id) return -1;
    if (b.id === params.currentBoleta.id && a.id !== params.currentBoleta.id) return 1;
    const instDiff = (a.installmentNumber || 0) - (b.installmentNumber || 0);
    if (instDiff !== 0) return instDiff;
    return a.dueDate.localeCompare(b.dueDate);
  });

  let remainingCredit = entered;
  const lines: CreditNoteAllocationLine[] = [];

  for (const target of orderedTargets) {
    const prevBal = getBoletaBalance(target).balanceDue;
    if (prevBal <= 0) continue;

    const appliedCredit = Math.min(remainingCredit, prevBal);
    remainingCredit = Math.max(0, Math.round((remainingCredit - appliedCredit) * 100) / 100);
    const newBalanceDue = Math.max(0, Math.round((prevBal - appliedCredit) * 100) / 100);

    lines.push({
      boletaId: target.id,
      boletaNumber: target.boletaNumber,
      installmentLabel: target.totalInstallments
        ? `Cuota ${target.installmentNumber}/${target.totalInstallments}`
        : `Boleta #${target.boletaNumber}`,
      previousBalanceDue: prevBal,
      appliedCredit: Math.round(appliedCredit * 100) / 100,
      newBalanceDue,
      willSettleCompletely: newBalanceDue <= 0.01,
    });
  }

  // Sort display lines naturally by installment ascending so user reads Cuota 1 -> N clearly
  const displayOrderMap = new Map(
    [...allTargets]
      .sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0) || a.dueDate.localeCompare(b.dueDate))
      .map((b, idx) => [b.id, idx])
  );
  lines.sort((a, b) => (displayOrderMap.get(a.boletaId) ?? 0) - (displayOrderMap.get(b.boletaId) ?? 0));

  const totalAppliedCredit = Math.round(
    lines.reduce((acc, l) => acc + l.appliedCredit, 0) * 100
  ) / 100;
  const remainingPlanDebtAfter = Math.round(
    lines.reduce((acc, l) => acc + l.newBalanceDue, 0) * 100
  ) / 100;

  return {
    totalCreditEntered: entered,
    totalAppliedCredit,
    unappliedSurplus: remainingCredit,
    remainingPlanDebtAfter,
    lines,
  };
}

