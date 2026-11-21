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
  Landmark,
} from 'lucide-react';
import { ClientPaymentOrder } from '../types';
import { formatCurrency } from '../utils/alerts';
import {
  createMercadoPagoPreferenceViaEdgeFunction,
  getClientPaymentOrderFromCloud,
  verifyClientPaymentOrderInSupabase,
  verifyClientReceiptImageInSupabase,
} from '../utils/supabaseServices';

interface PublicClientPayViewProps {
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

export const PublicClientPayView: React.FC<PublicClientPayViewProps> = ({
  token,
  onExitToApp,
}) => {
  const [order, setOrder] = useState<ClientPaymentOrder | null>(null);
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
        let currentOrder: ClientPaymentOrder | null = await getClientPaymentOrderFromCloud(token);

        if (!currentOrder) {
          if (active) {
            setErrorMsg('No se encontró el enlace de pago solicitado.');
            setLoading(false);
          }
          return;
        }

        // Verificar si regresó automáticamente desde Mercado Pago Checkout Pro con pago aprobado
        const params = new URLSearchParams(window.location.search);
        const mpStatus =
          params.get('mp_status') || params.get('collection_status') || params.get('status');
        const mpPaymentId =
          params.get('payment_id') || params.get('collection_id') || undefined;

        if (currentOrder.status !== 'approved' && mpStatus === 'approved') {
          try {
            const vData = await verifyClientPaymentOrderInSupabase({
              token,
              paymentId: mpPaymentId,
              collectionStatus: 'approved',
              paymentMethod: 'mercadopago',
            });
            if (vData.approved && vData.order) {
              currentOrder = vData.order;
              if (active) {
                setSuccessNote(
                  'Tu pago fue acreditado automáticamente y guardado en Supabase. Tu cuenta ya figura PAGADA.'
                );
              }
            }
          } catch {
            // Keep fetched order
          }
        }

        if (active) {
          setOrder(currentOrder);
          setLoading(false);
        }
      } catch (err: any) {
        if (active) {
          setErrorMsg(err.message || 'Error al cargar los datos del pago.');
          setLoading(false);
        }
      }
    };

    loadOrderAndCheckReturn();
    return () => {
      active = false;
    };
  }, [token]);

  const handleCopy = (value: string, field: 'alias' | 'cvu') => {
    navigator.clipboard.writeText(value);
    setCopiedKey(field);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Poll automático cada 5s por si el Webhook oficial de Mercado Pago acredita el pago en Supabase
  useEffect(() => {
    if (!order || order.status === 'approved') return;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled) return;
      try {
        const refreshed = await getClientPaymentOrderFromCloud(order.token);
        if (!cancelled && refreshed && refreshed.status === 'approved') {
          setOrder(refreshed);
          setSuccessNote(
            refreshed.verificationSummary ||
              'Tu pago fue confirmado por Mercado Pago y guardado en Supabase. Tu cuenta ya figura PAGADA.'
          );
        }
      } catch {
        // silent
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [order?.token, order?.status]);

  const handleOpenMercadoPagoCheckout = async () => {
    if (!order) return;
    if (order.mpInitPoint) {
      window.open(order.mpInitPoint, '_blank', 'noopener,noreferrer');
      return;
    }

    setIsProcessing(true);
    try {
      const pref = await createMercadoPagoPreferenceViaEdgeFunction({
        scope: 'client_order',
        orderToken: order.token,
        returnUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
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
      // Fallback al link fijo configurado
    } finally {
      setIsProcessing(false);
    }

    const url = order.mpCheckoutLink || 'https://www.mercadopago.com.ar/';
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleVerifyByOperationOrDirect = async (confirmTransfer: boolean) => {
    if (!order) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const data = await verifyClientPaymentOrderInSupabase({
        token: order.token,
        paymentId: operationIdInput.trim() || undefined,
        collectionStatus: confirmTransfer ? 'approved' : undefined,
        paymentMethod: confirmTransfer && !order.mpInitPoint ? 'transferencia' : 'mercadopago',
        confirmInstant: confirmTransfer,
      });

      if (data.approved && data.order) {
        setOrder(data.order);
        setSuccessNote(
          'Pago acreditado y guardado en Supabase. El comercio recibió la confirmación automática y tu cuenta figura PAGADA.'
        );
      } else {
        setErrorMsg(
          data.message ||
            'Aún no recibimos confirmación automática de pago. Podés adjuntar la captura del comprobante abajo para acreditarlo al instante.'
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al validar la operación.');
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
      const { dataUrl, mimeType } = await compressReceiptImage(file);
      setReceiptPreview(dataUrl);

      const data = await verifyClientReceiptImageInSupabase({
        token: order.token,
        imageBase64: dataUrl,
        mimeType,
      });

      if (data.approved && data.order) {
        setOrder(data.order);
        setSuccessNote(
          data.message ||
            'Comprobante registrado en Supabase. Tu saldo quedó cancelado automáticamente.'
        );
      } else {
        setErrorMsg(
          data.message ||
            'No pudimos registrar el comprobante. Intentá nuevamente con una imagen válida.'
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo procesar el comprobante.');
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
                Portal de Pago Seguro
              </p>
              <h1 className="text-base sm:text-lg font-bold text-white truncate">
                {order ? order.distributorName : 'Pago de Cuenta Corriente'}
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
              <span>Ir al Panel</span>
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="w-7 h-7 animate-spin text-sky-400 mx-auto" />
              <p className="text-sm text-[#94A3B8]">Cargando detalle de tu cuenta...</p>
            </div>
          ) : !order ? (
            <div className="py-10 text-center space-y-3">
              <AlertTriangle className="w-9 h-9 text-rose-400 mx-auto" />
              <h2 className="text-base font-bold text-white">Enlace no disponible</h2>
              <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
                {errorMsg || 'Este enlace de pago expiró o no existe.'}
              </p>
            </div>
          ) : order.status === 'approved' ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-950/70 text-emerald-400 flex items-center justify-center mx-auto border-2 border-emerald-500/60">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-mono font-bold text-emerald-400">
                  PAGO ACREDITADO AUTOMÁTICAMENTE
                </span>
                <h2 className="text-xl font-black text-white">
                  ¡Muchas gracias, {order.clientName}!
                </h2>
                <p className="text-xs text-[#CBD5E1] max-w-md mx-auto leading-relaxed">
                  {successNote ||
                    `Tu pago por ${formatCurrency(order.amount, order.currencySymbol)} ya fue leído por el sistema de ${order.distributorName}. Las boletas asociadas quedaron marcadas como PAGADAS al instante.`}
                </p>
              </div>

              <div className="bg-[#081224] border border-[#B6C2D2]/20 rounded-xl p-4 text-left text-xs space-y-1.5 tabular-nums">
                <div className="flex justify-between">
                  <span className="text-[#94A3B8]">Comprobantes cancelados</span>
                  <span className="font-mono font-bold text-white">
                    {order.boletaNumbers.length > 0
                      ? order.boletaNumbers.map((n) => `#${n}`).join(', ')
                      : 'Saldo total'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8]">Importe abonado</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatCurrency(order.amount, order.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8]">Medio / Operación</span>
                  <span className="font-mono text-[#E2E8F0]">
                    {order.paymentMethod === 'mercadopago' ? 'Mercado Pago' : 'Transferencia'}
                    {order.mpPaymentId ? ` · #${order.mpPaymentId}` : ''}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Account summary */}
              <div className="bg-[#081224] border border-[#B6C2D2]/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 tabular-nums">
                <div className="space-y-1">
                  <span className="text-xs text-[#94A3B8] block">Cliente</span>
                  <div className="text-base font-bold text-white">{order.clientName}</div>
                  <div className="text-xs text-[#CBD5E1]">
                    Comprobante(s):{' '}
                    <span className="font-mono font-semibold text-white">
                      {order.boletaNumbers.length > 0
                        ? order.boletaNumbers.map((n) => `#${n}`).join(', ')
                        : 'Saldo pendiente'}
                    </span>
                  </div>
                </div>
                <div className="sm:text-right">
                  <span className="text-xs text-[#94A3B8] block">Total a abonar</span>
                  <div className="text-2xl sm:text-3xl font-mono font-black text-white">
                    {formatCurrency(order.amount, order.currencySymbol)}
                  </div>
                </div>
              </div>

              {/* Payment Option 1: Mercado Pago (Dinero en cuenta / Tarjeta Crédito / Débito) */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleOpenMercadoPagoCheckout}
                  className="w-full py-3.5 px-5 rounded-xl bg-[#009EE3] hover:bg-[#008AD0] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
                >
                  <CreditCard className="w-5 h-5" />
                  <span>Pagar con Mercado Pago / Tarjeta Crédito o Débito</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-[#94A3B8] text-center flex items-center justify-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-sky-400" />
                  <span>
                    Acepta dinero en cuenta de Mercado Pago, tarjeta de crédito o débito con acreditación inmediata.
                  </span>
                </p>
              </div>

              {/* Payment Option 2: Direct Alias / CVU copy */}
              {(order.alias || order.cvu) && (
                <div className="bg-[#081224] border border-[#B6C2D2]/20 rounded-xl p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sky-300 flex items-center gap-1.5">
                      <Wallet className="w-4 h-4" />
                      <span>Transferencia por Alias / CVU ({order.bankName || 'Mercado Pago'})</span>
                    </span>
                    {order.holderName && (
                      <span className="text-[#CBD5E1]">Titular: {order.holderName}</span>
                    )}
                  </div>

                  {order.alias && (
                    <div className="flex items-center justify-between gap-2 bg-[#071021] border border-[#B6C2D2]/20 rounded-lg px-3 py-2.5">
                      <div className="min-w-0">
                        <span className="text-[10px] text-[#94A3B8] block">Alias para transferir</span>
                        <span className="font-mono font-bold text-sm text-white select-all break-all">
                          {order.alias}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.alias!, 'alias')}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        {copiedKey === 'alias' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedKey === 'alias' ? 'Copiado' : 'Copiar Alias'}</span>
                      </button>
                    </div>
                  )}

                  {order.cvu && (
                    <div className="flex items-center justify-between gap-2 bg-[#071021] border border-[#B6C2D2]/20 rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-[#94A3B8] block flex items-center gap-1">
                          <Landmark className="w-3 h-3" />
                          <span>CVU / CBU</span>
                        </span>
                        <span className="font-mono text-xs text-[#E2E8F0] select-all break-all">
                          {order.cvu}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.cvu!, 'cvu')}
                        className="px-2.5 py-1 rounded-lg bg-[#13264A] hover:bg-[#1B3566] text-[#E2E8F0] text-xs font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedKey === 'cvu' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'cvu' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Automatic Instant Receipt Reader OR MP Operation check */}
              <div className="bg-[#081224] border border-dashed border-sky-500/40 rounded-xl p-4 space-y-3">
                <div>
                  <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4 text-sky-400" />
                    <span>Acreditación automática del comprobante</span>
                  </h2>
                  <p className="text-[11px] text-[#94A3B8] mt-1 leading-relaxed">
                    Si ya transferiste o abonaste con Mercado Pago, subí la captura de tu comprobante y nuestro lector lo acredita de forma inmediata sin esperar confirmación manual.
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
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {isVerifyingReceipt ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verificando comprobante automáticamente...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Subir Captura del Comprobante y Acreditar Cuenta</span>
                    </>
                  )}
                </button>

                {receiptPreview && (
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-[#071021] border border-[#B6C2D2]/20">
                    <img
                      src={receiptPreview}
                      alt="Comprobante cargado"
                      className="w-12 h-12 rounded object-cover shrink-0"
                    />
                    <span className="text-[11px] text-[#CBD5E1]">
                      {isVerifyingReceipt
                        ? 'Leyendo importe, estado y destinatario...'
                        : 'Imagen procesada.'}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-[#B6C2D2]/15 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={operationIdInput}
                    onChange={(e) => setOperationIdInput(e.target.value)}
                    placeholder="N° de operación MP / Transferencia (opcional)"
                    className="flex-1 px-3 py-2 rounded-lg bg-[#071021] border border-[#B6C2D2]/25 text-xs font-mono text-white placeholder-[#64748B]"
                  />
                  <button
                    type="button"
                    disabled={isProcessing || !operationIdInput.trim()}
                    onClick={() => handleVerifyByOperationOrDirect(true)}
                    className="px-3.5 py-2 rounded-lg bg-[#162E59] hover:bg-[#1E3F7A] disabled:opacity-40 text-white text-xs font-bold cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirmar Operación</span>
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
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
