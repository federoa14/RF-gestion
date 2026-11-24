import React, { useState, useEffect, useRef } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Wallet,
  Upload,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  FileCheck2,
  Lock,
  Calendar,
} from 'lucide-react';
import { TenantSubscriptionPayOrder } from '../types';
import {
  createMercadoPagoPreferenceViaEdgeFunction,
  getTenantSubPayOrderFromCloud,
  verifyAndApproveTenantSubPayOrder,
} from '../utils/supabaseServices';

interface PublicTenantSubPayViewProps {
  token: string;
  onExitToApp?: () => void;
}

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

export const PublicTenantSubPayView: React.FC<PublicTenantSubPayViewProps> = ({
  token,
  onExitToApp,
}) => {
  const [order, setOrder] = useState<TenantSubscriptionPayOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<'alias' | 'cvu' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVerifyingReceipt, setIsVerifyingReceipt] = useState(false);
  const [operationIdInput, setOperationIdInput] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    const loadOrderAndCheckReturn = async () => {
      try {
        setLoading(true);
        let currentOrder = await getTenantSubPayOrderFromCloud(token);
        if (!currentOrder) {
          if (active) {
            setErrorMsg('No se encontró el enlace de pago de suscripción solicitado.');
            setLoading(false);
          }
          return;
        }

        const params = new URLSearchParams(window.location.search);
        const mpStatus =
          params.get('mp_status') || params.get('collection_status') || params.get('status');
        const mpPaymentId =
          params.get('payment_id') || params.get('collection_id') || undefined;

        if (currentOrder.status !== 'approved' && mpStatus === 'approved') {
          try {
            const vData = await verifyAndApproveTenantSubPayOrder({
              token,
              paymentId: mpPaymentId,
              collectionStatus: 'approved',
              paymentMethod: 'mercadopago',
            });
            if (vData.approved && vData.order) {
              currentOrder = vData.order;
              if (active) {
                setSuccessNote(
                  '¡Pago acreditado en Mercado Pago! Tu cuenta pasó automáticamente a estado Activo.'
                );
              }
            }
          } catch {
            // mantener orden cargada
          }
        }

        if (active) {
          setOrder(currentOrder);
          setLoading(false);
        }
      } catch (err: any) {
        if (active) {
          setErrorMsg(err.message || 'Error al cargar la orden de pago.');
          setLoading(false);
        }
      }
    };

    void loadOrderAndCheckReturn();
    return () => {
      active = false;
    };
  }, [token]);

  // Poll cada 5s por si el pago se acredita en otra pestaña o vía webhook
  useEffect(() => {
    if (!order || order.status === 'approved') return;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled) return;
      try {
        const refreshed = await getTenantSubPayOrderFromCloud(order.token);
        if (!cancelled && refreshed && refreshed.status === 'approved') {
          setOrder(refreshed);
          setSuccessNote(
            refreshed.verificationSummary ||
              '¡Pago confirmado! Tu cuenta pasó automáticamente a estado Activo en Funcionamiento.'
          );
        }
      } catch {
        // silent poll
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [order?.token, order?.status]);

  const handleCopy = (value: string, field: 'alias' | 'cvu') => {
    navigator.clipboard.writeText(value);
    setCopiedKey(field);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleOpenMercadoPagoCheckout = async () => {
    if (!order) return;
    if (order.mpInitPoint) {
      window.open(order.mpInitPoint, '_blank', 'noopener,noreferrer');
      return;
    }

    setIsProcessing(true);
    try {
      const pref = await createMercadoPagoPreferenceViaEdgeFunction({
        scope: 'tenant_subscription',
        tenantId: order.tenantId,
        tenantName: order.tenantName,
        monthKey: order.monthKey,
        planType: order.planType,
        amount: order.amount,
        returnUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      });
      if (pref.ok && pref.initPoint) {
        setOrder((prev) =>
          prev
            ? { ...prev, mpInitPoint: pref.initPoint, mpPreferenceId: pref.preferenceId }
            : prev
        );
        window.open(pref.initPoint, '_blank', 'noopener,noreferrer');
        return;
      }
    } catch {
      // fallback al enlace fijo
    } finally {
      setIsProcessing(false);
    }

    const url = order.mpCheckoutLink || 'https://www.mercadopago.com.ar/';
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleVerifyOperation = async (confirmInstant: boolean) => {
    if (!order) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const data = await verifyAndApproveTenantSubPayOrder({
        token: order.token,
        paymentId: operationIdInput.trim() || undefined,
        collectionStatus: confirmInstant ? 'approved' : undefined,
        paymentMethod: confirmInstant && !order.mpInitPoint ? 'transferencia' : 'mercadopago',
        confirmInstant,
      });

      if (data.approved && data.order) {
        setOrder(data.order);
        setSuccessNote(
          '¡Pago acreditado! Tu suscripción quedó al día y la cuenta ya figura en Funcionamiento.'
        );
      } else {
        setErrorMsg(
          data.message ||
            'Aún no recibimos confirmación automática. Podés adjuntar la captura del comprobante abajo.'
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al validar el pago.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReceiptSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !order) return;
    setIsVerifyingReceipt(true);
    setErrorMsg(null);
    try {
      const { dataUrl } = await compressReceiptImage(file);
      setReceiptPreview(dataUrl);
      const opId = operationIdInput.trim() || `COMP-${Date.now().toString().slice(-7)}`;
      const summaryText = `Comprobante ${order.planType === 'annual' ? 'Plan Anual 12M' : order.monthName} • Op #${opId} • ${order.currencySymbol || '$'} ${order.amount.toLocaleString('es-AR')}`;

      const res = await verifyAndApproveTenantSubPayOrder({
        token: order.token,
        paymentId: opId,
        paymentMethod: 'transferencia',
        confirmInstant: true,
        receiptImageUrl: dataUrl,
        verificationSummary: summaryText,
        verifiedViaReceipt: true,
      });

      if (res.approved && res.order) {
        setOrder(res.order);
        setSuccessNote('¡Comprobante verificado y guardado! Tu cuenta ya está activa y al día.');
      } else {
        setErrorMsg(res.message || 'No se pudo registrar el comprobante. Intentá nuevamente.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error procesando la imagen del comprobante.');
    } finally {
      setIsVerifyingReceipt(false);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-[#071021] text-[#E2E8F0] flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl bg-[#0B1933] border border-[#B6C2D2]/25 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#091428] px-6 py-5 border-b border-[#B6C2D2]/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/assets/aistudio/file_0000000080a8820e83e95938baa4fbe8_5866e787.png"
              alt="Logo"
              className="w-10 h-10 rounded-xl object-cover border border-[#B6C2D2]/30 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-sky-400">
                Suscripción · Pago del Sistema
              </p>
              <h1 className="text-base sm:text-lg font-bold text-white truncate">
                {order ? `${order.tenantName} (${order.tenantCode})` : 'Activación de Cuenta'}
              </h1>
            </div>
          </div>

          {onExitToApp && (
            <button
              type="button"
              onClick={onExitToApp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#13264A] hover:bg-[#1B3566] text-xs font-semibold text-[#E2E8F0] border border-[#B6C2D2]/25 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Ir al Sistema</span>
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="w-7 h-7 animate-spin text-sky-400 mx-auto" />
              <p className="text-sm text-[#94A3B8]">Cargando orden de pago...</p>
            </div>
          ) : !order ? (
            <div className="py-10 text-center space-y-3">
              <AlertTriangle className="w-9 h-9 text-rose-400 mx-auto" />
              <h2 className="text-base font-bold text-white">Orden de pago no encontrada</h2>
              <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
                {errorMsg || 'Este enlace de suscripción expiró o no existe.'}
              </p>
            </div>
          ) : order.status === 'approved' ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-950/70 text-emerald-400 border-2 border-emerald-500 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-9 h-9" />
              </div>
              <div className="space-y-1.5">
                <span className="inline-block px-3 py-1 rounded-md text-xs font-mono font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-500/40">
                  PAGO ACREDITADO · {order.tenantCode}
                </span>
                <h2 className="text-xl font-black text-white">¡Suscripción Activa!</h2>
                <p className="text-xs text-[#CBD5E1] max-w-md mx-auto leading-relaxed">
                  {successNote ||
                    `El pago de ${order.currencySymbol || '$'} ${order.amount.toLocaleString('es-AR')} para ${order.tenantName} quedó acreditado. Ya podés operar normalmente.`}
                </p>
              </div>
              {onExitToApp && (
                <button
                  type="button"
                  onClick={onExitToApp}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black cursor-pointer"
                >
                  Ingresar al Panel de Mi Empresa
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Resumen del Plan & Monto */}
              <div className="bg-[#081224] border border-[#B6C2D2]/25 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  {order.planTierLabel && (
                    <span className="inline-block mb-1.5 px-2.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-400/35 text-[10px] font-black uppercase tracking-wider">
                      {order.planTierLabel}
                    </span>
                  )}
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      {order.planType === 'annual'
                        ? `Plan Anual (12 Meses) · Desde ${order.monthName}`
                        : `Abono Mensual · ${order.monthName}`}
                    </span>
                  </span>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-1 tabular-nums">
                    {order.currencySymbol || '$'} {order.amount.toLocaleString('es-AR')}
                  </div>
                  {order.notes && (
                    <p className="text-[11px] text-sky-300 mt-1">{order.notes}</p>
                  )}
                </div>

                <span className="px-3 py-1 rounded-lg bg-amber-950/70 text-amber-300 border border-amber-500/40 text-xs font-bold">
                  Pendiente de Pago
                </span>
              </div>

              {/* Botón Directo Mercado Pago */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  disabled={isProcessing || isVerifyingReceipt}
                  onClick={handleOpenMercadoPagoCheckout}
                  className="w-full py-3.5 px-5 rounded-2xl bg-[#009EE3] hover:bg-[#008AD0] text-white font-black text-sm shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Conectando con Mercado Pago...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      <span>
                        Pagar {order.currencySymbol || '$'} {order.amount.toLocaleString('es-AR')} con Mercado Pago
                      </span>
                      <ExternalLink className="w-4 h-4" />
                    </>
                  )}
                </button>
                <p className="text-[11px] text-center text-[#94A3B8] flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>Podés abonar con Mercado Pago o transferir al CVU/Alias y subir tu comprobante abajo.</span>
                </p>
              </div>

              {/* Datos de Transferencia */}
              {(order.alias || order.cvu) && (
                <div className="bg-[#091428] border border-[#B6C2D2]/20 rounded-2xl p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Transferencia al Titular del Sistema</span>
                    </span>
                    <span className="text-[11px] text-[#94A3B8]">{order.bankName || 'Mercado Pago'}</span>
                  </div>

                  {order.cvu && (
                    <div className="flex items-center justify-between bg-[#060E1D] px-3 py-2 rounded-xl border border-emerald-500/35 gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-emerald-400 font-bold block">CVU:</span>
                        <span className="font-mono font-bold text-sm text-white select-all break-all">
                          {order.cvu}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.cvu!, 'cvu')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedKey === 'cvu' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'cvu' ? '¡Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  )}

                  {order.alias && (
                    <div className="flex items-center justify-between bg-[#060E1D] px-3 py-2 rounded-xl border border-[#B6C2D2]/20 gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-[#94A3B8] block">Alias:</span>
                        <span className="font-mono font-bold text-sm text-sky-300 select-all break-all">
                          {order.alias}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.alias!, 'alias')}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedKey === 'alias' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'alias' ? '¡Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  )}

                  {order.holderName && (
                    <div className="text-[11px] text-[#CBD5E1]">
                      Titular: <strong className="text-white">{order.holderName}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Subir Comprobante o Validar N° Operación */}
              <div className="bg-[#081224] border border-dashed border-sky-500/40 rounded-2xl p-4 space-y-3 text-xs">
                <div>
                  <h3 className="font-bold text-white flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4 text-sky-400" />
                    <span>Adjuntar Comprobante para Activar al Instante</span>
                  </h3>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">
                    Subí la captura del comprobante y tu cuenta quedará activa y al día de inmediato.
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleReceiptSelected}
                  className="hidden"
                />

                <button
                  type="button"
                  disabled={isVerifyingReceipt}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#13264A] hover:bg-[#1B3566] border border-[#B6C2D2]/30 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-sky-400" />
                  <span>
                    {isVerifyingReceipt
                      ? 'Verificando y activando cuenta...'
                      : receiptPreview
                      ? 'Cambiar imagen del comprobante'
                      : 'Seleccionar Captura del Comprobante'}
                  </span>
                </button>

                <div className="pt-2 border-t border-[#B6C2D2]/15 space-y-2">
                  <label className="block text-[11px] font-semibold text-[#94A3B8]">
                    O ingresá el N° de Operación de Mercado Pago / Transferencia:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={operationIdInput}
                      onChange={(e) => setOperationIdInput(e.target.value)}
                      placeholder="Ej. 8492019482"
                      className="flex-1 px-3 py-2 rounded-xl bg-[#060E1D] border border-[#B6C2D2]/25 text-xs font-mono text-white"
                    />
                    <button
                      type="button"
                      disabled={isProcessing || !operationIdInput.trim()}
                      onClick={() => handleVerifyOperation(true)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs cursor-pointer flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirmar</span>
                    </button>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
