import React, { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CreditCard,
  Crown,
  Lock,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { PlatformBillingConfig, SubscriptionPlanTier, Tenant } from '../types';
import {
  getPlanDefinitionByTier,
  getSubscriptionPlanDefinitions,
  PLAN_WEB_MAX_PRODUCTS,
  PLAN_WEB_MAX_RUBROS,
  resolveTenantPlanTier,
} from '../utils/tenantSubscription';
import {
  getPlanTransitionImpactSummary,
  TERMS_VERSION,
} from '../utils/termsAndConditions';
import { TermsConditionsScrollBox } from './TermsConditionsModal';

export type PlanUpgradeReasonKey =
  | 'limit_rubros'
  | 'limit_products'
  | 'full_feature'
  | 'manual_switch';

export interface PlanUpgradeTriggerContext {
  reasonKey: PlanUpgradeReasonKey;
  title?: string;
  detail?: string;
  initialTargetTier?: SubscriptionPlanTier;
}

interface PlanUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant | null;
  billingConfig: Partial<PlatformBillingConfig> | null;
  triggerContext: PlanUpgradeTriggerContext | null;
  onConfirmPlanChange: (details: {
    targetTier: SubscriptionPlanTier;
    triggerReason: string;
    acceptedTermsAt: string;
    termsVersion: string;
    newMonthlyFee: number;
    openPaymentAfter?: boolean;
  }) => void;
}

const TIER_ORDER: Record<SubscriptionPlanTier, number> = {
  basico: 1,
  web: 2,
  full: 3,
};

export const PlanUpgradeModal: React.FC<PlanUpgradeModalProps> = ({
  isOpen,
  onClose,
  tenant,
  billingConfig,
  triggerContext,
  onConfirmPlanChange,
}) => {
  const [step, setStep] = useState<'overview' | 'terms'>('overview');
  const [selectedTargetTier, setSelectedTargetTier] = useState<SubscriptionPlanTier>('full');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [openPaymentAfter, setOpenPaymentAfter] = useState(false);

  const currentTier: SubscriptionPlanTier = tenant
    ? resolveTenantPlanTier(tenant) || 'full'
    : 'web';

  useEffect(() => {
    if (isOpen && tenant) {
      setStep('overview');
      setAcceptedTerms(false);
      setOpenPaymentAfter(false);

      if (triggerContext?.initialTargetTier && triggerContext.initialTargetTier !== currentTier) {
        setSelectedTargetTier(triggerContext.initialTargetTier);
      } else if (
        triggerContext?.reasonKey === 'limit_rubros' ||
        triggerContext?.reasonKey === 'limit_products' ||
        triggerContext?.reasonKey === 'full_feature'
      ) {
        setSelectedTargetTier('full');
      } else {
        // En cambio manual: sugerir una sección distinta a la actual
        setSelectedTargetTier(
          currentTier === 'full' ? 'web' : currentTier === 'web' ? 'full' : 'web'
        );
      }
    }
  }, [isOpen, tenant?.id, triggerContext?.reasonKey, triggerContext?.title, triggerContext?.initialTargetTier, currentTier]);

  if (!isOpen || !tenant) return null;

  const isManualSwitch = triggerContext?.reasonKey === 'manual_switch';
  const planDefinitions = getSubscriptionPlanDefinitions(billingConfig);
  const currentDef = getPlanDefinitionByTier(currentTier, billingConfig);
  const targetDef = getPlanDefinitionByTier(selectedTargetTier, billingConfig);
  const currentFee = tenant.subscription?.monthlyFee ?? currentDef.monthlyPrice;
  const targetFee = targetDef.monthlyPrice;
  const feeDiff = targetFee - currentFee;
  const isSameTier = selectedTargetTier === currentTier;
  const isUpgrade = TIER_ORDER[selectedTargetTier] > TIER_ORDER[currentTier];
  const isDowngrade = TIER_ORDER[selectedTargetTier] < TIER_ORDER[currentTier];
  const transitionImpact = getPlanTransitionImpactSummary(currentTier, selectedTargetTier);

  const defaultReasonTitle =
    triggerContext?.reasonKey === 'limit_rubros'
      ? `Alcanzaste el límite de ${PLAN_WEB_MAX_RUBROS} rubros de tu Plan 2`
      : triggerContext?.reasonKey === 'limit_products'
      ? `Alcanzaste el límite de ${PLAN_WEB_MAX_PRODUCTS} prendas / objetos de tu Plan 2`
      : triggerContext?.reasonKey === 'manual_switch'
      ? 'Elegí a qué plan querés cambiar (Plan 1, Plan 2 o Plan 3)'
      : 'Función exclusiva de Plan 3 · Full';

  const displayTitle = triggerContext?.title || defaultReasonTitle;
  const displayDetail =
    triggerContext?.detail ||
    (triggerContext?.reasonKey === 'limit_rubros'
      ? `Tu plan actual (${currentDef.sectionBadge} · ${currentDef.shortName}) permite hasta ${PLAN_WEB_MAX_RUBROS} rubros/subfiltros. Para agregar un rubro más necesitás ampliar a Plan 3 · Full.`
      : triggerContext?.reasonKey === 'limit_products'
      ? `Tu plan actual (${currentDef.sectionBadge} · ${currentDef.shortName}) permite cargar hasta ${PLAN_WEB_MAX_PRODUCTS} prendas u objetos con manejo de stock. Para seguir cargando artículos necesitás ampliar a Plan 3 · Full.`
      : triggerContext?.reasonKey === 'manual_switch'
      ? `Actualmente estás en ${currentDef.sectionBadge} · ${currentDef.shortName}. Podés subir o volver a cualquier otro plan cuando lo necesites aceptando los Términos y Condiciones de Uso y Manejo.`
      : `Tu plan actual (${currentDef.sectionBadge} · ${currentDef.shortName}) no incluye esta herramienta. Ampliá a Plan 3 · Full para habilitar ofertas, seguimiento de clientes, SuperClub y descuentos.`);

  const canonicalReasonLabel =
    triggerContext?.reasonKey === 'limit_rubros'
      ? `Ampliación por límite de ${PLAN_WEB_MAX_RUBROS} rubros`
      : triggerContext?.reasonKey === 'limit_products'
      ? `Ampliación por límite de ${PLAN_WEB_MAX_PRODUCTS} prendas/objetos`
      : triggerContext?.reasonKey === 'manual_switch'
      ? `Cambio autogestionado (${currentDef.sectionBadge} → ${targetDef.sectionBadge})`
      : `Activación de herramienta Plan Full (${displayTitle})`;

  const handleConfirmChange = () => {
    if (!acceptedTerms || isSameTier) return;
    const acceptedTermsAt = new Date().toISOString();
    onConfirmPlanChange({
      targetTier: selectedTargetTier,
      triggerReason: canonicalReasonLabel,
      acceptedTermsAt,
      termsVersion: TERMS_VERSION,
      newMonthlyFee: targetFee,
      openPaymentAfter,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0B1933] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-[#091428] flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                {step === 'overview'
                  ? 'Gestión de Planes · Cambio Bidireccional (Plan 1 ↔ 2 ↔ 3)'
                  : `Paso Final · Términos y Condiciones (v${TERMS_VERSION})`}
              </div>
              <h3 className="text-base sm:text-lg font-bold tracking-tight truncate">
                {step === 'overview'
                  ? isManualSwitch
                    ? 'Cambiar de Plan de Servicio'
                    : `Cambiar a ${targetDef.sectionBadge} · ${targetDef.shortName}`
                  : `Confirmar Cambio: ${currentDef.sectionBadge} → ${targetDef.sectionBadge}`}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Progress indicator */}
          <div className="flex items-center gap-2 text-xs font-semibold flex-wrap">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border ${
                step === 'overview'
                  ? 'bg-[#0B1933] text-white border-[#0B1933]'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              <span>1. Elegir Plan y Valor</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border ${
                step === 'terms'
                  ? 'bg-[#0B1933] text-white border-[#0B1933]'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              <span>2. Términos de Uso, Manejo y Confirmación</span>
            </div>
          </div>

          {step === 'overview' ? (
            <>
              {/* Context Notice */}
              <div
                className={`p-4 rounded-xl border space-y-1.5 ${
                  isManualSwitch
                    ? 'bg-sky-50 border-sky-200'
                    : 'bg-amber-50 border-amber-300'
                }`}
              >
                <div
                  className={`flex items-center gap-2 text-xs font-bold ${
                    isManualSwitch ? 'text-[#0B1933]' : 'text-amber-950'
                  }`}
                >
                  {isManualSwitch ? (
                    <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
                  ) : (
                    <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                  )}
                  <span>{displayTitle}</span>
                </div>
                <p
                  className={`text-xs leading-relaxed ${
                    isManualSwitch ? 'text-slate-700' : 'text-amber-900'
                  }`}
                >
                  {displayDetail}
                </p>
              </div>

              {/* 3-Plan Selector (Always allow choosing 1, 2, or 3 cleanly; highlights current & chosen) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {planDefinitions.map((def) => {
                  const isCurrentPlan = def.tier === currentTier;
                  const isSelected = def.tier === selectedTargetTier;
                  const diffFromCurrent = def.monthlyPrice - currentFee;

                  return (
                    <button
                      key={def.tier}
                      type="button"
                      disabled={isCurrentPlan}
                      onClick={() => setSelectedTargetTier(def.tier)}
                      className={`rounded-xl border p-4 text-left flex flex-col justify-between gap-3 transition-all ${
                        isCurrentPlan
                          ? 'bg-slate-100 border-slate-300 opacity-85 cursor-not-allowed'
                          : isSelected
                          ? 'bg-white border-2 border-[#0B1933] shadow-md ring-2 ring-[#0B1933]/10 cursor-pointer'
                          : 'bg-slate-50/70 border-slate-200 hover:border-slate-400 cursor-pointer'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              isCurrentPlan
                                ? 'bg-slate-300 text-slate-800'
                                : def.tier === 'full'
                                ? 'bg-amber-400 text-[#091428]'
                                : def.tier === 'web'
                                ? 'bg-sky-600 text-white'
                                : 'bg-[#0B1933] text-white'
                            }`}
                          >
                            {isCurrentPlan ? `Actual · ${def.sectionBadge}` : def.sectionBadge}
                          </span>
                          {!isCurrentPlan && isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          )}
                        </div>

                        <div>
                          <div className="text-xs font-bold text-slate-900">{def.shortName}</div>
                          <div className="mt-1 font-mono font-black text-base text-[#0B1933] tabular-nums">
                            $ {def.monthlyPrice.toLocaleString('es-AR')}
                            <span className="text-[11px] font-normal text-slate-500"> / mes</span>
                          </div>
                          {!isCurrentPlan && diffFromCurrent !== 0 && (
                            <div
                              className={`text-[10.5px] font-mono font-bold tabular-nums mt-0.5 ${
                                diffFromCurrent > 0 ? 'text-amber-700' : 'text-emerald-700'
                              }`}
                            >
                              {diffFromCurrent > 0
                                ? `+$ ${diffFromCurrent.toLocaleString('es-AR')}/mes (Suba)`
                                : `-$ ${Math.abs(diffFromCurrent).toLocaleString('es-AR')}/mes (Menor abono)`}
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-600 leading-snug">{def.tagline}</p>

                        <ul className="space-y-1 text-[10.5px] text-slate-700 pt-1.5 border-t border-slate-200/80">
                          {def.includedFeatures.slice(0, 3).map((feat) => (
                            <li key={feat} className="flex items-start gap-1.5">
                              <Check className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                              <span className="leading-tight">{feat}</span>
                            </li>
                          ))}
                          {def.excludedFeatures.slice(0, 2).map((ex) => (
                            <li key={ex} className="flex items-start gap-1.5 text-rose-700">
                              <X className="w-3 h-3 shrink-0 mt-0.5" />
                              <span className="leading-tight">{ex}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="text-[11px] font-bold pt-1">
                        {isCurrentPlan ? (
                          <span className="text-slate-500">Plan en uso actualmente</span>
                        ) : isSelected ? (
                          <span className="text-[#0B1933]">✓ Elegido para cambiar</span>
                        ) : (
                          <span className="text-sky-700">Seleccionar {def.sectionBadge}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Price Summary & Transition Strip */}
              {!isSameTier && (
                <div className="rounded-xl bg-slate-100 border border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-slate-600">
                      Transición: <strong>{currentDef.sectionBadge}</strong> →{' '}
                      <strong>{targetDef.sectionBadge}</strong>
                    </span>
                    <div className="text-base font-mono font-black text-[#0B1933] tabular-nums">
                      Nuevo abono: $ {targetFee.toLocaleString('es-AR')} / mes
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-[11px] text-slate-500">
                      {isUpgrade ? 'Diferencia adicional:' : isDowngrade ? 'Reducción mensual:' : 'Mismo valor:'}
                    </span>
                    <div
                      className={`font-mono font-bold tabular-nums ${
                        feeDiff > 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {feeDiff > 0
                        ? `+$ ${feeDiff.toLocaleString('es-AR')} / mes`
                        : feeDiff < 0
                        ? `-$ ${Math.abs(feeDiff).toLocaleString('es-AR')} / mes`
                        : '$ 0 / mes'}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Mantener {currentDef.sectionBadge}
                </button>
                <button
                  type="button"
                  disabled={isSameTier}
                  onClick={() => setStep('terms')}
                  className="px-5 py-3 rounded-xl bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isDowngrade ? (
                    <ArrowDownRight className="w-4 h-4 text-amber-300" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4 text-emerald-300" />
                  )}
                  <span>
                    Continuar al cambio a {targetDef.sectionBadge} ($ {targetFee.toLocaleString('es-AR')}/mes)
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Step 2: Impact Summary + Complete Terms & Conditions */}
              <div
                className={`rounded-xl border p-4 space-y-2 ${
                  isDowngrade
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-emerald-50/70 border-emerald-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0B1933]">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        isDowngrade
                          ? 'bg-amber-200 text-amber-950'
                          : 'bg-emerald-200 text-emerald-950'
                      }`}
                    >
                      {transitionImpact.badgeLabel}
                    </span>
                    <span>{transitionImpact.headline}</span>
                  </div>
                  <span className="text-xs font-mono font-black text-[#0B1933] tabular-nums">
                    $ {currentFee.toLocaleString('es-AR')} → $ {targetFee.toLocaleString('es-AR')}/mes
                  </span>
                </div>
                <ul className="space-y-1 text-xs text-slate-700 pl-1">
                  {transitionImpact.bullets.map((b, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <CheckCircle2
                        className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                          isDowngrade ? 'text-amber-700' : 'text-emerald-600'
                        }`}
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Complete Scrollable Terms & Conditions */}
              <TermsConditionsScrollBox variant="light" maxHeightClass="max-h-56" />

              <div className="space-y-2.5">
                <label className="flex items-start gap-2.5 p-3.5 rounded-xl border border-slate-200 bg-white cursor-pointer hover:border-[#0B1933] transition-colors">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#0B1933]"
                  />
                  <span className="text-xs font-semibold text-slate-900 leading-snug">
                    He leído y acepto los{' '}
                    <strong>Términos y Condiciones de Uso y Manejo (v{TERMS_VERSION})</strong> para efectuar el cambio de{' '}
                    <strong>{currentDef.sectionBadge}</strong> a{' '}
                    <strong>{targetDef.sectionBadge}</strong> con abono mensual de{' '}
                    <strong className="font-mono tabular-nums">
                      $ {targetFee.toLocaleString('es-AR')}/mes
                    </strong>.
                  </span>
                </label>

                <label className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={openPaymentAfter}
                    onChange={(e) => setOpenPaymentAfter(e.target.checked)}
                    className="rounded border-slate-300 text-[#0B1933]"
                  />
                  <CreditCard className="w-3.5 h-3.5 text-[#009EE3] shrink-0" />
                  <span>
                    Opcional: abrir también la ventana de pago tras confirmar el cambio a {targetDef.sectionBadge}
                  </span>
                </label>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setStep('overview')}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  ← Volver a elegir plan
                </button>
                <button
                  type="button"
                  disabled={!acceptedTerms || isSameTier}
                  onClick={handleConfirmChange}
                  className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Aceptar Términos y Cambiar a {targetDef.sectionBadge}</span>
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
