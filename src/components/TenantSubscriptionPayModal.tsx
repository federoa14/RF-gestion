import React, { useState, useEffect, useRef } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Clock,
  Flame,
  Wallet,
  X,
  RefreshCw,
  ArrowRight,
  Lock,
  Upload,
  Image as ImageIcon,
  FileCheck2,
  AlertTriangle,
  Link2,
  MessageCircle,
} from 'lucide-react';
import {
  Tenant,
  PlatformBillingConfig,
  TenantSubscriptionPayOrder,
  SubscriptionPlanTier,
} from '../types';
import {
  getTenantSubscriptionStatus,
  getCurrentMonthInfo,
  ensureTenantSubscription,
  calculateAnnualFee,
  addMonthsToMonthKey,
  formatMonthKeyEs,
  getSubscriptionPlanDefinitions,
  getPlanDefinitionByTier,
  resolveTenantPlanTier,
} from '../utils/tenantSubscription';
import {
  loadPlatformBillingConfig,
  fetchPlatformBillingConfigFromServer,
} from '../utils/multiTenantStorage';
import {
  getPlanTransitionImpactSummary,
  TERMS_VERSION,
} from '../utils/termsAndConditions';
import { TermsConditionsScrollBox } from './TermsConditionsModal';
import {
  createMercadoPagoPreferenceViaEdgeFunction,
  createTenantSubscriptionPayOrder,
  fetchVerifiedTenantPaymentStatusFromSupabase,
  getTenantSubPayOrderFromCloud,
  verifyAndRecordTenantPaymentInSupabase,
} from '../utils/supabaseServices';

interface TenantSubscriptionPayModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant;
  payerEmail?: string;
  autoGenerateLinkOnOpen?: boolean;
  initialPlanTier?: SubscriptionPlanTier;
  onSelectPlanTier?: (
    tier: SubscriptionPlanTier,
    termsMeta?: { acceptedTermsAt: string; termsVersion: string }
  ) => void;
  onPaymentApproved: (details: {
    monthKey: string;
    amount: number;
    planType?: 'monthly' | 'annual';
    planTier?: SubscriptionPlanTier;
    planTierLabel?: string;
    monthsCount?: number;
    paymentMethod: 'mercadopago' | 'transferencia';
    mpPaymentId?: string;
    mpPreferenceId?: string;
    receiptAlias?: string;
    receiptImageUrl?: string;
    verificationNote?: string;
  }) => void;
}

interface ReceiptAnalysisResult {
  isValidPaymentReceipt?: boolean;
  paymentStatus?: string;
  detectedAmount?: number;
  detectedAliasOrCvu?: string;
  detectedRecipientName?: string;
  operationId?: string;
  paymentDate?: string;
  platform?: string;
  reasonSummary?: string;
}

/**
 * Redimensiona y comprime la captura del comprobante en el cliente para envío rápido y almacenamiento ligero.
 */
async function compressReceiptImage(file: File): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo seleccionado no es una imagen válida.'));
      img.onload = () => {
        const maxSide = 1024;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width >= height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: String(reader.result), mimeType: file.type || 'image/jpeg' });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.84);
        resolve({ dataUrl: compressed, mimeType: 'image/jpeg' });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const TenantSubscriptionPayModal: React.FC<TenantSubscriptionPayModalProps> = ({
  isOpen,
  onClose,
  tenant,
  payerEmail,
  autoGenerateLinkOnOpen = false,
  initialPlanTier,
  onSelectPlanTier,
  onPaymentApproved,
}) => {
  const [billingConfig, setBillingConfig] = useState<PlatformBillingConfig>(loadPlatformBillingConfig);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly');
  const [selectedTier, setSelectedTier] = useState<SubscriptionPlanTier>(
    () => initialPlanTier || resolveTenantPlanTier(tenant) || 'web'
  );
  const [copiedAlias, setCopiedAlias] = useState(false);
  const [copiedCvu, setCopiedCvu] = useState(false);
  const [copiedPayLink, setCopiedPayLink] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingShareLink, setIsGeneratingShareLink] = useState(false);
  const [generatedPayOrder, setGeneratedPayOrder] = useState<{
    order: TenantSubscriptionPayOrder;
    payUrl: string;
  } | null>(null);
  const [isVerifyingReceipt, setIsVerifyingReceipt] = useState(false);
  const [step, setStep] = useState<'summary' | 'mp_checkout_waiting' | 'success'>('summary');
  const [checkoutInfo, setCheckoutInfo] = useState<{
    mode: string;
    initPoint?: string;
    mpCheckoutLink?: string;
    preferenceId?: string;
  } | null>(null);
  const [operationNumber, setOperationNumber] = useState('');
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [receiptMimeType, setReceiptMimeType] = useState<string>('image/jpeg');
  const [receiptAnalysis, setReceiptAnalysis] = useState<ReceiptAnalysisResult | null>(null);
  const [verifiedSuccessMessage, setVerifiedSuccessMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingSwitchTier, setPendingSwitchTier] = useState<SubscriptionPlanTier | null>(null);
  const [switchTermsAccepted, setSwitchTermsAccepted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      const nextTier: SubscriptionPlanTier =
        initialPlanTier || resolveTenantPlanTier(tenant) || 'web';
      setStep('summary');
      setSelectedPlan('monthly');
      setSelectedTier(nextTier);
      setPendingSwitchTier(null);
      setSwitchTermsAccepted(false);
      setErrorMsg(null);
      setCheckoutInfo(null);
      setGeneratedPayOrder(null);
      setCopiedPayLink(false);
      setOperationNumber('');
      setReceiptPreviewUrl(null);
      setReceiptAnalysis(null);
      setVerifiedSuccessMessage(null);
      fetchPlatformBillingConfigFromServer().then((freshCfg) => {
        setBillingConfig(freshCfg);
        if (autoGenerateLinkOnOpen) {
          const mInfo = getCurrentMonthInfo();
          const tierDef = getPlanDefinitionByTier(nextTier, freshCfg);
          const fee = tierDef.monthlyPrice;
          setIsGeneratingShareLink(true);
          createTenantSubscriptionPayOrder({
            tenant,
            monthKey: mInfo.monthKey,
            monthName: mInfo.monthName,
            planType: 'monthly',
            planTier: tierDef.tier,
            planTierLabel: `${tierDef.sectionBadge} · ${tierDef.name}`,
            monthsCount: 1,
            amount: fee,
            billingConfig: freshCfg,
            payerEmail: payerEmail || tenant.email,
            generatedBy: 'tenant',
            notes: `${tierDef.sectionBadge}: ${tierDef.name}`,
          })
            .then((res) => setGeneratedPayOrder(res))
            .catch(() => {})
            .finally(() => setIsGeneratingShareLink(false));
        }
      });
    }
  }, [isOpen, autoGenerateLinkOnOpen, initialPlanTier, tenant.id]);

  if (!isOpen) return null;

  const monthInfo = getCurrentMonthInfo();
  const evalStatus = getTenantSubscriptionStatus(tenant);
  const planDefinitions = getSubscriptionPlanDefinitions(billingConfig);
  const activeTierDef = getPlanDefinitionByTier(selectedTier, billingConfig);
  const activeTierFullLabel = `${activeTierDef.sectionBadge} · ${activeTierDef.name}`;
  const monthlyFee = activeTierDef.monthlyPrice;
  const annualDiscountPct = Math.max(0, Math.min(50, Number(billingConfig.annualDiscountPercent || 0)));
  const annualTotal = calculateAnnualFee(monthlyFee, annualDiscountPct);
  const annualSavings = Math.max(0, monthlyFee * 12 - annualTotal);
  const monthsCount = selectedPlan === 'annual' ? 12 : 1;
  const amountToPay = selectedPlan === 'annual' ? annualTotal : monthlyFee;
  const annualUntilMonthKey = addMonthsToMonthKey(monthInfo.monthKey, 11);
  const annualUntilLabel = formatMonthKeyEs(annualUntilMonthKey);
  const dueDateLabel = `5 de ${monthInfo.monthName.split(' ')[0]} de ${monthInfo.year}`;

  const directMpFallbackUrl = billingConfig.mpCheckoutLink || 'https://www.mercadopago.com.ar/';

  const handleCopy = (text: string, type: 'alias' | 'cvu') => {
    navigator.clipboard.writeText(text);
    if (type === 'alias') {
      setCopiedAlias(true);
      setTimeout(() => setCopiedAlias(false), 2000);
    } else {
      setCopiedCvu(true);
      setTimeout(() => setCopiedCvu(false), 2000);
    }
  };

  // Poll automático cada 5s mientras espera confirmación del Webhook oficial de Mercado Pago o de un link ?sub_pay=
  useEffect(() => {
    if (!isOpen || (step !== 'mp_checkout_waiting' && !generatedPayOrder)) return;
    let cancelled = false;
    const mInfo = getCurrentMonthInfo();
    const timer = setInterval(async () => {
      if (cancelled) return;
      try {
        if (generatedPayOrder?.order.token) {
          const remoteOrder = await getTenantSubPayOrderFromCloud(generatedPayOrder.order.token);
          if (!cancelled && remoteOrder && remoteOrder.status === 'approved') {
            setStep('success');
            onPaymentApproved({
              monthKey: remoteOrder.monthKey || mInfo.monthKey,
              amount: remoteOrder.amount || amountToPay,
              planType: remoteOrder.planType || selectedPlan,
              planTier: remoteOrder.planTier || activeTierDef.tier,
              planTierLabel: remoteOrder.planTierLabel || activeTierFullLabel,
              monthsCount: remoteOrder.monthsCount || monthsCount,
              paymentMethod: remoteOrder.paymentMethod || 'mercadopago',
              mpPaymentId: remoteOrder.mpPaymentId,
              mpPreferenceId: remoteOrder.mpPreferenceId,
              receiptAlias: remoteOrder.alias || billingConfig.alias,
              receiptImageUrl: remoteOrder.receiptImageUrl,
              verificationNote: remoteOrder.verificationSummary,
            });
            return;
          }
        }
        const res = await fetchVerifiedTenantPaymentStatusFromSupabase(tenant.id, mInfo.monthKey);
        if (!cancelled && res.approved && res.payment) {
          setStep('success');
          onPaymentApproved({
            monthKey: mInfo.monthKey,
            amount: res.payment.amount || amountToPay,
            planType: res.payment.planType || selectedPlan,
            planTier: res.payment.planTier || activeTierDef.tier,
            planTierLabel: res.payment.planTierLabel || activeTierFullLabel,
            monthsCount: res.payment.monthsCount || monthsCount,
            paymentMethod: res.payment.paymentMethod || 'mercadopago',
            mpPaymentId: res.payment.mpPaymentId,
            mpPreferenceId: res.payment.mpPreferenceId,
            receiptAlias: billingConfig.alias,
            verificationNote: res.payment.verificationSummary,
          });
        }
      } catch {
        // silent poll
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOpen, step, tenant.id, generatedPayOrder?.order.token]);

  const handleGenerateShareablePayLink = async () => {
    setIsGeneratingShareLink(true);
    setErrorMsg(null);
    try {
      const freshBilling = await fetchPlatformBillingConfigFromServer();
      setBillingConfig((prev) => ({ ...prev, ...freshBilling }));
      const freshTierDef = getPlanDefinitionByTier(selectedTier, freshBilling);
      const freshMonthlyFee = freshTierDef.monthlyPrice;
      const freshDisc = Math.max(0, Math.min(50, Number(freshBilling.annualDiscountPercent || 0)));
      const freshAmount =
        selectedPlan === 'annual' ? calculateAnnualFee(freshMonthlyFee, freshDisc) : freshMonthlyFee;
      const created = await createTenantSubscriptionPayOrder({
        tenant,
        monthKey: monthInfo.monthKey,
        monthName: monthInfo.monthName,
        planType: selectedPlan,
        planTier: freshTierDef.tier,
        planTierLabel: `${freshTierDef.sectionBadge} · ${freshTierDef.name}`,
        monthsCount,
        amount: freshAmount,
        billingConfig: freshBilling,
        payerEmail: payerEmail || tenant.email,
        generatedBy: 'tenant',
        notes: `${freshTierDef.sectionBadge}: ${freshTierDef.name}`,
      });
      setGeneratedPayOrder(created);
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo generar el link de pago.');
    } finally {
      setIsGeneratingShareLink(false);
    }
  };

  // Al hacer clic en "Pagar con Mercado Pago" -> Genera preferencia Checkout Pro vía Edge Function o deriva al link configurado
  const handleStartMercadoPagoCheckout = async () => {
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const freshBilling = await fetchPlatformBillingConfigFromServer();
      setBillingConfig((prev) => ({ ...prev, ...freshBilling }));

      const mpReturnUrl = (() => {
        if (typeof window === 'undefined') return undefined;
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('planTier', activeTierDef.tier);
          url.searchParams.set('tenantId', tenant.id);
          url.searchParams.set('monthKey', monthInfo.monthKey);
          url.searchParams.set('planType', selectedPlan);
          return url.toString();
        } catch {
          return window.location.href;
        }
      })();

      const edgePref = await createMercadoPagoPreferenceViaEdgeFunction({
        scope: 'tenant_subscription',
        tenantId: tenant.id,
        tenantName: tenant.name,
        monthKey: monthInfo.monthKey,
        planType: selectedPlan,
        amount: amountToPay,
        payerEmail: payerEmail || tenant.email,
        returnUrl: mpReturnUrl,
      });

      if (edgePref.ok && edgePref.initPoint) {
        setCheckoutInfo({
          mode: 'mercadopago_api',
          initPoint: edgePref.initPoint,
          mpCheckoutLink: freshBilling.mpCheckoutLink || billingConfig.mpCheckoutLink,
          preferenceId: edgePref.preferenceId,
        });
        window.open(edgePref.initPoint, '_blank', 'noopener,noreferrer');
        setStep('mp_checkout_waiting');
        return;
      }

      const targetMpUrl =
        freshBilling.mpCheckoutLink ||
        billingConfig.mpCheckoutLink ||
        'https://www.mercadopago.com.ar/';

      setCheckoutInfo({
        mode: targetMpUrl !== 'https://www.mercadopago.com.ar/' ? 'checkout_link' : 'alias_checkout',
        mpCheckoutLink: freshBilling.mpCheckoutLink || billingConfig.mpCheckoutLink,
        preferenceId: `mp-pref-${Date.now()}`,
      });

      window.open(targetMpUrl, '_blank', 'noopener,noreferrer');
      setStep('mp_checkout_waiting');
    } catch (err: any) {
      window.open(directMpFallbackUrl, '_blank', 'noopener,noreferrer');
      setErrorMsg(err.message || 'Error al abrir Mercado Pago.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Verifica y registra el abono directamente en Supabase por ID de operación o confirmación directa
  const handleVerifyAndReadPayment = async (
    method: 'mercadopago' | 'transferencia' = 'mercadopago',
    confirmDirect = false
  ) => {
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const data = await verifyAndRecordTenantPaymentInSupabase({
        tenantId: tenant.id,
        monthKey: monthInfo.monthKey,
        amount: amountToPay,
        planType: selectedPlan,
        planTier: activeTierDef.tier,
        planTierLabel: activeTierFullLabel,
        monthsCount,
        paymentId: operationNumber.trim() || undefined,
        preferenceId: checkoutInfo?.preferenceId,
        collectionStatus: confirmDirect ? 'approved' : undefined,
        paymentMethod: method,
        confirmInstant: confirmDirect,
        aliasUsed: billingConfig.alias,
      });

      if (data.approved && data.payment) {
        setStep('success');
        onPaymentApproved({
          monthKey: monthInfo.monthKey,
          amount: data.payment.amount || amountToPay,
          planType: data.payment.planType || selectedPlan,
          planTier: data.payment.planTier || activeTierDef.tier,
          planTierLabel: data.payment.planTierLabel || activeTierFullLabel,
          monthsCount: data.payment.monthsCount || monthsCount,
          paymentMethod: data.payment.paymentMethod || method,
          mpPaymentId: data.payment.mpPaymentId,
          mpPreferenceId: data.payment.mpPreferenceId,
          receiptAlias: billingConfig.alias,
        });
      } else {
        setErrorMsg(
          data.message ||
            'Ingresá el número de operación de Mercado Pago o adjuntá la imagen de tu comprobante para acreditarlo al instante.'
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al registrar el pago en Supabase.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Registra la imagen del comprobante directamente en Supabase
  const verifyUploadedReceiptImage = async (imageDataUrl: string, _mime: string) => {
    setIsVerifyingReceipt(true);
    setErrorMsg(null);
    setReceiptAnalysis(null);

    try {
      if (!imageDataUrl || imageDataUrl.length < 100) {
        throw new Error('La imagen del comprobante parece estar dañada o vacía.');
      }

      const opId = operationNumber.trim() || `COMP-${Date.now().toString().slice(-7)}`;
      const summaryText = `Comprobante registrado (${activeTierDef.sectionBadge} · ${
        selectedPlan === 'annual' ? 'Plan Anual 12 meses' : 'Abono mensual'
      }) • Op #${opId} • $ ${Number(amountToPay).toLocaleString('es-AR')}`;

      const data = await verifyAndRecordTenantPaymentInSupabase({
        tenantId: tenant.id,
        monthKey: monthInfo.monthKey,
        amount: amountToPay,
        planType: selectedPlan,
        planTier: activeTierDef.tier,
        planTierLabel: activeTierFullLabel,
        monthsCount,
        paymentId: opId,
        paymentMethod: 'transferencia',
        confirmInstant: true,
        aliasUsed: billingConfig.alias,
        receiptImageUrl: imageDataUrl,
        verifiedViaReceipt: true,
        verificationSummary: summaryText,
      });

      setReceiptAnalysis({
        detectedAmount: amountToPay,
        detectedAliasOrCvu: billingConfig.alias || billingConfig.cvu,
        operationId: opId,
        platform: 'Comprobante adjunto',
        reasonSummary: summaryText,
      });

      if (data.approved && data.payment) {
        setVerifiedSuccessMessage(
          `¡Comprobante guardado en Supabase! ${activeTierFullLabel} · ${
            selectedPlan === 'annual' ? 'Plan Anual (12 meses)' : 'Abono mensual'
          } de $ ${Number(data.payment.amount || amountToPay).toLocaleString('es-AR')} acreditado.`
        );
        setStep('success');
        onPaymentApproved({
          monthKey: monthInfo.monthKey,
          amount: data.payment.amount || amountToPay,
          planType: data.payment.planType || selectedPlan,
          planTier: data.payment.planTier || activeTierDef.tier,
          planTierLabel: data.payment.planTierLabel || activeTierFullLabel,
          monthsCount: data.payment.monthsCount || monthsCount,
          paymentMethod: data.payment.paymentMethod || 'mercadopago',
          mpPaymentId: data.payment.mpPaymentId,
          receiptAlias: billingConfig.alias,
          receiptImageUrl: data.payment.receiptImageUrl || imageDataUrl,
          verificationNote: data.payment.verificationSummary,
        });
      } else {
        setErrorMsg(
          data.message ||
            'No se pudo registrar el comprobante. Intentá nuevamente.'
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al verificar automáticamente el comprobante.');
    } finally {
      setIsVerifyingReceipt(false);
    }
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    try {
      const { dataUrl, mimeType } = await compressReceiptImage(file);
      setReceiptPreviewUrl(dataUrl);
      setReceiptMimeType(mimeType);
      await verifyUploadedReceiptImage(dataUrl, mimeType);
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo procesar la imagen seleccionada.');
    } finally {
      // Permitir volver a elegir el mismo archivo si fuera necesario
      e.target.value = '';
    }
  };

  const openMercadoPagoAppLink = () => {
    const targetUrl =
      checkoutInfo?.initPoint ||
      checkoutInfo?.mpCheckoutLink ||
      billingConfig.mpCheckoutLink ||
      'https://www.mercadopago.com.ar/';
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  // Bloque reutilizable: Copiar Alias + Subir Imagen del Comprobante con verificación automática
  const renderAliasAndReceiptUploader = () => (
    <div className="space-y-3">
      {/* CVU y Alias del Gestor General / Dueño del Sistema para Copiar */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 border border-slate-700 space-y-2.5 text-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" />
            <span>CVU y Alias del Gestor General / Dueño del Sistema</span>
          </span>
          <span className="text-[11px] text-slate-400">
            {billingConfig.bankOrWalletName || 'Mercado Pago'}
          </span>
        </div>

        {billingConfig.cvu && (
          <div className="flex items-center justify-between bg-slate-950 px-3 py-2.5 rounded-xl border border-emerald-500/40 gap-2">
            <div className="min-w-0">
              <span className="text-[10px] text-emerald-400 font-bold block">
                CVU Directo del Dueño del Sistema ({billingConfig.accountHolderName || 'Gestor General'}):
              </span>
              <span className="font-mono font-black text-sm text-white select-all break-all">
                {billingConfig.cvu}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(billingConfig.cvu!, 'cvu')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
            >
              {copiedCvu ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCvu ? '¡Copiado!' : 'Copiar CVU'}</span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between bg-slate-950 px-3 py-2.5 rounded-xl border border-slate-800 gap-2">
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 block">Copiá el Alias y transferí desde Mercado Pago o tu banco:</span>
            <span className="font-mono font-black text-sm text-sky-300 select-all break-all">
              {billingConfig.alias || 'cobranzas.gestion.mp'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(billingConfig.alias || 'cobranzas.gestion.mp', 'alias')}
            className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
          >
            {copiedAlias ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedAlias ? '¡Copiado!' : 'Copiar Alias'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-slate-300 px-1">
          <span>
            Titular / Gestor General: <strong className="text-white">{billingConfig.accountHolderName || 'Administración'}</strong>
          </span>
          {!billingConfig.cvu && (
            <span className="text-slate-400">Transferencia directa al titular del sistema</span>
          )}
        </div>
      </div>

      {/* Subir Imagen del Comprobante -> Comprobación Automática */}
      {!evalStatus.isPaidForCurrentMonth && (
        <div className="bg-slate-50 dark:bg-slate-800/60 border-2 border-dashed border-sky-300 dark:border-sky-700/70 rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>Subir Imagen del Comprobante de Pago</span>
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Adjuntá la captura o foto del comprobante. El sistema lo analizará automáticamente y, si el pago está realizado, marcará el mes como <strong>PAGADO</strong> al instante.
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleReceiptFileChange}
            className="hidden"
          />

          {!receiptPreviewUrl ? (
            <button
              type="button"
              disabled={isVerifyingReceipt}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 px-4 rounded-xl bg-white dark:bg-slate-900 hover:bg-sky-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
            >
              <Upload className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Seleccionar Imagen o Captura del Comprobante</span>
            </button>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <img
                  src={receiptPreviewUrl}
                  alt="Vista previa del comprobante"
                  className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
                />
                <div className="flex-1 min-w-0 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-white">
                    <ImageIcon className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    <span className="truncate">Comprobante cargado</span>
                  </div>
                  {isVerifyingReceipt ? (
                    <p className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Comprobando monto, estado y destinatario...</span>
                    </p>
                  ) : receiptAnalysis ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                      {receiptAnalysis.platform || 'Comprobante'} •{' '}
                      {receiptAnalysis.detectedAmount
                        ? `$ ${Number(receiptAnalysis.detectedAmount).toLocaleString('es-AR')}`
                        : 'Sin monto'}{' '}
                      • {receiptAnalysis.reasonSummary}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={isVerifyingReceipt}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 shrink-0 cursor-pointer"
                >
                  Cambiar
                </button>
              </div>

              {!isVerifyingReceipt && (
                <button
                  type="button"
                  onClick={() => verifyUploadedReceiptImage(receiptPreviewUrl, receiptMimeType)}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Volver a Comprobar Comprobante Automáticamente</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center border border-sky-500/30">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400 block">
                Pago Mensual del Sistema • {tenant.tenantCode}
              </span>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Abono de {monthInfo.monthName}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: SUMMARY & DIRECT MERCADO PAGO + ALIAS + UPLOAD RECEIPT */}
        {step === 'summary' && (
          <div className="space-y-4">
            {/* Status Banner */}
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 text-xs ${
                evalStatus.isPaidForCurrentMonth
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : evalStatus.isOverdue || evalStatus.isPaused
                  ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              }`}
            >
              {evalStatus.isPaidForCurrentMonth ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : evalStatus.isOverdue || evalStatus.isPaused ? (
                <Flame className="w-5 h-5 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
              ) : (
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <p className="font-black text-sm">{evalStatus.statusLabel}</p>
                <p className="leading-relaxed opacity-90">
                  {evalStatus.isPaidForCurrentMonth
                    ? `Tu suscripción correspondiente a ${monthInfo.monthName} ya figura como PAGADA (${activeTierFullLabel}). ¡Gracias por operar con nosotros!`
                    : evalStatus.status === 'trial_expired'
                    ? 'Tus 30 días de prueba gratuita finalizaron. Elegí una de las 3 tipologías abajo y generá el pago al instante para activar tu cuenta.'
                    : evalStatus.status === 'trial_active'
                    ? `Tu cuenta está en prueba gratis (quedan ${evalStatus.trialDaysRemaining} día(s) hasta el ${evalStatus.trialEndsAt}). Elegí tu plan y podés abonar desde ahora.`
                    : evalStatus.isPaused
                    ? 'Tu cuenta está pausada. Elegí tu plan abajo y aboná con Mercado Pago o subí tu comprobante para reactivar el sistema al instante.'
                    : evalStatus.isOverdue
                    ? `Tu boleta mensual venció el ${dueDateLabel}. Efectuá el pago ahora para evitar que el sistema pause la cuenta.`
                    : `Tu abono de ${monthInfo.monthName} está próximo a vencerse (vence el ${dueDateLabel}). Podés adelantarlo o pagarlo ahora mismo.`}
                </p>
              </div>
            </div>

            {/* 3 TIPOLOGÍAS DE SERVICIO (SECCIÓN 1, SECCIÓN 2, SECCIÓN 3) */}
            {!evalStatus.isPaidForCurrentMonth && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    1. Elegí tu Plan / Tipología de Servicio:
                  </span>
                  <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                    Seleccionado: {activeTierDef.sectionBadge} · {activeTierDef.shortName}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {planDefinitions.map((def) => {
                    const isTierSelected = selectedTier === def.tier;
                    const tierAnnual = calculateAnnualFee(def.monthlyPrice, annualDiscountPct);
                    return (
                      <button
                        key={def.tier}
                        type="button"
                        onClick={() => {
                          if (def.tier === selectedTier) {
                            setPendingSwitchTier(null);
                            return;
                          }
                          setPendingSwitchTier(def.tier);
                          setSwitchTermsAccepted(false);
                        }}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          isTierSelected
                            ? def.tier === 'full'
                              ? 'bg-[#0B1933] text-white border-amber-400 ring-2 ring-amber-400/35 shadow-md'
                              : 'bg-[#0B1933] text-white border-[#009EE3] ring-2 ring-[#009EE3]/30 shadow-md'
                            : pendingSwitchTier === def.tier
                            ? 'bg-sky-50 dark:bg-sky-950/30 text-slate-900 dark:text-white border-sky-500 ring-2 ring-sky-500/30'
                            : 'bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                def.tier === 'full'
                                  ? 'bg-amber-400 text-[#091428]'
                                  : def.tier === 'web'
                                  ? 'bg-sky-500 text-white'
                                  : isTierSelected
                                  ? 'bg-white/15 text-white'
                                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {def.sectionBadge}
                            </span>
                            {isTierSelected && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <div className="text-xs font-black leading-snug">{def.name}</div>
                          <div className="text-lg font-mono font-black tabular-nums">
                            $ {def.monthlyPrice.toLocaleString('es-AR')}
                            <span className={`text-[10px] font-normal ml-1 ${isTierSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                              /mes
                            </span>
                          </div>
                          {annualDiscountPct > 0 && (
                            <div className={`text-[10px] font-mono ${isTierSelected ? 'text-emerald-300' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              Anual (-{annualDiscountPct}%): $ {tierAnnual.toLocaleString('es-AR')}
                            </div>
                          )}
                          <p className={`text-[11px] leading-snug ${isTierSelected ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                            {def.tagline}
                          </p>
                        </div>

                        <div className={`pt-2 border-t space-y-1 text-[10.5px] ${isTierSelected ? 'border-white/15' : 'border-slate-200 dark:border-slate-700'}`}>
                          {def.includedFeatures.map((feat) => (
                            <div key={feat} className="flex items-start gap-1.5">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                              <span className="leading-tight">{feat}</span>
                            </div>
                          ))}
                          {def.excludedFeatures.map((feat) => (
                            <div
                              key={feat}
                              className={`flex items-start gap-1.5 ${
                                isTierSelected ? 'text-slate-400' : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              <X className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                              <span className="leading-tight">{feat}</span>
                            </div>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Confirmación obligatoria de Términos y Condiciones al cambiar a otro Plan */}
                {pendingSwitchTier && pendingSwitchTier !== selectedTier && (() => {
                  const targetDef = getPlanDefinitionByTier(pendingSwitchTier, billingConfig);
                  const impact = getPlanTransitionImpactSummary(selectedTier, pendingSwitchTier);
                  return (
                    <div className="mt-2 p-4 rounded-2xl border-2 border-[#0B1933] dark:border-sky-400/50 bg-slate-50 dark:bg-slate-800/80 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                impact.direction === 'downgrade'
                                  ? 'bg-amber-200 text-amber-950'
                                  : 'bg-emerald-200 text-emerald-950'
                              }`}
                            >
                              {impact.badgeLabel}
                            </span>
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {impact.headline}
                            </span>
                          </div>
                          <ul className="mt-1.5 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                            {impact.bullets.map((b, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingSwitchTier(null);
                            setSwitchTermsAccepted(false);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer shrink-0"
                          aria-label="Cancelar cambio de plan"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <TermsConditionsScrollBox variant="light" maxHeightClass="max-h-40" />

                      <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={switchTermsAccepted}
                          onChange={(e) => setSwitchTermsAccepted(e.target.checked)}
                          className="mt-0.5 rounded border-slate-300 text-[#0B1933]"
                        />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                          Acepto los Términos y Condiciones de Uso y Manejo (v{TERMS_VERSION}) para cambiar a{' '}
                          <strong>
                            {targetDef.sectionBadge} · {targetDef.shortName}
                          </strong>{' '}
                          (${targetDef.monthlyPrice.toLocaleString('es-AR')}/mes).
                        </span>
                      </label>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPendingSwitchTier(null);
                            setSwitchTermsAccepted(false);
                          }}
                          className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={!switchTermsAccepted}
                          onClick={() => {
                            const next = pendingSwitchTier;
                            setSelectedTier(next);
                            setGeneratedPayOrder(null);
                            onSelectPlanTier?.(next, {
                              acceptedTermsAt: new Date().toISOString(),
                              termsVersion: TERMS_VERSION,
                            });
                            setPendingSwitchTier(null);
                            setSwitchTermsAccepted(false);
                          }}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Aceptar Términos y Cambiar a {targetDef.sectionBadge}</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Segmented Modalidad Selector: 1 Mes (Mes a Mes) vs Todo el Año (12 Meses) */}
            {!evalStatus.isPaidForCurrentMonth && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    2. Elegí la frecuencia de pago para {activeTierDef.sectionBadge}:
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlan('monthly');
                      setGeneratedPayOrder(null);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedPlan === 'monthly'
                        ? 'bg-[#0B1933] text-white border-[#009EE3] shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <div className="text-xs font-black">1 Mes (Mes a Mes)</div>
                    <div className="text-base font-mono font-black mt-0.5 tabular-nums">
                      $ {monthlyFee.toLocaleString('es-AR')}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${selectedPlan === 'monthly' ? 'text-sky-300' : 'text-slate-500'}`}>
                      Cubre {monthInfo.monthName}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlan('annual');
                      setGeneratedPayOrder(null);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedPlan === 'annual'
                        ? 'bg-[#0B1933] text-white border-emerald-500 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-black">Todo el Año (12 Meses)</span>
                      {annualDiscountPct > 0 && (
                        <span className="text-[10px] font-bold text-emerald-400">
                          -{annualDiscountPct}%
                        </span>
                      )}
                    </div>
                    <div className="text-base font-mono font-black mt-0.5 tabular-nums">
                      $ {annualTotal.toLocaleString('es-AR')}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${selectedPlan === 'annual' ? 'text-emerald-300' : 'text-slate-500'}`}>
                      Hasta {annualUntilLabel}
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Amount Box */}
            <div className="bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 tabular-nums">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  {activeTierFullLabel} ·{' '}
                  {selectedPlan === 'annual'
                    ? `Abono Anual 12M (${tenant.name})`
                    : `Abono Mensual (${tenant.name})`}
                </span>
                <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white">
                  $ {amountToPay.toLocaleString('es-AR')}
                </span>
                <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3 h-3" />
                  <span>
                    {selectedPlan === 'annual'
                      ? `Cobertura completa: ${monthInfo.monthName} a ${annualUntilLabel}${
                          annualSavings > 0 ? ` (Ahorrás $ ${annualSavings.toLocaleString('es-AR')})` : ''
                        }`
                      : `Vencimiento: ${dueDateLabel} (del 1 al 5)`}
                  </span>
                </span>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <span className="px-2.5 py-1 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 text-[11px] font-bold border border-sky-200 dark:border-sky-800">
                  {activeTierDef.sectionBadge} · {activeTierDef.shortName}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {selectedPlan === 'annual' ? 'Plan 12 Meses' : 'Mes a Mes'}
                </span>
              </div>
            </div>

            {/* Primary Direct Mercado Pago Button + Generar Link de Pago Compartible */}
            {!evalStatus.isPaidForCurrentMonth && (
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={isProcessing || isVerifyingReceipt}
                  onClick={handleStartMercadoPagoCheckout}
                  className="w-full py-3.5 px-5 rounded-2xl bg-[#009EE3] hover:bg-[#008AD0] text-white font-black text-sm shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-60 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Abriendo Mercado Pago...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      <span>
                        Pagar {selectedPlan === 'annual' ? 'Año Completo' : '1 Mes'} ($ {amountToPay.toLocaleString('es-AR')}) por Mercado Pago
                      </span>
                      <ExternalLink className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isGeneratingShareLink || isProcessing || isVerifyingReceipt}
                  onClick={handleGenerateShareablePayLink}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isGeneratingShareLink ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Generando link de pago...</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5 text-sky-400" />
                      <span>
                        Generar Link de Pago ({selectedPlan === 'annual' ? 'Plan Anual' : '1 Mes'}) para Pagar o Enviar por WhatsApp
                      </span>
                    </>
                  )}
                </button>

                {generatedPayOrder && (
                  <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/35 border border-sky-300 dark:border-sky-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span>
                          Link de Pago Generado ({generatedPayOrder.order.planType === 'annual' ? '12 Meses' : '1 Mes'} · $ {generatedPayOrder.order.amount.toLocaleString('es-AR')})
                        </span>
                      </span>
                    </div>
                    <div className="bg-white dark:bg-slate-950 px-2.5 py-2 rounded-xl border border-sky-200 dark:border-slate-700 font-mono text-[11px] text-slate-700 dark:text-sky-300 break-all select-all">
                      {generatedPayOrder.payUrl}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedPayOrder.payUrl);
                          setCopiedPayLink(true);
                          setTimeout(() => setCopiedPayLink(false), 2000);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedPayLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedPayLink ? '¡Link Copiado!' : 'Copiar Link'}</span>
                      </button>

                      <a
                        href={generatedPayOrder.payUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Abrir Pago</span>
                      </a>

                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(
                          `Hola! Te comparto el enlace de pago de ${tenant.name} (${tenant.tenantCode}) para activar el sistema:\n• Tipología: ${generatedPayOrder.order.planTierLabel || activeTierFullLabel}\n• Modalidad: ${generatedPayOrder.order.planType === 'annual' ? 'Anual 12 Meses' : `Mensual (${generatedPayOrder.order.monthName})`}\n• Importe: $ ${generatedPayOrder.order.amount.toLocaleString('es-AR')}\n• Link directo de pago: ${generatedPayOrder.payUrl}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Enviar por WhatsApp</span>
                      </a>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>Te deriva directo a Mercado Pago o podés transferir al CVU/Alias del Gestor General y subir el comprobante abajo.</span>
                </p>
              </div>
            )}

            {/* Copiar Alias + Subir Imagen del Comprobante (Siempre Visible) */}
            {renderAliasAndReceiptUploader()}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: AFTER REDIRECTING TO MERCADO PAGO */}
        {step === 'mp_checkout_waiting' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-300 dark:border-sky-800 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-sky-900 dark:text-sky-200 text-sm flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#009EE3]" />
                  <span>Mercado Pago Abierto</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-sky-200 dark:bg-sky-900 text-sky-900 dark:text-sky-200 font-mono font-bold text-[10px]">
                  $ {amountToPay.toLocaleString('es-AR')}
                </span>
              </div>

              <p className="text-sky-800 dark:text-sky-300 leading-relaxed">
                {checkoutInfo?.mode === 'mercadopago_api' || checkoutInfo?.mode === 'checkout_link'
                  ? 'Se abrió el enlace oficial de Mercado Pago en una pestaña nueva. Cuando finalices el pago, podés verificarlo automáticamente o subir la imagen del comprobante abajo.'
                  : `Transferí $ ${amountToPay.toLocaleString('es-AR')} en Mercado Pago al alias "${billingConfig.alias}" (${billingConfig.accountHolderName}) y subí abajo la imagen del comprobante para validarlo al instante.`}
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openMercadoPagoAppLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#009EE3] hover:bg-[#008AD0] text-white font-bold text-xs shadow-xs cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Volver a Abrir Mercado Pago</span>
                </button>
              </div>
            </div>

            {/* Alias + Subir Imagen del Comprobante */}
            {renderAliasAndReceiptUploader()}

            {/* Opción secundaria por ID de operación MP si tiene API */}
            <div className="pt-1 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                ¿Tenés el número de operación de Mercado Pago? (opcional):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={operationNumber}
                  onChange={(e) => setOperationNumber(e.target.value)}
                  placeholder="Ej. 8492019482"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                />
                {checkoutInfo?.mode === 'mercadopago_api' && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleVerifyAndReadPayment('mercadopago', false)}
                    className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                    <span>Leer API</span>
                  </button>
                )}
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep('summary')}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={isProcessing || !operationNumber.trim()}
                onClick={() => handleVerifyAndReadPayment('mercadopago', true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>Validar con N° de Operación</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS */}
        {step === 'success' && (
          <div className="text-center py-5 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border-2 border-emerald-400">
              <ShieldCheck className="w-9 h-9" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-lg font-black text-slate-900 dark:text-white">
                ¡Pago Comprobado y Acreditado!
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                {verifiedSuccessMessage ||
                  `El sistema registró correctamente tu pago de $ ${amountToPay.toLocaleString(
                    'es-AR'
                  )} correspondiente a ${monthInfo.monthName}. Tu cuenta ya figura AL DÍA y habilitada al 100%.`}
              </p>
              {receiptAnalysis && (
                <div className="mt-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-200 text-left space-y-1">
                  <div className="font-bold">Detalle verificado del comprobante:</div>
                  <div>• Entidad / Medio: {receiptAnalysis.platform || 'Mercado Pago / Transferencia'}</div>
                  <div>• Importe leído: $ {Number(receiptAnalysis.detectedAmount || amountToPay).toLocaleString('es-AR')}</div>
                  {receiptAnalysis.operationId && <div>• Operación N°: {receiptAnalysis.operationId}</div>}
                  {receiptAnalysis.paymentDate && <div>• Fecha: {receiptAnalysis.paymentDate}</div>}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md cursor-pointer"
            >
              Continuar Operando
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
