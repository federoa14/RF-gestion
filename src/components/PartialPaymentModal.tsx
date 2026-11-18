import React, { useState } from 'react';
import {
  X,
  DollarSign,
  Calendar,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  ArrowRight,
  Receipt,
  Phone,
  Send,
  Percent,
  Sparkles,
} from 'lucide-react';
import { Boleta, Client, PartialPayment, DistributorConfig } from '../types';
import { formatCurrency, formatDateEs, getBoletaBalance } from '../utils/alerts';
import {
  calculateExcessPaymentAllocation,
  ExcessPaymentAllocationPlan,
} from '../utils/businessMode';
import type { ReceiptModalData } from './PaymentReceiptModal';

interface PartialPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  boleta: Boleta | null;
  planSiblingBoletas?: Boleta[];
  client?: Client;
  config: DistributorConfig;
  activeUserName?: string;
  onSavePartialPayment: (
    boletaId: string,
    payment: Omit<PartialPayment, 'id'>,
    shouldMarkPaidIfCompleted?: boolean
  ) => void;
  onApplyUnderpaymentWithSurcharge?: (
    boletaId: string,
    payment: Omit<PartialPayment, 'id'>,
    extraSurchargeAmount: number
  ) => void;
  onProcessPlanExcessPayment?: (
    plan: ExcessPaymentAllocationPlan,
    paymentMeta: {
      date: string;
      paymentMethod: 'efectivo' | 'transferencia' | 'cheque' | 'otro';
      notes?: string;
      receivedBy: string;
      receiptNumber: string;
      whatsappPhone?: string;
      openReceiptAfterSave: boolean;
    }
  ) => void;
  onOpenReceipt?: (receipt: ReceiptModalData) => void;
  onSaveClientPhone?: (clientId: string, phone: string) => void;
}

export const PartialPaymentModal: React.FC<PartialPaymentModalProps> = ({
  isOpen,
  onClose,
  boleta,
  planSiblingBoletas = [],
  client,
  config,
  activeUserName = 'Administrador',
  onSavePartialPayment,
  onApplyUnderpaymentWithSurcharge,
  onProcessPlanExcessPayment,
  onOpenReceipt,
  onSaveClientPhone,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [amountStr, setAmountStr] = useState<string>('');
  const [date, setDate] = useState<string>(todayStr);
  const [paymentMethod, setPaymentMethod] = useState<
    'efectivo' | 'transferencia' | 'cheque' | 'otro'
  >('efectivo');
  const [notes, setNotes] = useState<string>('');
  const [receivedBy, setReceivedBy] = useState<string>(activeUserName);
  const [whatsappPhone, setWhatsappPhone] = useState<string>('');
  const [savePhoneToClient, setSavePhoneToClient] = useState<boolean>(true);
  const [openReceiptAfterSave, setOpenReceiptAfterSave] = useState<boolean>(true);
  const [applyUnderpaymentSurcharge, setApplyUnderpaymentSurcharge] = useState<boolean>(false);
  const [underpaymentSurchargePctStr, setUnderpaymentSurchargePctStr] = useState<string>(
    String(config.lateSurchargeEnabled && config.lateSurchargePercent ? config.lateSurchargePercent : 5)
  );
  const [formError, setFormError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen && boleta) {
      setWhatsappPhone(client?.phone || boleta.clientPhone || '');
      setSavePhoneToClient(true);
      setOpenReceiptAfterSave(true);
      setApplyUnderpaymentSurcharge(false);
      setUnderpaymentSurchargePctStr(
        String(config.lateSurchargeEnabled && config.lateSurchargePercent ? config.lateSurchargePercent : 5)
      );
      setFormError(null);
    }
  }, [isOpen, boleta?.id, client?.phone, config.lateSurchargeEnabled, config.lateSurchargePercent]);

  if (!isOpen || !boleta) return null;

  const balance = getBoletaBalance(boleta);
  const pendingSiblings = planSiblingBoletas.filter((b) => b.status === 'pending');
  const hasSiblingCuotas = Boolean(boleta.planId && pendingSiblings.length > 1);
  const totalPlanRemainingDebt = hasSiblingCuotas
    ? pendingSiblings.reduce((s, b) => s + getBoletaBalance(b).balanceDue, 0)
    : balance.balanceDue;

  const numEntered = parseFloat(amountStr) || 0;
  const isUnderpayment = numEntered > 0 && numEntered < balance.balanceDue;
  const isExcessAcrossPlan = hasSiblingCuotas && numEntered > balance.balanceDue;

  const surchargePct = Math.max(0, parseFloat(underpaymentSurchargePctStr) || 0);
  const unpaidRemainderBeforeSurcharge = Math.max(0, balance.balanceDue - numEntered);
  const underpaymentSurchargeAmount =
    isUnderpayment && applyUnderpaymentSurcharge && surchargePct > 0
      ? Math.round(unpaidRemainderBeforeSurcharge * (surchargePct / 100) * 100) / 100
      : 0;

  const excessPlanPreview = isExcessAcrossPlan
    ? calculateExcessPaymentAllocation({
        currentBoleta: boleta,
        candidateBoletas: pendingSiblings,
        totalAmountEntered: numEntered,
      })
    : null;

  const newTotalPaid = balance.totalPaid + Math.min(numEntered, balance.balanceDue);
  const newRemainingBalance = Math.max(
    0,
    unpaidRemainderBeforeSurcharge + underpaymentSurchargeAmount
  );
  const isCompletingBoleta = numEntered >= balance.balanceDue && balance.balanceDue > 0;
  const adjustedTotalAfterUnderpayment = balance.netAmount + underpaymentSurchargeAmount;
  const newPercentage =
    adjustedTotalAfterUnderpayment > 0
      ? Math.min(100, Math.round((newTotalPaid / adjustedTotalAfterUnderpayment) * 100))
      : 0;

  const handleSetQuickPercentage = (percent: number) => {
    const calculated = Math.round((balance.netAmount * percent) / 100);
    const target = Math.min(balance.balanceDue, calculated);
    setAmountStr(target.toString());
  };

  const handleSetFullRemaining = () => {
    setAmountStr(balance.balanceDue.toString());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!numEntered || numEntered <= 0) {
      setFormError('Ingresá un monto válido mayor a cero para la entrega a cuenta.');
      return;
    }

    const receiptNumber = `REC-${Date.now().toString().slice(-5)}`;
    const cleanNotes = notes.trim() || undefined;
    const cleanReceivedBy = receivedBy.trim() || activeUserName;

    if (
      savePhoneToClient &&
      whatsappPhone.trim() &&
      client?.id &&
      onSaveClientPhone &&
      whatsappPhone.trim() !== (client.phone || '').trim()
    ) {
      onSaveClientPhone(client.id, whatsappPhone.trim());
    }

    // 1) Excess payment over sibling cuotas of same installment plan (e.g. "pagó una boleta y media")
    if (isExcessAcrossPlan && excessPlanPreview && onProcessPlanExcessPayment) {
      onProcessPlanExcessPayment(excessPlanPreview, {
        date,
        paymentMethod,
        notes: cleanNotes,
        receivedBy: cleanReceivedBy,
        receiptNumber,
        whatsappPhone: whatsappPhone.trim() || client?.phone || boleta.clientPhone || '',
        openReceiptAfterSave,
      });
      setAmountStr('');
      setNotes('');
      onClose();
      return;
    }

    const finalAmount = Math.min(numEntered, balance.balanceDue);

    // 2) Partial payment with surcharge on remaining unpaid balance
    if (
      isUnderpayment &&
      applyUnderpaymentSurcharge &&
      underpaymentSurchargeAmount > 0 &&
      onApplyUnderpaymentWithSurcharge
    ) {
      const noteWithSurcharge = cleanNotes
        ? `${cleanNotes} · Interés s/ saldo impago +${surchargePct}% (+$${underpaymentSurchargeAmount.toLocaleString('es-AR')})`
        : `Interés s/ saldo impago +${surchargePct}% (+$${underpaymentSurchargeAmount.toLocaleString('es-AR')})`;

      onApplyUnderpaymentWithSurcharge(
        boleta.id,
        {
          receiptNumber,
          date,
          amount: finalAmount,
          paymentMethod,
          notes: noteWithSurcharge,
          receivedBy: cleanReceivedBy,
          surchargeAdded: underpaymentSurchargeAmount,
        },
        underpaymentSurchargeAmount
      );

      const receiptPayload: ReceiptModalData = {
        receiptNumber,
        boletaNumber: boleta.boletaNumber,
        clientId: boleta.clientId,
        clientName: boleta.clientName,
        clientAddress: boleta.clientAddress || client?.address,
        salespersonName: boleta.salespersonName,
        paymentDate: date,
        amountPaidNow: finalAmount,
        paymentMethod,
        originalAmount: adjustedTotalAfterUnderpayment,
        totalPaidAccumulated: balance.totalPaid + finalAmount,
        remainingBalance: newRemainingBalance,
        receivedBy: cleanReceivedBy,
        notes: noteWithSurcharge,
        isFullSettlement: false,
        initialPhone: whatsappPhone.trim() || client?.phone || boleta.clientPhone || '',
      };

      setAmountStr('');
      setNotes('');
      onClose();

      if (openReceiptAfterSave && onOpenReceipt) {
        onOpenReceipt(receiptPayload);
      }
      return;
    }

    // 3) Standard partial payment (or exact settlement of single boleta)
    onSavePartialPayment(
      boleta.id,
      {
        receiptNumber,
        date,
        amount: finalAmount,
        paymentMethod,
        notes: cleanNotes,
        receivedBy: cleanReceivedBy,
      },
      finalAmount >= balance.balanceDue && balance.balanceDue > 0
    );

    const newAccumulated = balance.totalPaid + finalAmount;
    const remainingAfter = Math.max(0, balance.netAmount - newAccumulated);

    const receiptPayload: ReceiptModalData = {
      receiptNumber,
      boletaNumber: boleta.boletaNumber,
      clientId: boleta.clientId,
      clientName: boleta.clientName,
      clientAddress: boleta.clientAddress || client?.address,
      salespersonName: boleta.salespersonName,
      paymentDate: date,
      amountPaidNow: finalAmount,
      paymentMethod,
      originalAmount: balance.netAmount,
      totalPaidAccumulated: newAccumulated,
      remainingBalance: remainingAfter,
      receivedBy: cleanReceivedBy,
      notes: cleanNotes,
      isFullSettlement: remainingAfter <= 0,
      initialPhone: whatsappPhone.trim() || client?.phone || boleta.clientPhone || '',
    };

    setAmountStr('');
    setNotes('');
    onClose();

    if (openReceiptAfterSave && onOpenReceipt) {
      onOpenReceipt(receiptPayload);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Registrar Pago Parcial (Entrega a Cuenta)
              </h2>
              <p className="text-xs text-slate-500">
                Se descuenta del saldo adeudado manteniendo la boleta con su monto original
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Boleta State Card */}
        <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-mono font-bold text-xs bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded">
                Boleta #{boleta.boletaNumber}
              </span>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm mt-1">
                {boleta.clientName}
              </h3>
              <p className="text-xs text-slate-500">
                Vendedor: <strong>{boleta.salespersonName}</strong> • Emitida: {formatDateEs(boleta.saleDate)}
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                {balance.hasCreditNotes ? 'Total Neto Exigible' : 'Total Original'}
              </span>
              <span className="font-bold text-slate-700 dark:text-slate-300 text-sm font-mono tabular-nums">
                {formatCurrency(balance.netAmount, config.currencySymbol)}
              </span>
              {balance.hasCreditNotes && (
                <span className="block text-[10px] font-semibold text-sky-700 dark:text-sky-300 font-mono tabular-nums">
                  Devolución / NC: -{formatCurrency(balance.totalCreditNotes, config.currencySymbol)}
                </span>
              )}
            </div>
          </div>

          {/* Breakdown: Paid vs Balance Due */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
            <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">
                Ya Entregado ({balance.percentagePaid}%):
              </span>
              <span className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                {formatCurrency(balance.totalPaid, config.currencySymbol)}
              </span>
              <span className="text-[10px] text-slate-400 block">
                ({boleta.partialPayments?.length || 0} entregas previas)
              </span>
            </div>

            <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-rose-200 dark:border-rose-900/60">
              <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 block">
                Saldo Actual Adeudado:
              </span>
              <span className="font-black text-rose-700 dark:text-rose-300 text-base">
                {formatCurrency(balance.balanceDue, config.currencySymbol)}
              </span>
            </div>
          </div>

          {/* Previous Partial Payments List */}
          {boleta.partialPayments && boleta.partialPayments.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Historial de Entregas Anteriores:
              </span>
              <div className="max-h-28 overflow-y-auto space-y-1 no-scrollbar">
                {boleta.partialPayments.map((p, idx) => {
                  const cumulativeAtStep = (boleta.partialPayments || [])
                    .slice(0, idx + 1)
                    .reduce((acc, item) => acc + (item.amount || 0), 0);
                  const remainingAtStep = Math.max(0, balance.netAmount - cumulativeAtStep);

                  return (
                    <div
                      key={p.id || idx}
                      className="flex items-center justify-between gap-2 text-[11px] p-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    >
                      <span className="text-slate-600 dark:text-slate-400 truncate">
                        {formatDateEs(p.date)} · {p.paymentMethod} {p.notes ? `(${p.notes})` : ''}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                          +{formatCurrency(p.amount, config.currencySymbol)}
                        </span>
                        {onOpenReceipt && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenReceipt({
                                receiptNumber: p.receiptNumber || `REC-P${idx + 1}`,
                                boletaNumber: boleta.boletaNumber,
                                clientId: boleta.clientId,
                                clientName: boleta.clientName,
                                clientAddress: boleta.clientAddress || client?.address,
                                salespersonName: boleta.salespersonName,
                                paymentDate: p.date,
                                amountPaidNow: p.amount,
                                paymentMethod: p.paymentMethod,
                                originalAmount: balance.netAmount,
                                totalPaidAccumulated: cumulativeAtStep,
                                remainingBalance: remainingAtStep,
                                receivedBy: p.receivedBy,
                                notes: p.notes,
                                isFullSettlement: remainingAtStep <= 0,
                                initialPhone: whatsappPhone.trim() || client?.phone || boleta.clientPhone || '',
                              });
                            }}
                            className="px-2 py-0.5 rounded bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0] font-semibold text-[10px] cursor-pointer"
                            title="Ver o enviar este recibo por WhatsApp"
                          >
                            Recibo WA
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                <span>Monto que entrega en este pago ($):</span>
              </label>
              <button
                type="button"
                onClick={handleSetFullRemaining}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Pagar todo el saldo restante ({formatCurrency(balance.balanceDue, config.currencySymbol)})
              </button>
            </div>

            <input
              type="number"
              step="0.01"
              min="1"
              max={hasSiblingCuotas ? totalPlanRemainingDebt : balance.balanceDue}
              placeholder={
                hasSiblingCuotas
                  ? `Ej. ${balance.balanceDue} o más para adelantar cuotas (Total plan: ${totalPlanRemainingDebt})`
                  : `Ej. 50000 (Saldo restante: ${balance.balanceDue})`
              }
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full text-base font-black p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              required
              autoFocus
            />

            {/* Quick Percentage Buttons */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10px] text-slate-400 font-semibold mr-1">Atajos rápidos:</span>
              <button
                type="button"
                onClick={() => handleSetQuickPercentage(50)}
                className="px-2.5 py-1 text-xs rounded-lg font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                50% (Mitad)
              </button>
              <button
                type="button"
                onClick={handleSetFullRemaining}
                className="px-2.5 py-1 text-xs rounded-lg font-bold bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 cursor-pointer"
              >
                100% Saldo ({formatCurrency(balance.balanceDue, config.currencySymbol)})
              </button>
              {hasSiblingCuotas && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setAmountStr(Math.min(totalPlanRemainingDebt, Math.round(balance.balanceDue * 1.5)).toString())
                    }
                    className="px-2.5 py-1 text-xs rounded-lg font-bold bg-[#E9EEF5] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 cursor-pointer"
                  >
                    1 Cuota y Media
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountStr(totalPlanRemainingDebt.toString())}
                    className="px-2.5 py-1 text-xs rounded-lg font-bold bg-[#0B1933] text-white cursor-pointer"
                  >
                    Todo el Plan ({formatCurrency(totalPlanRemainingDebt, config.currencySymbol)})
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Date & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span>Fecha de la entrega:</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                <span>Medio de pago:</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia bancaria / MP</option>
                <option value="cheque">Cheque</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>

          {/* Received By & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Recibido por (Usuario):
              </label>
              <input
                type="text"
                placeholder="Nombre del cobrador o admin"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Nota o comprobante:
              </label>
              <input
                type="text"
                placeholder="Ej. Entregó mitad en efectivo"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          {/* WhatsApp Phone for Receipt */}
          <div className="p-3 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-[#0B1933] dark:text-white flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
                <span>WhatsApp para enviar recibo al cliente (opcional):</span>
              </label>
              {!client?.phone && !boleta.clientPhone && (
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  Sin teléfono cargado
                </span>
              )}
            </div>
            <input
              type="text"
              placeholder="Ej. +54 9 11 2345-6789 (podés escribirlo a mano ahora)"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              className="w-full text-xs font-mono p-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              {whatsappPhone.trim() && client?.id && whatsappPhone.trim() !== (client.phone || '').trim() ? (
                <label className="flex items-center gap-1.5 text-slate-600 dark:text-[#CBD5E1] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={savePhoneToClient}
                    onChange={(e) => setSavePhoneToClient(e.target.checked)}
                    className="rounded text-[#0B1933]"
                  />
                  <span>Agendar este número en la ficha del cliente</span>
                </label>
              ) : (
                <span className="text-slate-500 dark:text-[#94A3B8]">
                  {whatsappPhone.trim()
                    ? 'Se usará este número para abrir el recibo por WhatsApp.'
                    : 'Si el cliente no tiene número agendado, podés tipearlo acá.'}
                </span>
              )}

              {onOpenReceipt && (
                <label className="flex items-center gap-1.5 font-semibold text-[#0B1933] dark:text-[#E2E8F0] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={openReceiptAfterSave}
                    onChange={(e) => setOpenReceiptAfterSave(e.target.checked)}
                    className="rounded text-[#0B1933]"
                  />
                  <span>Generar recibo al guardar</span>
                </label>
              )}
            </div>
          </div>

          {formError && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs font-medium text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Optional Underpayment Surcharge */}
          {isUnderpayment && (
            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-300/70 dark:border-amber-800/60 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs font-bold text-amber-950 dark:text-amber-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyUnderpaymentSurcharge}
                    onChange={(e) => setApplyUnderpaymentSurcharge(e.target.checked)}
                    className="rounded text-amber-600 cursor-pointer"
                  />
                  <span>Aplicar recargo/interés sobre el saldo que queda impago</span>
                </label>

                {applyUnderpaymentSurcharge && (
                  <div className="flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={underpaymentSurchargePctStr}
                      onChange={(e) => setUnderpaymentSurchargePctStr(e.target.value)}
                      className="w-16 text-xs font-mono font-bold p-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-[#071021]"
                    />
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300">%</span>
                  </div>
                )}
              </div>

              {applyUnderpaymentSurcharge && underpaymentSurchargeAmount > 0 && (
                <p className="text-[11px] text-amber-900 dark:text-amber-200 tabular-nums pl-6">
                  Sobre los {formatCurrency(unpaidRemainderBeforeSurcharge, config.currencySymbol)} que quedan sin pagar se sumará{' '}
                  <strong>+{formatCurrency(underpaymentSurchargeAmount, config.currencySymbol)}</strong> ({surchargePct}%).
                </p>
              )}
            </div>
          )}

          {/* Live Preview Box */}
          {numEntered > 0 && !isExcessAcrossPlan && (
            <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#0F2142] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 space-y-1.5">
              <div className="flex items-center justify-between text-xs tabular-nums">
                <span className="font-semibold text-[#0B1933] dark:text-[#E2E8F0]">
                  Nuevo saldo pendiente que quedará:
                </span>
                <span className="font-black text-[#0B1933] dark:text-white font-mono text-sm">
                  {formatCurrency(newRemainingBalance, config.currencySymbol)}
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-[#071021] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#0B1933] dark:bg-[#CBD5E1] h-full rounded-full transition-all duration-300"
                  style={{ width: `${newPercentage}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-[#94A3B8] tabular-nums">
                <span>Total exigible: {formatCurrency(adjustedTotalAfterUnderpayment, config.currencySymbol)}</span>
                <span className="font-bold text-[#0B1933] dark:text-[#E2E8F0]">{newPercentage}% cancelado</span>
              </div>
              {numEntered > balance.balanceDue && !hasSiblingCuotas && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                  El monto supera el saldo adeudado: se registrará el cobro exacto de {formatCurrency(balance.balanceDue, config.currencySymbol)} para cancelar la boleta.
                </p>
              )}
              {isCompletingBoleta && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 pt-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>¡Esta entrega cancela el 100% de la boleta! Se archivará en el historial de pagadas.</span>
                </div>
              )}
            </div>
          )}

          {/* Excess Payment Allocation Preview across Sibling Cuotas */}
          {isExcessAcrossPlan && excessPlanPreview && (
            <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#0F2142] border border-[#0B1933]/30 dark:border-[#CBD5E1]/30 space-y-2 tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#0B1933] dark:text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Adelanto aplicado a cuotas siguientes del plan</span>
                </span>
                <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300">
                  {excessPlanPreview.lines.filter((l) => l.appliedPayment > 0).length} cuotas impactadas
                </span>
              </div>

              <div className="space-y-1 max-h-28 overflow-y-auto">
                {excessPlanPreview.lines
                  .filter((al) => al.appliedPayment > 0 || al.interestReduction > 0)
                  .map((al) => (
                  <div
                    key={al.boletaId}
                    className="flex items-center justify-between text-[11px] p-1.5 rounded bg-white dark:bg-[#071021] border border-[#CBD5E1] dark:border-[#B6C2D2]/20"
                  >
                    <span className="font-mono font-semibold text-[#0B1933] dark:text-white">
                      #{al.boletaNumber} {al.willSettleCompletely ? '(Cancela)' : '(Abono)'}
                    </span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-emerald-700 dark:text-emerald-300 font-bold">
                        +{formatCurrency(al.appliedPayment, config.currencySymbol)}
                      </span>
                      {al.interestReduction > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                          -{formatCurrency(al.interestReduction, config.currencySymbol)} interés
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {excessPlanPreview.totalInterestReduction > 0 && (
                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-between pt-1 border-t border-[#CBD5E1] dark:border-[#B6C2D2]/20">
                  <span>Reducción proporcional de intereses futuros:</span>
                  <span className="font-mono">
                    -{formatCurrency(excessPlanPreview.totalInterestReduction, config.currencySymbol)}
                  </span>
                </div>
              )}

              <div className="text-xs font-bold text-[#0B1933] dark:text-white flex items-center justify-between">
                <span>Deuda total restante del plan después de este pago:</span>
                <span className="font-mono">
                  {formatCurrency(excessPlanPreview.remainingPlanDebtAfter, config.currencySymbol)}
                </span>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-[#B6C2D2]/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-[#13264A] rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{openReceiptAfterSave && onOpenReceipt ? 'Registrar y Emitir Recibo' : 'Registrar Entrega a Cuenta'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
