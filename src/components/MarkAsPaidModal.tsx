import React, { useState } from 'react';
import {
  X,
  CheckCircle,
  Banknote,
  CreditCard,
  FileCheck,
  Building,
  User,
  Calendar,
  Phone,
  Send,
  Percent,
} from 'lucide-react';
import { Boleta, Client, DistributorConfig } from '../types';
import { formatCurrency, getBoletaBalance, getSuggestedLateSurcharge } from '../utils/alerts';
import type { ReceiptModalData } from './PaymentReceiptModal';

interface MarkAsPaidModalProps {
  isOpen: boolean;
  onClose: () => void;
  boleta: Boleta | null;
  client?: Client;
  config: DistributorConfig;
  activeUserName?: string;
  onConfirmPayment: (
    boletaId: string,
    paymentData: {
      paidAt: string;
      paymentMethod: 'efectivo' | 'transferencia' | 'cheque' | 'otro';
      paymentReference?: string;
      paymentNotes?: string;
      lateSurchargeAmount?: number;
    }
  ) => void;
  onOpenReceipt?: (receipt: ReceiptModalData) => void;
  onSaveClientPhone?: (clientId: string, phone: string) => void;
}

export const MarkAsPaidModal: React.FC<MarkAsPaidModalProps> = ({
  isOpen,
  onClose,
  boleta,
  client,
  config,
  activeUserName = 'Administración',
  onConfirmPayment,
  onOpenReceipt,
  onSaveClientPhone,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [paidAt, setPaidAt] = useState<string>(todayStr);
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia' | 'cheque' | 'otro'>('efectivo');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [whatsappPhone, setWhatsappPhone] = useState<string>('');
  const [savePhoneToClient, setSavePhoneToClient] = useState<boolean>(true);
  const [openReceiptAfterSave, setOpenReceiptAfterSave] = useState<boolean>(false);
  const [applyLateSurcharge, setApplyLateSurcharge] = useState<boolean>(false);
  const [customSurchargePctStr, setCustomSurchargePctStr] = useState<string>(
    String(config.lateSurchargePercent ?? 5)
  );

  React.useEffect(() => {
    if (isOpen && boleta) {
      setWhatsappPhone(client?.phone || boleta.clientPhone || '');
      setSavePhoneToClient(true);
      setOpenReceiptAfterSave(false);
      setApplyLateSurcharge(false);
      setCustomSurchargePctStr(String(config.lateSurchargePercent ?? 5));
    }
  }, [isOpen, boleta?.id, client?.phone, config.lateSurchargePercent]);

  if (!isOpen || !boleta) return null;

  const balance = getBoletaBalance(boleta);
  const lateSuggestion = getSuggestedLateSurcharge(boleta, config, paidAt || todayStr);
  const surchargePct = Math.max(0, parseFloat(customSurchargePctStr) || 0);
  const lateSurchargeAmount =
    applyLateSurcharge && surchargePct > 0
      ? Math.round(balance.balanceDue * (surchargePct / 100) * 100) / 100
      : 0;
  const finalCollectAmount = Math.round((balance.balanceDue + lateSurchargeAmount) * 100) / 100;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (
      savePhoneToClient &&
      whatsappPhone.trim() &&
      client?.id &&
      onSaveClientPhone &&
      whatsappPhone.trim() !== (client.phone || '').trim()
    ) {
      onSaveClientPhone(client.id, whatsappPhone.trim());
    }

    const baseNote = paymentNotes.trim();
    const combinedNote =
      lateSurchargeAmount > 0
        ? [baseNote, `Recargo mora +${surchargePct}% (+$${lateSurchargeAmount.toLocaleString('es-AR')})`]
            .filter(Boolean)
            .join(' · ')
        : baseNote || undefined;

    onConfirmPayment(boleta.id, {
      paidAt,
      paymentMethod,
      paymentReference: paymentReference.trim() || undefined,
      paymentNotes: combinedNote,
      lateSurchargeAmount: lateSurchargeAmount > 0 ? lateSurchargeAmount : undefined,
    });

    const receiptData: ReceiptModalData = {
      receiptNumber: paymentReference.trim() || `REC-${Date.now().toString().slice(-5)}`,
      boletaNumber: boleta.boletaNumber,
      clientId: boleta.clientId,
      clientName: boleta.clientName,
      clientAddress: boleta.clientAddress || client?.address,
      salespersonName: boleta.salespersonName,
      paymentDate: paidAt,
      amountPaidNow: finalCollectAmount,
      paymentMethod,
      originalAmount: balance.originalAmount + lateSurchargeAmount,
      totalPaidAccumulated: balance.netAmount + lateSurchargeAmount,
      remainingBalance: 0,
      receivedBy: activeUserName,
      notes: [
        balance.hasCreditNotes
          ? `Nota de Crédito aplicada: -${formatCurrency(balance.totalCreditNotes, config.currencySymbol)}`
          : '',
        combinedNote || '',
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
      isFullSettlement: true,
      initialPhone: whatsappPhone.trim() || client?.phone || boleta.clientPhone || '',
    };

    onClose();

    if (openReceiptAfterSave && onOpenReceipt) {
      onOpenReceipt(receiptData);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050C18]/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative my-6">
        <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-[#B6C2D2]/15">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-600 flex items-center justify-center">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0B1933] dark:text-white">
                Rendición y Liquidación de Boleta
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                Se registrará la cancelación final y se archivará en el historial
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1.5 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Boleta Summary Box */}
        <div className="mt-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/60 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-mono text-xs font-bold text-emerald-900 dark:text-emerald-300">
                Boleta #{boleta.boletaNumber}
              </span>
              <h3 className="font-bold text-[#0B1933] dark:text-white text-sm mt-0.5">
                {boleta.clientName}
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                Vendedor que rindió: <strong>{boleta.salespersonName}</strong>
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                {balance.hasPartialPayments ? 'Saldo a Liquidar Hoy' : 'Total a Cobrar'}
              </span>
              <span className="text-xl font-black text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                {formatCurrency(finalCollectAmount, config.currencySymbol)}
              </span>
            </div>
          </div>

          {(balance.hasPartialPayments || balance.hasCreditNotes) && (
            <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
              <span>Monto original: <strong>{formatCurrency(balance.originalAmount, config.currencySymbol)}</strong></span>
              {balance.hasCreditNotes && (
                <span className="text-amber-700 dark:text-amber-300 font-semibold">
                  Devolución / NC: -{formatCurrency(balance.totalCreditNotes, config.currencySymbol)}
                </span>
              )}
              {balance.hasPartialPayments && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Ya entregado: -{formatCurrency(balance.totalPaid, config.currencySymbol)}
                </span>
              )}
            </div>
          )}

          {/* Optional Late Surcharge (ONLY for overdue / long-term — strictly NO early/on-time discount) */}
          {(lateSuggestion.isEligible || lateSuggestion.daysPastDueDate > 0 || config.lateSurchargeEnabled) && (
            <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs font-bold text-[#0B1933] dark:text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyLateSurcharge}
                    onChange={(e) => setApplyLateSurcharge(e.target.checked)}
                    className="rounded text-[#0B1933] cursor-pointer"
                  />
                  <span>
                    Aplicar recargo opcional por mora ({lateSuggestion.daysPastDueDate}d atraso)
                  </span>
                </label>

                {applyLateSurcharge && (
                  <div className="flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-amber-600" />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={customSurchargePctStr}
                      onChange={(e) => setCustomSurchargePctStr(e.target.value)}
                      className="w-16 text-xs font-mono font-bold p-1 rounded border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021]"
                    />
                    <span className="text-xs font-bold">%</span>
                  </div>
                )}
              </div>
              {applyLateSurcharge && lateSurchargeAmount > 0 && (
                <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 tabular-nums pl-6">
                  Se suma +{formatCurrency(lateSurchargeAmount, config.currencySymbol)} al cobro final.
                </p>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] flex items-center gap-1.5 mb-1">
              <Calendar className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
              <span>Fecha en que se recibió el dinero:</span>
            </label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-slate-800 dark:text-slate-200 font-medium"
              required
            />
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1.5">
              Forma de pago recibida:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'efectivo', label: 'Efectivo', icon: Banknote },
                { id: 'transferencia', label: 'Transferencia', icon: CreditCard },
                { id: 'cheque', label: 'Cheque', icon: FileCheck },
                { id: 'otro', label: 'Otro medio', icon: Building },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-semibold gap-1 transition-all cursor-pointer ${
                      paymentMethod === m.id
                        ? 'border-[#0B1933] dark:border-[#CBD5E1] bg-[#E9EEF5] text-[#0B1933] dark:bg-[#162E59] dark:text-white'
                        : 'border-slate-200 dark:border-[#B6C2D2]/20 hover:bg-slate-50 dark:hover:bg-[#10203E] text-slate-600 dark:text-[#94A3B8]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Receipt or reference */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
              N° de Recibo o Referencia bancaria (opcional):
            </label>
            <input
              type="text"
              placeholder="Ej. REC-00941 o Transferencia Banco Galicia 83910"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-slate-800 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
              Notas de la cobranza / rendición:
            </label>
            <input
              type="text"
              placeholder="Ej. Rendido en caja por el vendedor Carlos; billetes revisados"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-slate-800 dark:text-slate-200"
            />
          </div>

          {/* Optional WhatsApp Receipt Section */}
          {onOpenReceipt && (
            <div className="p-3 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold text-[#0B1933] dark:text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={openReceiptAfterSave}
                    onChange={(e) => setOpenReceiptAfterSave(e.target.checked)}
                    className="rounded text-[#0B1933]"
                  />
                  <span>Emitir recibo de pago para enviar por WhatsApp</span>
                </label>
                {!client?.phone && !boleta.clientPhone && (
                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    Sin tel. en ficha
                  </span>
                )}
              </div>

              {openReceiptAfterSave && (
                <div className="space-y-1.5 pt-1">
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Teléfono / WhatsApp del cliente (escribilo acá si no figura)"
                      value={whatsappPhone}
                      onChange={(e) => setWhatsappPhone(e.target.value)}
                      className="w-full text-xs font-mono pl-8 pr-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white"
                    />
                  </div>
                  {whatsappPhone.trim() && client?.id && whatsappPhone.trim() !== (client.phone || '').trim() && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-[#CBD5E1] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={savePhoneToClient}
                        onChange={(e) => setSavePhoneToClient(e.target.checked)}
                        className="rounded"
                      />
                      <span>Guardar este teléfono en la ficha de {boleta.clientName}</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-[#B6C2D2]/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-[#13264A] rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {openReceiptAfterSave ? <Send className="w-3.5 h-3.5" /> : <CheckCircle className="w-4 h-4" />}
              <span>
                {openReceiptAfterSave ? 'Confirmar Cobro y Emitir Recibo' : 'Confirmar Cobro y Mover al Historial'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

