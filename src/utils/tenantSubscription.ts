import {
  PlatformBillingConfig,
  PlatformPlanPrices,
  SubscriptionPlanTier,
  Tenant,
  TenantMonthlyPayment,
  TenantSubscription,
} from '../types';

export const DEFAULT_PLAN_PRICES: PlatformPlanPrices = {
  basico: 18000,
  web: 28000,
  full: 42000,
};

export const PLAN_WEB_MAX_RUBROS = 5;
export const PLAN_WEB_MAX_PRODUCTS = 100;

export interface SubscriptionPlanDefinition {
  tier: SubscriptionPlanTier;
  sectionNumber: 1 | 2 | 3;
  sectionBadge: string;
  name: string;
  shortName: string;
  tagline: string;
  monthlyPrice: number;
  highlighted?: boolean;
  includesWebCatalog: boolean;
  includesFullSuite: boolean;
  includedFeatures: string[];
  excludedFeatures: string[];
}

export function normalizePlanPrices(billingConfig?: Partial<PlatformBillingConfig> | null): PlatformPlanPrices {
  const raw = billingConfig?.planPrices;
  const fallbackBase = Math.max(0, Number(billingConfig?.defaultMonthlyFee) || DEFAULT_PLAN_PRICES.web);
  return {
    basico: Math.max(0, Number(raw?.basico ?? DEFAULT_PLAN_PRICES.basico) || DEFAULT_PLAN_PRICES.basico),
    web: Math.max(0, Number(raw?.web ?? fallbackBase) || DEFAULT_PLAN_PRICES.web),
    full: Math.max(0, Number(raw?.full ?? DEFAULT_PLAN_PRICES.full) || DEFAULT_PLAN_PRICES.full),
  };
}

export function getPlanPriceForTier(
  tier: SubscriptionPlanTier,
  billingConfig?: Partial<PlatformBillingConfig> | null
): number {
  const prices = normalizePlanPrices(billingConfig);
  return prices[tier];
}

export function applyPercentageToPlanPrices(
  prices: PlatformPlanPrices,
  percent: number
): PlatformPlanPrices {
  const factor = 1 + (Number(percent) || 0) / 100;
  const roundPrice = (v: number) => Math.max(0, Math.round((v * factor) / 100) * 100);
  return {
    basico: roundPrice(prices.basico),
    web: roundPrice(prices.web),
    full: roundPrice(prices.full),
  };
}

export function getSubscriptionPlanDefinitions(
  billingConfig?: Partial<PlatformBillingConfig> | null
): SubscriptionPlanDefinition[] {
  const prices = normalizePlanPrices(billingConfig);
  return [
    {
      tier: 'basico',
      sectionNumber: 1,
      sectionBadge: 'Plan 1',
      name: 'Plan 1 · Básico (Gestión Sin Web)',
      shortName: 'Básico (Sin Web)',
      tagline: 'Control integral de cobranzas, boletas, clientes, vendedores y mora interna.',
      monthlyPrice: prices.basico,
      includesWebCatalog: false,
      includesFullSuite: false,
      includedFeatures: [
        'Panel de cobranzas, boletas y pagos parciales',
        'Gestión de clientes, vendedores, rutas y rendiciones',
        'Auditoría de mora (2d, 6d, 10d y alertas rojas)',
        'Historial de cobradas, agenda del día y envíos WhatsApp manuales',
      ],
      excludedFeatures: [
        'Sin Catálogo Online / Página Web propia',
        'Sin Pedidos Web ni Ventas Online',
        'Sin Puntos por DNI, Gift Cards QR ni Automatizaciones',
      ],
    },
    {
      tier: 'web',
      sectionNumber: 2,
      sectionBadge: 'Plan 2',
      name: 'Plan 2 · Página Web Básica',
      shortName: 'Página Web Básica',
      tagline:
        'Página web básica con pagos en tienda y manejo de stock (hasta 5 rubros y 100 prendas/objetos).',
      monthlyPrice: prices.web,
      includesWebCatalog: true,
      includesFullSuite: false,
      includedFeatures: [
        'Todo lo incluido en Plan 1 · Básico (Sin Web)',
        'Página Web / Catálogo Online básico con link y QR propio',
        'Pagos en la tienda (Efectivo, Transferencia / Alias y Mercado Pago)',
        'Manejo de stock por producto y variante · Hasta 5 rubros y 100 prendas/objetos',
        'Carritos guardados con recordatorio por WhatsApp y stock que se libera solo en pedidos sin pagar',
      ],
      excludedFeatures: [
        'Sin burbujas ni banners de ofertas, Outlet ni Ofertas Relámpago',
        'Sin seguimiento de clientes (Avisos de Stock, Clientes Web)',
        'Sin SuperClub / Puntos por DNI ni cupones o descuentos',
        'Tope de 5 rubros y 100 prendas/objetos (ampliable al instante a Plan 3 · Full)',
      ],
    },
    {
      tier: 'full',
      sectionNumber: 3,
      sectionBadge: 'Plan 3',
      name: 'Plan 3 · Full (Todo Incluido)',
      shortName: 'Full (Todo Incluido)',
      tagline: 'Acceso absoluto a todas las herramientas de venta, fidelización y automatización.',
      monthlyPrice: prices.full,
      highlighted: true,
      includesWebCatalog: true,
      includesFullSuite: true,
      includedFeatures: [
        'Todo lo de Plan 1 y Plan 2 (Gestión + Página Web)',
        'Programa de Puntos por DNI, Favoritos, Recompra 1-clic y Analítica Web',
        'Ofertas Relámpago / Outlet y descuentos por cupón',
        'Gift Cards Digitales con QR + Cambios/Devoluciones con Saldo a Favor por DNI',
        'Club Promos, Estudio de Flyers, WhatsApp Automático y Radar Clientes Fríos',
      ],
      excludedFeatures: [],
    },
  ];
}

export function getPlanDefinitionByTier(
  tier: SubscriptionPlanTier,
  billingConfig?: Partial<PlatformBillingConfig> | null
): SubscriptionPlanDefinition {
  return (
    getSubscriptionPlanDefinitions(billingConfig).find((d) => d.tier === tier) ||
    getSubscriptionPlanDefinitions(billingConfig)[1]
  );
}

export function resolveTenantPlanTier(tenant: Tenant): SubscriptionPlanTier | undefined {
  if (tenant.subscription?.planTier) {
    return tenant.subscription.planTier;
  }
  if (tenant.catalogEnabled === false) {
    return 'basico';
  }
  return undefined;
}

export interface TenantEffectiveFeatureAccess {
  tier?: SubscriptionPlanTier;
  sectionLabel: string;
  isTrialFullPreview: boolean;
  canAccessWebCatalog: boolean;
  canAccessFullFeatures: boolean;
}

export function getTenantEffectiveFeatureAccess(tenant: Tenant): TenantEffectiveFeatureAccess {
  const evalStatus = getTenantSubscriptionStatus(tenant);
  // La prueba gratis de 30 días se vive como Plan 2 (con sus límites de rubros y artículos),
  // salvo que el superadmin le haya asignado otro plan de forma explícita.
  const isTrialActive = evalStatus.status === 'trial_active';
  const explicitTier = resolveTenantPlanTier(tenant) || (isTrialActive ? 'web' : undefined);
  const isTrialFullPreview = false;

  if (explicitTier === 'basico') {
    return {
      tier: 'basico',
      sectionLabel: 'Plan 1 · Básico (Sin Web)',
      isTrialFullPreview: false,
      canAccessWebCatalog: false,
      canAccessFullFeatures: false,
    };
  }

  if (explicitTier === 'web') {
    return {
      tier: 'web',
      sectionLabel: isTrialActive ? 'Prueba Gratis 30d · Plan 2 · Con Página Web' : 'Plan 2 · Con Página Web',
      isTrialFullPreview,
      canAccessWebCatalog: tenant.catalogEnabled !== false,
      canAccessFullFeatures: false,
    };
  }

  // Empresas en Plan 3 ('full') o cuentas históricas sin restricción explícita conservan acceso completo
  return {
    tier: explicitTier || 'full',
    sectionLabel: explicitTier === 'full' ? 'Plan 3 · Full (Todo Incluido)' : 'Acceso Completo',
    isTrialFullPreview: false,
    canAccessWebCatalog: tenant.catalogEnabled !== false,
    canAccessFullFeatures: true,
  };
}

export const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export interface CurrentMonthInfo {
  year: number;
  month: number; // 1-12
  monthKey: string; // "YYYY-MM"
  monthName: string; // Ej. "Noviembre 2026"
  dayOfMonth: number; // 1-31
  isWithinWindow: boolean; // Días 1 al 5
  isPastWindow: boolean; // Día 6 en adelante
  daysRemainingInWindow: number;
  daysPastWindow: number;
  formattedDateStr: string; // "12 de Noviembre de 2026"
}

/**
 * Obtiene la información del mes y fecha actual del sistema.
 */
export function getCurrentMonthInfo(date: Date = new Date()): CurrentMonthInfo {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthName = `${MESES_ES[date.getMonth()]} ${year}`;
  const dayOfMonth = date.getDate();
  const isWithinWindow = dayOfMonth >= 1 && dayOfMonth <= 5;
  const isPastWindow = dayOfMonth > 5;
  const daysRemainingInWindow = Math.max(0, 5 - dayOfMonth);
  const daysPastWindow = Math.max(0, dayOfMonth - 5);
  const formattedDateStr = `${dayOfMonth} de ${MESES_ES[date.getMonth()]} de ${year}`;

  return {
    year,
    month,
    monthKey,
    monthName,
    dayOfMonth,
    isWithinWindow,
    isPastWindow,
    daysRemainingInWindow,
    daysPastWindow,
    formattedDateStr,
  };
}

/**
 * Asegura que una empresa tenga su estructura de suscripción inicializada.
 */
export function ensureTenantSubscription(tenant: Tenant): TenantSubscription {
  if (tenant.subscription) {
    return {
      monthlyFee: tenant.subscription.monthlyFee ?? 25000,
      currency: tenant.subscription.currency || '$',
      planTier: tenant.subscription.planTier,
      planSelectedAt: tenant.subscription.planSelectedAt,
      lastPlanChange: tenant.subscription.lastPlanChange,
      planChangeHistory: tenant.subscription.planChangeHistory,
      termsAccepted: tenant.subscription.termsAccepted,
      termsAcceptedAt: tenant.subscription.termsAcceptedAt,
      termsVersion: tenant.subscription.termsVersion,
      paymentWindowStartDay: 1,
      paymentWindowEndDay: 5,
      lastPaidMonth: tenant.subscription.lastPaidMonth,
      annualPlanUntilMonth: tenant.subscription.annualPlanUntilMonth,
      annualPlanPurchasedAt: tenant.subscription.annualPlanPurchasedAt,
      isPaused: tenant.subscription.isPaused ?? (tenant.status === 'suspended'),
      pausedAt: tenant.subscription.pausedAt,
      pauseReason: tenant.subscription.pauseReason,
      pausedBy: tenant.subscription.pausedBy,
      trialStartedAt: tenant.subscription.trialStartedAt,
      trialEndsAt: tenant.subscription.trialEndsAt,
      trialDays: tenant.subscription.trialDays ?? 30,
      selfRegistered: tenant.subscription.selfRegistered,
      extendedUntilMonth: tenant.subscription.extendedUntilMonth,
      extendedUntilDate: tenant.subscription.extendedUntilDate,
      extensionNotes: tenant.subscription.extensionNotes,
      paymentHistory: tenant.subscription.paymentHistory || [],
    };
  }

  return {
    monthlyFee: 25000,
    currency: '$',
    paymentWindowStartDay: 1,
    paymentWindowEndDay: 5,
    isPaused: tenant.status === 'suspended',
    paymentHistory: [],
  };
}

export function addMonthsToMonthKey(monthKey: string, monthsToAdd: number): string {
  const [yStr, mStr] = monthKey.split('-');
  const y = parseInt(yStr, 10) || new Date().getFullYear();
  const m = (parseInt(mStr, 10) || 1) - 1;
  const d = new Date(y, m + monthsToAdd, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthKeyEs(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const mIdx = (parseInt(mStr, 10) || 1) - 1;
  return `${MESES_ES[mIdx] || 'Mes'} ${yStr}`;
}

export function calculateAnnualFee(monthlyFee: number, annualDiscountPercent: number = 0): number {
  const safeMonthly = Math.max(0, Number(monthlyFee) || 25000);
  const safeDiscount = Math.min(50, Math.max(0, Number(annualDiscountPercent) || 0));
  return Math.round(safeMonthly * 12 * (1 - safeDiscount / 100));
}

export type SubscriptionStatusType =
  | 'paid'
  | 'pending_window'
  | 'overdue'
  | 'extended'
  | 'paused'
  | 'trial_active'
  | 'trial_expired';

export type TenantLifecycleCategory = 'functioning' | 'trial' | 'paused';

export interface TenantSubscriptionEvaluation {
  status: SubscriptionStatusType;
  lifecycleCategory: TenantLifecycleCategory;
  statusLabel: string;
  label: string;
  badgeColor: string;
  isPaidForCurrentMonth: boolean;
  isExtended: boolean;
  isPaused: boolean;
  isOverdue: boolean;
  isTrial: boolean;
  isTrialExpired: boolean;
  trialDaysRemaining?: number;
  trialStartedAt?: string;
  trialEndsAt?: string;
  currentMonthKey: string;
  currentMonthName: string;
  dayOfMonth: number;
  monthlyFee: number;
  daysPastWindow: number;
  actionNeededMessage: string;
  extensionExpiresAt?: string;
}

/**
 * Calcula la fecha límite de prueba (30 días desde trialStartedAt / createdAt si no estuviera explícita).
 */
function resolveTrialDates(tenant: Tenant, sub: TenantSubscription): { startStr: string; endStr: string; trialDays: number } {
  const trialDays = sub.trialDays || 30;
  const startStr = sub.trialStartedAt || tenant.createdAt || new Date().toISOString().split('T')[0];
  if (sub.trialEndsAt) {
    return { startStr, endStr: sub.trialEndsAt, trialDays };
  }
  const base = new Date(`${startStr}T12:00:00`);
  base.setDate(base.getDate() + trialDays);
  return { startStr, endStr: base.toISOString().split('T')[0], trialDays };
}

/**
 * Evalúa el estado de pago mensual o prueba gratuita de una distribuidora.
 * REGLAS DEL USUARIO:
 * 1. Nuevas cuentas autogestionadas tienen 30 días de prueba gratis ('trial_active' -> A Prueba).
 * 2. Al finalizar los 30 días sin pagar ('trial_expired'), se solicita efectuar el pago para continuar o pausar.
 * 3. Al pagar (Mercado Pago / Alias / tilde manual), pasa automáticamente a 'functioning' (Funcionando).
 * 4. Si elige pausar o se pausa desde gestión, pasa a 'paused' (En Pausa).
 * 5. Cuentas activas operan con vencimiento mensual del 1 al 5 y opción de prórroga de 1 mes.
 */
export function getTenantSubscriptionStatus(
  tenant: Tenant,
  referenceDate: Date = new Date()
): TenantSubscriptionEvaluation {
  const sub = ensureTenantSubscription(tenant);
  const monthInfo = getCurrentMonthInfo(referenceDate);

  // 1. Verificar si la empresa está pausada
  if (sub.isPaused || tenant.status === 'suspended') {
    return {
      status: 'paused',
      lifecycleCategory: 'paused',
      statusLabel: 'Cuenta En Pausa',
      label: 'Cuenta En Pausa',
      badgeColor: 'bg-[#0B1933] text-white border-[#1B3668]',
      isPaidForCurrentMonth: false,
      isExtended: false,
      isPaused: true,
      isOverdue: true,
      isTrial: Boolean(sub.selfRegistered || sub.trialStartedAt),
      isTrialExpired: false,
      currentMonthKey: monthInfo.monthKey,
      currentMonthName: monthInfo.monthName,
      dayOfMonth: monthInfo.dayOfMonth,
      monthlyFee: sub.monthlyFee,
      daysPastWindow: Math.max(0, monthInfo.dayOfMonth - 5),
      actionNeededMessage:
        sub.pauseReason || 'La cuenta se encuentra en pausa hasta regularizar el abono.',
    };
  }

  // 2. Verificar si el mes actual está cubierto (pago mensual o plan anual de 12 meses)
  const currentPaymentRecord = (sub.paymentHistory || []).find(
    (p) => p.monthKey === monthInfo.monthKey && p.status === 'paid'
  );
  const hasAnnualCoverage = Boolean(
    sub.annualPlanUntilMonth && sub.annualPlanUntilMonth >= monthInfo.monthKey
  );
  const isPaid =
    Boolean(currentPaymentRecord) || sub.lastPaidMonth === monthInfo.monthKey || hasAnnualCoverage;

  if (isPaid) {
    const isAnnualPlan =
      hasAnnualCoverage || currentPaymentRecord?.planType === 'annual';
    const untilLabel = sub.annualPlanUntilMonth
      ? formatMonthKeyEs(sub.annualPlanUntilMonth)
      : monthInfo.monthName;

    return {
      status: 'paid',
      lifecycleCategory: 'functioning',
      statusLabel: isAnnualPlan
        ? `Al Día · Plan Anual (hasta ${untilLabel})`
        : `Al Día (${monthInfo.monthName} Pagado)`,
      label: isAnnualPlan
        ? `Plan Anual (hasta ${untilLabel})`
        : `Al Día (${monthInfo.monthName} Pagado)`,
      badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200',
      isPaidForCurrentMonth: true,
      isExtended: false,
      isPaused: false,
      isOverdue: false,
      isTrial: false,
      isTrialExpired: false,
      currentMonthKey: monthInfo.monthKey,
      currentMonthName: monthInfo.monthName,
      dayOfMonth: monthInfo.dayOfMonth,
      monthlyFee: sub.monthlyFee,
      daysPastWindow: 0,
      actionNeededMessage: isAnnualPlan
        ? `Suscripción Anual (12 meses) cubierta al 100% hasta ${untilLabel}.`
        : 'Abono mensual cubierto al 100%.',
    };
  }

  // 3. Verificar si el superadmin le prorrogó el uso por 1 mes
  const hasActiveExtension = Boolean(
    (sub.extendedUntilMonth && sub.extendedUntilMonth >= monthInfo.monthKey) ||
    (sub.extendedUntilDate && new Date(sub.extendedUntilDate).getTime() >= referenceDate.getTime())
  );

  if (hasActiveExtension) {
    return {
      status: 'extended',
      lifecycleCategory: 'functioning',
      statusLabel: `Prórroga 1 Mes (${sub.extendedUntilMonth || monthInfo.monthName})`,
      label: `Prórroga 1 Mes (${sub.extendedUntilMonth || monthInfo.monthName})`,
      badgeColor: 'bg-[#E9EEF5] text-[#0B1933] border-[#B6C2D2] dark:bg-[#13264A] dark:text-[#E2E8F0]',
      isPaidForCurrentMonth: false,
      isExtended: true,
      isPaused: false,
      isOverdue: false,
      isTrial: false,
      isTrialExpired: false,
      currentMonthKey: monthInfo.monthKey,
      currentMonthName: monthInfo.monthName,
      dayOfMonth: monthInfo.dayOfMonth,
      monthlyFee: sub.monthlyFee,
      daysPastWindow: Math.max(0, monthInfo.dayOfMonth - 5),
      actionNeededMessage: `Prórroga de uso autorizada hasta fin de mes (${sub.extensionNotes || 'Acuerdo con administración'}).`,
      extensionExpiresAt: sub.extendedUntilDate || sub.extendedUntilMonth,
    };
  }

  // 4. Verificar si la distribuidora está en su Prueba Gratuita de 30 días
  if (tenant.status === 'trial') {
    const { startStr, endStr } = resolveTrialDates(tenant, sub);
    const refMidMs = new Date(`${referenceDate.toISOString().split('T')[0]}T12:00:00`).getTime();
    const endMidMs = new Date(`${endStr}T12:00:00`).getTime();
    const daysRemaining = Math.ceil((endMidMs - refMidMs) / (1000 * 60 * 60 * 24));

    if (daysRemaining > 0) {
      return {
        status: 'trial_active',
        lifecycleCategory: 'trial',
        statusLabel: `A Prueba (${daysRemaining}d gratis)`,
        label: `A Prueba · Quedan ${daysRemaining} día${daysRemaining === 1 ? '' : 's'}`,
        badgeColor: 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/70 dark:text-sky-200',
        isPaidForCurrentMonth: false,
        isExtended: false,
        isPaused: false,
        isOverdue: false,
        isTrial: true,
        isTrialExpired: false,
        trialDaysRemaining: daysRemaining,
        trialStartedAt: startStr,
        trialEndsAt: endStr,
        currentMonthKey: monthInfo.monthKey,
        currentMonthName: monthInfo.monthName,
        dayOfMonth: monthInfo.dayOfMonth,
        monthlyFee: sub.monthlyFee,
        daysPastWindow: 0,
        actionNeededMessage: `Período de prueba gratis de 30 días (con las condiciones del Plan 2) vigente hasta el ${endStr}.`,
      };
    }

    return {
      status: 'trial_expired',
      lifecycleCategory: 'trial',
      statusLabel: 'Prueba 30d Finalizada',
      label: 'Prueba 30d Finalizada · Requiere Pago',
      badgeColor: 'bg-[#B91C1C] text-white border-[#991B1B] font-bold',
      isPaidForCurrentMonth: false,
      isExtended: false,
      isPaused: false,
      isOverdue: true,
      isTrial: true,
      isTrialExpired: true,
      trialDaysRemaining: 0,
      trialStartedAt: startStr,
      trialEndsAt: endStr,
      currentMonthKey: monthInfo.monthKey,
      currentMonthName: monthInfo.monthName,
      dayOfMonth: monthInfo.dayOfMonth,
      monthlyFee: sub.monthlyFee,
      daysPastWindow: Math.max(1, Math.abs(daysRemaining)),
      actionNeededMessage: `Tu prueba gratuita de 30 días finalizó el ${endStr}. Elegí tu plan (bajar a Plan 1, mantener Plan 2 o subir a Plan 3) y efectuá el pago para continuar, o pausá tu cuenta.`,
    };
  }

  // 5. Si no pagó y estamos dentro del plazo (del 1 al 5)
  if (monthInfo.isWithinWindow) {
    return {
      status: 'pending_window',
      lifecycleCategory: 'functioning',
      statusLabel: `Período de Pago Abierto (Día ${monthInfo.dayOfMonth} de 5)`,
      label: `Período de Pago Abierto (Día ${monthInfo.dayOfMonth} de 5)`,
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200',
      isPaidForCurrentMonth: false,
      isExtended: false,
      isPaused: false,
      isOverdue: false,
      isTrial: false,
      isTrialExpired: false,
      currentMonthKey: monthInfo.monthKey,
      currentMonthName: monthInfo.monthName,
      dayOfMonth: monthInfo.dayOfMonth,
      monthlyFee: sub.monthlyFee,
      daysPastWindow: 0,
      actionNeededMessage: `Tienen tiempo hasta el 5 de ${MESES_ES[monthInfo.month - 1]} para abonar el servicio.`,
    };
  }

  // 6. Si no pagó y ya pasó el día 5 (Día 6 en adelante) -> MORA / PRÓXIMO A PAUSARSE
  const daysPastWindow = monthInfo.dayOfMonth - 5;
  return {
    status: 'overdue',
    lifecycleCategory: 'functioning',
    statusLabel: `Impago / Vencido (${daysPastWindow}d tarde)`,
    label: `Impago / Vencido (${daysPastWindow}d tarde)`,
    badgeColor: 'bg-[#B91C1C] text-white border-[#991B1B] font-bold',
    isPaidForCurrentMonth: false,
    isExtended: false,
    isPaused: false,
    isOverdue: true,
    isTrial: false,
    isTrialExpired: false,
    currentMonthKey: monthInfo.monthKey,
    currentMonthName: monthInfo.monthName,
    dayOfMonth: monthInfo.dayOfMonth,
    monthlyFee: sub.monthlyFee,
    daysPastWindow,
    actionNeededMessage: `No registra pago de ${monthInfo.monthName} (plazo del 1 al 5 vencido). Próxima a pausarse.`,
  };
}

/**
 * Tilda o destilda el pago mensual o anual (1 mes o 12 meses) de una distribuidora.
 * Al marcar como pagado, una cuenta a prueba o pausada pasa automáticamente a estado 'active' (Funcionando).
 */
export function toggleTenantMonthlyPayment(
  tenant: Tenant,
  monthKey: string,
  setAsPaid: boolean,
  amount?: number,
  notes?: string,
  adminName: string = 'Super Administrador',
  paymentDetails?: {
    paymentMethod?: 'mercadopago' | 'transferencia' | 'manual';
    mpPaymentId?: string;
    mpPreferenceId?: string;
    receiptAlias?: string;
    receiptImageUrl?: string;
    verificationNote?: string;
    planType?: 'monthly' | 'annual';
    planTier?: SubscriptionPlanTier;
    planTierLabel?: string;
    monthsCount?: number;
  }
): Tenant {
  const sub = ensureTenantSubscription(tenant);
  const planType: 'monthly' | 'annual' = paymentDetails?.planType === 'annual' ? 'annual' : 'monthly';
  const monthsCount = planType === 'annual' ? Math.max(12, Number(paymentDetails?.monthsCount) || 12) : 1;
  const todayStr = new Date().toISOString().split('T')[0];
  const resolvedPlanTier = paymentDetails?.planTier || sub.planTier;
  const resolvedPlanTierLabel =
    paymentDetails?.planTierLabel ||
    (resolvedPlanTier ? getPlanDefinitionByTier(resolvedPlanTier).name : undefined);

  const existingHistory = sub.paymentHistory || [];

  if (setAsPaid) {
    const monthKeysToCover = Array.from({ length: monthsCount }, (_, idx) =>
      addMonthsToMonthKey(monthKey, idx)
    );
    const coveredSet = new Set(monthKeysToCover);
    const remainingHistory = existingHistory.filter((p) => !coveredSet.has(p.monthKey));
    const totalPaidValue = typeof amount === 'number' && amount >= 0 ? amount : (planType === 'annual' ? (sub.monthlyFee || 25000) * 12 : sub.monthlyFee || 25000);
    const perMonthEquivalent = Math.round(totalPaidValue / monthsCount);
    const untilMonthKey = monthKeysToCover[monthKeysToCover.length - 1];
    const nextMonthlyFee =
      planType === 'monthly' && amount && amount > 0
        ? amount
        : sub.monthlyFee;

    const newRecords: TenantMonthlyPayment[] = monthKeysToCover.map((mk, idx) => {
      const mName = formatMonthKeyEs(mk);
      return {
        id: `pay-${mk}-${Date.now()}-${idx}`,
        monthKey: mk,
        monthName: mName,
        paidAt: todayStr,
        amountPaid: idx === 0 ? totalPaidValue : perMonthEquivalent,
        status: 'paid',
        planType,
        planTier: resolvedPlanTier,
        planTierLabel: resolvedPlanTierLabel,
        coveredMonthsCount: monthsCount,
        paymentMethod: paymentDetails?.paymentMethod || 'manual',
        mpPaymentId: paymentDetails?.mpPaymentId,
        mpPreferenceId: paymentDetails?.mpPreferenceId,
        receiptAlias: paymentDetails?.receiptAlias,
        receiptImageUrl: idx === 0 ? paymentDetails?.receiptImageUrl : undefined,
        verificationNote: paymentDetails?.verificationNote,
        notes:
          notes ||
          (planType === 'annual'
            ? `Suscripción Anual (12 meses: ${formatMonthKeyEs(monthKey)} a ${formatMonthKeyEs(untilMonthKey)})${resolvedPlanTierLabel ? ` · ${resolvedPlanTierLabel}` : ''}`
            : `Pago de abono mensual ${mName}${resolvedPlanTierLabel ? ` · ${resolvedPlanTierLabel}` : ''}`),
        markedBy: adminName,
      };
    });

    const updatedHistory = [...newRecords, ...remainingHistory];

    return {
      ...tenant,
      status: 'active', // Pasa automáticamente de prueba/pausada a Funcionando
      catalogEnabled:
        resolvedPlanTier !== undefined
          ? resolvedPlanTier !== 'basico'
          : tenant.catalogEnabled,
      subscription: {
        ...sub,
        monthlyFee: nextMonthlyFee,
        planTier: resolvedPlanTier,
        planSelectedAt: resolvedPlanTier
          ? sub.planSelectedAt || new Date().toISOString()
          : sub.planSelectedAt,
        isPaused: false,
        pausedAt: undefined,
        pauseReason: undefined,
        pausedBy: undefined,
        lastPaidMonth: monthKey,
        annualPlanUntilMonth:
          planType === 'annual'
            ? untilMonthKey
            : sub.annualPlanUntilMonth && sub.annualPlanUntilMonth >= monthKey
            ? sub.annualPlanUntilMonth
            : undefined,
        annualPlanPurchasedAt: planType === 'annual' ? todayStr : sub.annualPlanPurchasedAt,
        paymentHistory: updatedHistory,
      },
    };
  } else {
    // Desmarcar pago del mes (y limpiar plan anual si cubría este mes)
    const updatedHistory = existingHistory.filter((p) => p.monthKey !== monthKey);
    return {
      ...tenant,
      subscription: {
        ...sub,
        lastPaidMonth: sub.lastPaidMonth === monthKey ? undefined : sub.lastPaidMonth,
        annualPlanUntilMonth:
          sub.annualPlanUntilMonth && sub.annualPlanUntilMonth >= monthKey
            ? undefined
            : sub.annualPlanUntilMonth,
        paymentHistory: updatedHistory,
      },
    };
  }
}

/**
 * Concede prórroga de 1 mes de uso a una empresa aunque deba el mes.
 */
export function grantTenantOneMonthExtension(
  tenant: Tenant,
  notes?: string,
  adminName: string = 'Super Administrador'
): Tenant {
  const sub = ensureTenantSubscription(tenant);
  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
  const targetDateEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
  const dateStr = targetDateEnd.toISOString().split('T')[0];

  return {
    ...tenant,
    status: 'active', // Permite operar dentro de Funcionando
    subscription: {
      ...sub,
      isPaused: false,
      pausedAt: undefined,
      pauseReason: undefined,
      pausedBy: undefined,
      extendedUntilMonth: nextMonthKey,
      extendedUntilDate: dateStr,
      extensionNotes: notes || `Prórroga de uso por 1 mes concedida por ${adminName}`,
    },
  };
}

/**
 * Pausa o reanuda una empresa.
 */
export function setTenantPausedState(
  tenant: Tenant,
  shouldPause: boolean,
  reason?: string,
  pausedBy: 'admin' | 'tenant' | 'trial_expired' = 'admin'
): Tenant {
  const sub = ensureTenantSubscription(tenant);
  const todayStr = new Date().toISOString().split('T')[0];

  // Si se reanuda y tenía una prueba vigente sin pagos previos, volver a 'trial' si todavía le quedan días; si no, 'active'
  let nextStatus: 'active' | 'suspended' | 'trial' = shouldPause ? 'suspended' : 'active';
  if (!shouldPause && sub.trialEndsAt && (sub.paymentHistory || []).length === 0) {
    const endMid = new Date(`${sub.trialEndsAt}T12:00:00`).getTime();
    if (endMid > Date.now()) {
      nextStatus = 'trial';
    }
  }

  return {
    ...tenant,
    status: nextStatus,
    subscription: {
      ...sub,
      isPaused: shouldPause,
      pausedAt: shouldPause ? todayStr : undefined,
      pauseReason: shouldPause ? (reason || 'Pausada por administración') : undefined,
      pausedBy: shouldPause ? pausedBy : undefined,
    },
  };
}

/**
 * Genera el mensaje de WhatsApp para cobrar o recordar suscripción / fin de prueba a una empresa.
 */
export function generateSubscriptionWhatsAppReminder(
  tenant: Tenant,
  evalStatus: TenantSubscriptionEvaluation
): string {
  const sub = ensureTenantSubscription(tenant);
  const feeFormatted = `$ ${Number(sub.monthlyFee || 25000).toLocaleString('es-AR')}`;

  if (evalStatus.status === 'paused') {
    return `⚠️ *AVISO DE CUENTA PAUSADA* ⚠️\n🏢 *${tenant.name}*\n\nEstimado/a titular, le informamos que la cuenta de su distribuidora se encuentra actualmente *PAUSADA*.\n\n💰 *Monto de suscripción mensual:* ${feeFormatted}\n\nPara reactivar el acceso de forma inmediata a todas las funciones y boletas de su distribuidora, puede abonar desde la plataforma o enviarnos el comprobante por este medio. Muchas gracias.`;
  }

  if (evalStatus.status === 'trial_active') {
    return `✨ *SEGUIMIENTO DE PRUEBA GRATIS (30 DÍAS)* ✨\n🏢 *${tenant.name}*\n\nHola! Le escribimos desde administración comercial.\nSu distribuidora está disfrutando de su prueba gratuita de 30 días (quedan *${evalStatus.trialDaysRemaining} días*, vence el ${evalStatus.trialEndsAt}).\n\n💰 *Abono mensual al finalizar la prueba:* ${feeFormatted}\n\nCuando decida confirmar la continuidad, podrá abonar directo con Mercado Pago o Alias desde su panel. ¡Seguimos a disposición!`;
  }

  if (evalStatus.status === 'trial_expired') {
    return `⏰ *FIN DE PRUEBA GRATUITA DE 30 DÍAS* ⏰\n🏢 *${tenant.name}*\n\nHola! Finalizaron los 30 días de prueba gratuita de su distribuidora en el sistema de gestión.\n\n💰 *Monto mensual para continuar operando:* ${feeFormatted}\n\nPuede ingresar a su panel y hacer clic en *"Efectuar Pago"* (Mercado Pago / Alias) para pasar de prueba a cuenta activa al instante, o pausar su cuenta si desea suspender el uso. ¡Muchas gracias!`;
  }

  if (evalStatus.status === 'overdue') {
    return `🚨 *RECORDATORIO DE ABONO MENSUAL VENCIDO* 🚨\n🏢 *${tenant.name}*\n\nEstimado/a titular de ${tenant.name}:\nLe informamos que el plazo regular de pago para el abono de *${evalStatus.currentMonthName}* (del 1 al 5) ha finalizado y su cuenta registra saldo pendiente.\n\n📅 *Período:* ${evalStatus.currentMonthName}\n💰 *Monto mensual:* ${feeFormatted}\n⏰ *Días de mora:* ${evalStatus.daysPastWindow} días tras el vencimiento del día 5\n\n📌 Le solicitamos regularizar el pago a la brevedad para evitar que el sistema pause automáticamente el acceso a la plataforma. Quedamos a disposición por cualquier consulta.`;
  }

  return `🗓️ *RECORDATORIO DE ABONO MENSUAL (1 AL 5)* 🗓️\n🏢 *${tenant.name}*\n\nHola estimado/a titular de ${tenant.name}:\nLe recordamos que se encuentra abierto el período habitual de pago (del 1 al 5) para el abono mensual correspondiente a *${evalStatus.currentMonthName}*.\n\n💰 *Monto mensual del servicio:* ${feeFormatted}\n⏰ *Fecha límite de pago sin recargos:* 5 de ${evalStatus.currentMonthName.split(' ')[0]}\n\nPor favor envíenos su comprobante una vez efectuada la transferencia o abone vía Mercado Pago para asentar el mes como cancelado en su perfil. ¡Muchas gracias!`;
}
