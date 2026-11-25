import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  RotateCcw,
  Tag,
  Calendar,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  ArrowDownUp,
  Shirt,
} from 'lucide-react';
import {
  Boleta,
  BoletaCreditNoteReason,
  Client,
  DistributorConfig,
} from '../types';
import { formatCurrency, formatDateEs, getBoletaBalance } from '../utils/alerts';
import {
  calculateCreditNoteAllocation,
  CreditNoteAllocationPlan,
} from '../utils/businessMode';
import {
  createWhatsAppUrl,
  generateCreditNoteWhatsAppMessage,
} from '../utils/whatsapp';

export const CREDIT_NOTE_REASON_LABELS: Record<BoletaCreditNoteReason, string> = {
  cambio_talle: 'Cambio de talle / color',
  falla_prenda: 'Falla o defecto de prenda',
  no_le_quedo: 'No le quedó / No le gustó',
  devolucion_parcial: 'Devolución de prenda(s)',
  otro: 'Otro motivo',
};

interface ReturnCreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  boleta: Boleta | null;
  planSiblingBoletas?: Boleta[];
  client?: Client;
  config: DistributorConfig;
  activeUserName?: string;
  onApplyCreditNote: (
    plan: CreditNoteAllocationPlan,
    meta: {
      creditNoteNumber: string;
      date: string;
      returnedItem: string;
      reason: BoletaCreditNoteReason;
      notes?: string;
      recordedBy: string;
    }
  ) => void;
}

export const ReturnCreditNoteModal: React.FC<ReturnCreditNoteModalProps> = ({
  isOpen,
  onClose,
  boleta,
  planSiblingBoletas = [],
  client,
  config,
  activeUserName = 'Administración',
  onApplyCreditNote,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [returnedItem, setReturnedItem] = useState('');
  const [reason, setReason] = useState<BoletaCreditNoteReason>('cambio_talle');
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(todayStr);
  const [strategy, setStrategy] = useState<'last_to_first' | 'current_first'>('last_to_first');
  const [notes, setNotes] = useState('');
  const [sendWhatsAppAfter, setSendWhatsAppAfter] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const pendingSiblings = useMemo(
    () => planSiblingBoletas.filter((b) => b.status === 'pending'),
    [planSiblingBoletas]
  );

  useEffect(() => {
    if (isOpen && boleta) {
      const bal = getBoletaBalance(boleta);
      const firstLineItem =
        boleta.items && boleta.items.length > 0
          ? `${boleta.items[0].quantity}x ${boleta.items[0].name}`
          : boleta.itemSummary || '';
      setReturnedItem(firstLineItem);
      setReason('cambio_talle');
      setAmountStr(bal.balanceDue > 0 ? String(bal.balanceDue) : '');
      setDate(todayStr);
      setStrategy('last_to_first');
      setNotes('');
      setSendWhatsAppAfter(false);
      setWhatsappPhone(client?.phone || boleta.clientPhone || '');
      setFormError(null);
    }
  }, [isOpen, boleta?.id, client?.phone, todayStr]);

  if (!isOpen || !boleta || config.businessRubro !== 'indumentaria') return null;

  const currentBal = getBoletaBalance(boleta);
  const hasMultiCuotas = Boolean(boleta.planId && pendingSiblings.length > 1);
  const totalPlanDebt = hasMultiCuotas
    ? pendingSiblings.reduce((acc, b) => acc + getBoletaBalance(b).balanceDue, 0)
    : currentBal.balanceDue;

  const numericCredit = Math.max(0, parseFloat(amountStr) || 0);

  const allocationPlan = calculateCreditNoteAllocation({
    currentBoleta: boleta,
    candidateBoletas: hasMultiCuotas ? pendingSiblings : [boleta],
    creditAmount: numericCredit,
    strategy,
  });

  const handleSelectItemChip = (name: string, subtotal: number) => {
    setReturnedItem(name);
    if (subtotal > 0) {
      setAmountStr(String(Math.min(totalPlanDebt, subtotal)));
    }
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!returnedItem.trim()) {
      setFormError('Indicá qué prenda o artículo devolvió el cliente.');
      return;
    }
    if (!numericCredit || numericCredit <= 0) {
      setFormError('Ingresá un monto de nota de crédito mayor a cero.');
      return;
    }
    if (allocationPlan.totalAppliedCredit <= 0) {
      setFormError('No hay saldo pendiente suficiente sobre este comprobante para aplicar la nota de crédito.');
      return;
    }

    const creditNoteNumber = `NC-${Date.now().toString().slice(-5)}`;

    onApplyCreditNote(allocationPlan, {
      creditNoteNumber,
      date,
      returnedItem: returnedItem.trim(),
      reason,
      notes: notes.trim() || undefined,
      recordedBy: activeUserName,
    });

    if (sendWhatsAppAfter) {
      const affected = allocationPlan.lines.filter((l) => l.appliedCredit > 0);
      const waMsg = generateCreditNoteWhatsAppMessage({
        creditNoteNumber,
        clientName: client?.contactPerson || boleta.clientName,
        date,
        returnedItem: returnedItem.trim(),
        reasonLabel: CREDIT_NOTE_REASON_LABELS[reason],
        totalCreditAmount: allocationPlan.totalAppliedCredit,
        affectedLines: affected,
        remainingTotalDebtAfter: allocationPlan.remainingPlanDebtAfter,
        config,
      });
      const url = createWhatsAppUrl(whatsappPhone || client?.phone || boleta.clientPhone || '', waMsg);
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050C18]/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative my-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-4 border-slate-200 dark:border-[#B6C2D2]/15 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0B1933] dark:bg-[#162E59] text-white flex items-center justify-center border border-[#B6C2D2]/25 shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0B1933] dark:text-white">
                Devolución / Nota de Crédito (Indumentaria)
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                Descuenta el importe de la prenda devuelta de la boleta o cuotas pendientes sin alterar la caja
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Strip */}
        <div className="mt-4 p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 flex flex-wrap items-center justify-between gap-3 text-xs tabular-nums">
          <div>
            <span className="font-mono font-bold text-[#0B1933] dark:text-white">
              #{boleta.boletaNumber}
            </span>
            <span className="mx-1.5 text-slate-400">·</span>
            <span className="font-bold text-[#0B1933] dark:text-white">{boleta.clientName}</span>
            {hasMultiCuotas && (
              <span className="block text-[11px] text-slate-500 dark:text-[#94A3B8] mt-0.5">
                Plan de cuotas activo: {pendingSiblings.length} cuota(s) pendiente(s)
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] block">
              {hasMultiCuotas ? 'Saldo total del plan' : 'Saldo actual boleta'}
            </span>
            <span className="text-base font-black font-mono text-[#0B1933] dark:text-white">
              {formatCurrency(totalPlanDebt, config.currencySymbol)}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Quick Select from Boleta Items if present */}
          {boleta.items && boleta.items.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] flex items-center gap-1.5">
                <Shirt className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
                <span>Prendas en esta operación (clic para autocompletar):</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {boleta.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectItemChip(`${item.quantity}x ${item.name}`, item.subtotal)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 transition-colors cursor-pointer tabular-nums"
                  >
                    {item.quantity}x {item.name} · {formatCurrency(item.subtotal, config.currencySymbol)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Returned Garment & Amount Row */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-7">
              <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] flex items-center gap-1.5 mb-1">
                <Tag className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
                <span>Prenda o detalle devuelto:</span>
              </label>
              <input
                type="text"
                value={returnedItem}
                onChange={(e) => setReturnedItem(e.target.value)}
                placeholder="Ej. 1x Jean Mom T38 Negro"
                className="w-full text-xs p-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white"
                required
              />
            </div>

            <div className="sm:col-span-5">
              <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                Monto a descontar ($):
              </label>
              <input
                type="number" inputMode="decimal"
                step="0.01"
                min="1"
                max={totalPlanDebt}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-full text-sm font-mono font-bold tabular-nums p-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white"
                required
              />
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {[
                  { label: '50% boleta', val: Math.round(currentBal.balanceDue * 0.5) },
                  { label: '100% boleta', val: currentBal.balanceDue },
                  ...(hasMultiCuotas ? [{ label: 'Todo el plan', val: totalPlanDebt }] : []),
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setAmountStr(String(preset.val))}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#F4F6F9] hover:bg-[#E9EEF5] dark:bg-[#0F2142] text-[#0B1933] dark:text-[#CBD5E1] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Reason & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                Motivo de la devolución:
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as BoletaCreditNoteReason)}
                className="w-full text-xs p-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white font-medium"
              >
                {Object.entries(CREDIT_NOTE_REASON_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
                <span>Fecha de devolución:</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white font-mono"
                required
              />
            </div>
          </div>

          {/* Multi-cuota Strategy & Allocation Preview */}
          {hasMultiCuotas && (
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#071021] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#0B1933] dark:text-white flex items-center gap-1.5">
                  <ArrowDownUp className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
                  <span>Cómo descontar sobre las cuotas pendientes:</span>
                </span>
                <div className="inline-flex rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setStrategy('last_to_first')}
                    className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                      strategy === 'last_to_first'
                        ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                        : 'text-slate-600 dark:text-[#94A3B8]'
                    }`}
                  >
                    Últimas cuotas primero
                  </button>
                  <button
                    type="button"
                    onClick={() => setStrategy('current_first')}
                    className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                      strategy === 'current_first'
                        ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                        : 'text-slate-600 dark:text-[#94A3B8]'
                    }`}
                  >
                    Desde esta cuota
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-[#CBD5E1]/70 dark:border-[#B6C2D2]/15">
                <table className="w-full text-left text-[11px] tabular-nums">
                  <thead className="bg-[#E9EEF5] dark:bg-[#0F2142] text-[#0B1933] dark:text-[#E2E8F0] font-semibold">
                    <tr>
                      <th className="py-1.5 px-2.5">Comprobante</th>
                      <th className="py-1.5 px-2.5 text-right">Saldo previo</th>
                      <th className="py-1.5 px-2.5 text-right">Descuento NC</th>
                      <th className="py-1.5 px-2.5 text-right">Saldo nuevo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-[#B6C2D2]/15 bg-white dark:bg-[#0B1933]">
                    {allocationPlan.lines.map((line) => (
                      <tr key={line.boletaId}>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-[#0B1933] dark:text-white">
                          {line.installmentLabel}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono text-slate-600 dark:text-[#94A3B8]">
                          {formatCurrency(line.previousBalanceDue, config.currencySymbol)}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-bold text-amber-700 dark:text-amber-300">
                          {line.appliedCredit > 0
                            ? `-${formatCurrency(line.appliedCredit, config.currencySymbol)}`
                            : '—'}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-bold">
                          {line.willSettleCompletely ? (
                            <span className="text-emerald-700 dark:text-emerald-400">
                              Saldada ($ 0,00)
                            </span>
                          ) : (
                            <span className="text-[#0B1933] dark:text-white">
                              {formatCurrency(line.newBalanceDue, config.currencySymbol)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Impact Summary Bar */}
          {numericCredit > 0 && (
            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-300/70 dark:border-amber-700/50 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
              <div className="text-amber-900 dark:text-amber-200">
                <strong>Nota de Crédito aplicada:</strong>{' '}
                <span className="font-mono font-bold">
                  -{formatCurrency(allocationPlan.totalAppliedCredit, config.currencySymbol)}
                </span>
                <span className="text-[11px] ml-2 opacity-85">
                  (No ingresa dinero a caja ni borra historial)
                </span>
              </div>
              <div className="font-mono font-black text-[#0B1933] dark:text-white">
                Saldo final: {formatCurrency(allocationPlan.remainingPlanDebtAfter, config.currencySymbol)}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
              Observación interna (opcional):
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Prenda recibida en buen estado con etiqueta original"
              className="w-full text-xs p-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white"
            />
          </div>

          {/* Optional WhatsApp confirmation */}
          <div className="p-3 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-[#0B1933] dark:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={sendWhatsAppAfter}
                onChange={(e) => setSendWhatsAppAfter(e.target.checked)}
                className="rounded text-[#0B1933]"
              />
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Enviar confirmación de Nota de Crédito por WhatsApp al cliente</span>
            </label>

            {sendWhatsAppAfter && (
              <input
                type="text"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder="Teléfono WhatsApp del cliente (ej. 54911...)"
                className="w-full text-xs font-mono p-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white"
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-[#B6C2D2]/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-[#13264A] rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Aplicar Nota de Crédito</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
