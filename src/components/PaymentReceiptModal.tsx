import React, { useState, useEffect } from 'react';
import {
  X,
  MessageCircle,
  Printer,
  Copy,
  Check,
  Phone,
  Receipt,
  CheckCircle2,
  UserPlus,
  Download,
  Image as ImageIcon,
} from 'lucide-react';
import { Client, DistributorConfig } from '../types';
import { formatCurrency, formatDateEs } from '../utils/alerts';
import {
  createWhatsAppUrl,
  generatePaymentReceiptWhatsAppMessage,
  ReceiptWhatsAppPayload,
} from '../utils/whatsapp';
import {
  copyVisualReceiptImage,
  downloadVisualReceiptPng,
  renderVisualReceiptToDataUrl,
} from '../utils/visualReceipt';
import { BrandMark } from './BrandMark';

export interface ReceiptModalData extends ReceiptWhatsAppPayload {
  clientId?: string;
  clientAddress?: string;
  salespersonName?: string;
  initialPhone?: string;
}

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: ReceiptModalData | null;
  client?: Client;
  config: DistributorConfig;
  onSaveClientPhone?: (clientId: string, phone: string) => void;
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  isOpen,
  onClose,
  receipt,
  client,
  config,
  onSaveClientPhone,
}) => {
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [phoneSavedNotice, setPhoneSavedNotice] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedImg, setCopiedImg] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [visualPreviewUrl, setVisualPreviewUrl] = useState<string>('');
  const [viewMode, setViewMode] = useState<'detalle' | 'visual'>('visual');

  useEffect(() => {
    if (isOpen && receipt) {
      setPhoneInput(receipt.initialPhone || client?.phone || '');
      setPhoneSavedNotice(false);
      setCopied(false);
      setCopiedImg(false);
      setViewMode(receipt.items && receipt.items.length > 0 ? 'visual' : 'detalle');

      let cancelled = false;
      renderVisualReceiptToDataUrl(receipt, config)
        .then((url) => {
          if (!cancelled) setVisualPreviewUrl(url);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [isOpen, receipt, client?.phone, config]);

  if (!isOpen || !receipt) return null;

  const isCompleted = receipt.isFullSettlement || receipt.remainingBalance <= 0;
  const hasSavedPhoneInClient = Boolean(client?.phone && client.phone.trim());
  const canOfferSavePhone =
    Boolean(onSaveClientPhone) &&
    Boolean(client?.id) &&
    Boolean(phoneInput.trim()) &&
    phoneInput.trim() !== (client?.phone || '').trim();

  const whatsappMessage = generatePaymentReceiptWhatsAppMessage(receipt, config);

  const methodLabels: Record<string, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia / MP',
    cheque: 'Cheque',
    link_pago: 'Link de Pago / MP',
    fiado: 'Cuenta Corriente / Fiado',
    acordar: 'A coordinar por WhatsApp',
    otro: 'Otro medio',
  };
  const methodLabel =
    receipt.paymentMethodLabel || methodLabels[receipt.paymentMethod] || receipt.paymentMethod;

  const handleSendWhatsApp = () => {
    if (canOfferSavePhone && client?.id && onSaveClientPhone && !phoneSavedNotice) {
      onSaveClientPhone(client.id, phoneInput.trim());
      setPhoneSavedNotice(true);
    }
    const url = createWhatsAppUrl(phoneInput.trim(), whatsappMessage);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSavePhoneOnly = () => {
    if (client?.id && onSaveClientPhone && phoneInput.trim()) {
      onSaveClientPhone(client.id, phoneInput.trim());
      setPhoneSavedNotice(true);
    }
  };

  const handleCopyText = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(whatsappMessage).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadPng = async () => {
    setDownloadingPng(true);
    try {
      await downloadVisualReceiptPng(receipt, config);
    } finally {
      setDownloadingPng(false);
    }
  };

  const handleCopyImage = async () => {
    const ok = await copyVisualReceiptImage(receipt, config);
    if (ok) {
      setCopiedImg(true);
      setTimeout(() => setCopiedImg(false), 2500);
    } else {
      await handleDownloadPng();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050C18]/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden my-6">
        {/* Top Navy Header */}
        <div className="bg-[#091428] text-white px-5 py-4 border-b border-[#B6C2D2]/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <BrandMark
              logoUrl={config.distributorLogoUrl}
              icon={config.distributorIcon}
              name={config.distributorName}
              size="sm"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-[#CBD5E1]">
                  {receipt.receiptNumber}
                </span>
                <span className="text-[11px] font-semibold text-emerald-400">
                  · Comprobante emitido
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white truncate">
                {receipt.saleModeLabel ||
                  (isCompleted ? 'Comprobante de Cancelación Total' : 'Comprobante de Compra y Cobro')}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1 p-1 rounded-lg bg-[#071021] border border-[#B6C2D2]/20 print:hidden">
              <button
                type="button"
                onClick={() => setViewMode('visual')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                  viewMode === 'visual'
                    ? 'bg-[#E2E8F0] text-[#091428]'
                    : 'text-[#CBD5E1] hover:text-white'
                }`}
              >
                Tarjeta Visual
              </button>
              <button
                type="button"
                onClick={() => setViewMode('detalle')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                  viewMode === 'detalle'
                    ? 'bg-[#E2E8F0] text-[#091428]'
                    : 'text-[#CBD5E1] hover:text-white'
                }`}
              >
                Detalle
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#13264A] transition-colors cursor-pointer"
              aria-label="Cerrar recibo"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Mode Switcher */}
        <div className="flex sm:hidden items-center gap-1 px-5 pt-3 print:hidden">
          <button
            type="button"
            onClick={() => setViewMode('visual')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
              viewMode === 'visual'
                ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#E2E8F0] dark:text-[#091428]'
                : 'bg-[#F4F6F9] dark:bg-[#091428] text-slate-600 dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#B6C2D2]/20'
            }`}
          >
            Comprobante Visual (Imagen)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('detalle')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
              viewMode === 'detalle'
                ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#E2E8F0] dark:text-[#091428]'
                : 'bg-[#F4F6F9] dark:bg-[#091428] text-slate-600 dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#B6C2D2]/20'
            }`}
          >
            Detalle y Datos
          </button>
        </div>

        {/* Receipt Body */}
        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {viewMode === 'visual' && visualPreviewUrl ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-[#F4F6F9] dark:bg-[#071021] p-2.5 flex flex-col items-center">
                <img
                  src={visualPreviewUrl}
                  alt={`Comprobante visual ${receipt.receiptNumber}`}
                  className="w-full max-w-[520px] rounded-lg shadow-sm border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={handleDownloadPng}
                  disabled={downloadingPng}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{downloadingPng ? 'Generando...' : 'Descargar Imagen (PNG)'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyImage}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#F4F6F9] hover:bg-[#E9EEF5] dark:bg-[#0F2142] dark:hover:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 transition-colors cursor-pointer"
                >
                  {copiedImg ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <ImageIcon className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedImg ? 'Imagen copiada para pegar en WA' : 'Copiar Imagen'}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Client & Boleta Info */}
              <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-[#B6C2D2]/15 pb-2">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] block">
                      Cliente / Titular:
                    </span>
                    <span className="text-sm font-bold text-[#0B1933] dark:text-white">
                      {receipt.clientName}
                    </span>
                    {receipt.clientAddress && (
                      <span className="block text-[11px] text-slate-500 dark:text-[#94A3B8]">
                        {receipt.clientAddress}
                      </span>
                    )}
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] block">
                      Fecha emisión
                    </span>
                    <span className="font-semibold text-[#0B1933] dark:text-white">
                      {formatDateEs(receipt.paymentDate)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-0.5 text-[11px]">
                  <div>
                    <span className="text-slate-500 dark:text-[#94A3B8]">Comprobante:</span>{' '}
                    <strong className="font-mono text-[#0B1933] dark:text-white">
                      #{receipt.boletaNumber}
                    </strong>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 dark:text-[#94A3B8]">Forma de pago:</span>{' '}
                    <strong className="text-[#0B1933] dark:text-white">{methodLabel}</strong>
                  </div>
                  {receipt.dispatchModalityLabel && (
                    <div className="col-span-2">
                      <span className="text-slate-500 dark:text-[#94A3B8]">Despacho:</span>{' '}
                      <strong className="text-[#0B1933] dark:text-white">
                        {receipt.dispatchModalityLabel}
                        {receipt.deliveryAddress ? ` · ${receipt.deliveryAddress}` : ''}
                      </strong>
                    </div>
                  )}
                  {receipt.receivedBy && (
                    <div>
                      <span className="text-slate-500 dark:text-[#94A3B8]">Atendido por:</span>{' '}
                      <strong className="text-[#0B1933] dark:text-white">{receipt.receivedBy}</strong>
                    </div>
                  )}
                  {receipt.salespersonName && (
                    <div className="text-right">
                      <span className="text-slate-500 dark:text-[#94A3B8]">Vendedor / Caja:</span>{' '}
                      <strong className="text-[#0B1933] dark:text-white">{receipt.salespersonName}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Line-by-line products (if present) */}
              {receipt.items && receipt.items.length > 0 && (
                <div className="rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/25 overflow-hidden text-xs">
                  <div className="bg-[#F4F6F9] dark:bg-[#091428] px-3.5 py-2 border-b border-[#CBD5E1] dark:border-[#B6C2D2]/20 font-bold text-[#0B1933] dark:text-white flex items-center justify-between">
                    <span>Detalle de Productos ({receipt.items.length})</span>
                    <span>Modalidad / Subtotal</span>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-[#B6C2D2]/15 bg-white dark:bg-[#0B1933]">
                    {receipt.items.map((item) => (
                      <div key={item.id} className="px-3.5 py-2 flex items-center justify-between gap-2 tabular-nums">
                        <div className="min-w-0">
                          <span className="font-semibold text-[#0B1933] dark:text-white block truncate">
                            {item.quantity}x {item.name}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] font-mono">
                            Precio unit: {formatCurrency(item.unitPrice, config.currencySymbol)}
                            {!receipt.hideUnitModeTag && (
                              <>
                                {' · '}
                                {item.paymentMode === 'contado_hoy'
                                  ? '1 Pago Hoy'
                                  : item.paymentMode === 'un_pago_fiado'
                                  ? '1 Pago Fiado'
                                  : 'En Cuotas'}
                              </>
                            )}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-[#0B1933] dark:text-white shrink-0">
                          {formatCurrency(item.subtotal, config.currencySymbol)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Financial Breakdown */}
              <div className="rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/25 overflow-hidden">
                <div className="bg-[#0B1933] text-white px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-[#CBD5E1]" />
                    <span className="text-xs font-semibold text-[#E2E8F0]">
                      {receipt.isDispatchReceipt
                        ? 'Valor Final del Despacho'
                        : 'Importe Abonado en este Comprobante'}
                    </span>
                  </div>
                  <span className="text-lg font-black font-mono tabular-nums text-emerald-400">
                    {formatCurrency(
                      receipt.isDispatchReceipt ? receipt.originalAmount : receipt.amountPaidNow,
                      config.currencySymbol
                    )}
                  </span>
                </div>

                <div className="p-4 bg-white dark:bg-[#0B1933] space-y-2 text-xs tabular-nums">
                  <div className="flex items-center justify-between text-slate-600 dark:text-[#CBD5E1]">
                    <span>Total de la operación / boleta</span>
                    <span className="font-mono font-semibold">
                      {formatCurrency(receipt.originalAmount, config.currencySymbol)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-[#CBD5E1]">
                    <span>Total abonado acumulado</span>
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                      -{formatCurrency(receipt.totalPaidAccumulated, config.currencySymbol)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-[#B6C2D2]/15 flex items-center justify-between">
                    <span className="font-bold text-[#0B1933] dark:text-white">
                      {isCompleted ? 'Estado de la cuenta' : 'Saldo restante pendiente'}
                    </span>
                    {isCompleted ? (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>CANCELADA AL 100%</span>
                      </span>
                    ) : (
                      <span className="font-mono font-black text-base text-[#991B1B] dark:text-rose-400">
                        {formatCurrency(receipt.remainingBalance, config.currencySymbol)}
                      </span>
                    )}
                  </div>
                  {receipt.basketSummaryLines && receipt.basketSummaryLines.length > 0 && (
                    <div className="pt-2 border-t border-slate-200 dark:border-[#B6C2D2]/15 space-y-1 text-[11px] font-mono text-slate-600 dark:text-[#CBD5E1]">
                      {receipt.basketSummaryLines.map((line, idx) => (
                        <div key={idx}>• {line}</div>
                      ))}
                    </div>
                  )}
                  {receipt.notes && (
                    <p className="text-[11px] text-slate-500 dark:text-[#94A3B8] italic pt-1">
                      Obs: {receipt.notes}
                    </p>
                  )}
                </div>
              </div>

              {!isCompleted && config.merchantPaymentAlias && (
                <div className="p-3 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-[#94A3B8] block">
                      Alias para transferir el saldo restante
                    </span>
                    <span className="font-mono font-bold text-[#0B1933] dark:text-white">
                      {config.merchantPaymentAlias}
                    </span>
                    {config.merchantPaymentBank && (
                      <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] ml-2">
                        ({config.merchantPaymentBank})
                      </span>
                    )}
                  </div>
                  {config.merchantPaymentHolder && (
                    <span className="text-[11px] text-slate-600 dark:text-[#CBD5E1]">
                      Titular: <strong>{config.merchantPaymentHolder}</strong>
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {/* WhatsApp Phone Input (Manual entry if client had no phone) */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-2 print:hidden">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-[#0B1933] dark:text-white flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
                <span>Teléfono / WhatsApp para enviar el recibo:</span>
              </label>
              {!hasSavedPhoneInClient && (
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  Sin teléfono en ficha
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={phoneInput}
                onChange={(e) => {
                  setPhoneInput(e.target.value);
                  setPhoneSavedNotice(false);
                }}
                placeholder="Ej. +54 9 11 2345-6789 (ingresalo a mano si no está agendado)"
                className="flex-1 text-xs font-mono p-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#1E3A6D]"
              />
              {canOfferSavePhone && !phoneSavedNotice && (
                <button
                  type="button"
                  onClick={handleSavePhoneOnly}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-semibold bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 whitespace-nowrap cursor-pointer"
                  title="Guardar este teléfono en la ficha del cliente"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Agendar</span>
                </button>
              )}
            </div>

            {phoneSavedNotice ? (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>Teléfono guardado en la ficha de {receipt.clientName} para próximos envíos.</span>
              </p>
            ) : !phoneInput.trim() ? (
              <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                Descargá la imagen PNG para adjuntar el comprobante visual en WhatsApp o tocá <strong>Enviar Texto por WhatsApp</strong>.
              </p>
            ) : null}
          </div>

          {/* Primary Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200 dark:border-[#B6C2D2]/15 print:hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDownloadPng}
                disabled={downloadingPng}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#162E59] dark:hover:bg-[#1E3A6D] text-[#0B1933] dark:text-white border border-[#CBD5E1] dark:border-[#B6C2D2]/25 cursor-pointer"
                title="Descargar tarjeta comprobante en imagen PNG para WhatsApp"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PNG</span>
              </button>
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#F4F6F9] hover:bg-[#E9EEF5] dark:bg-[#0F2142] dark:hover:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado' : 'Copiar Texto'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#F4F6F9] hover:bg-[#E9EEF5] dark:bg-[#0F2142] dark:hover:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-[#13264A] cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Enviar por WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
