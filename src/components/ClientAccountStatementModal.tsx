import React, { useState, useEffect } from 'react';
import {
  X,
  Wallet,
  Calendar,
  CreditCard,
  MessageCircle,
  Phone,
  CheckCircle2,
  UserPlus,
  Check,
  Send,
  ArrowDownRight,
  AlertTriangle,
  RefreshCw,
  Download,
  FileText,
} from 'lucide-react';
import { Boleta, Client, DistributorConfig } from '../types';
import { formatCurrency, formatDateEs, getBoletaBalance } from '../utils/alerts';
import {
  calculateExcessPaymentAllocation,
  ExcessPaymentAllocationPlan,
  getBusinessLabels,
} from '../utils/businessMode';
import {
  createWhatsAppUrl,
  generateClientStatementWhatsAppMessage,
} from '../utils/whatsapp';
import { createClientPaymentLink, buildClientPaymentWhatsAppHref } from '../utils/clientPaymentLinks';
import {
  downloadClientStatementPdf,
  downloadClientStatementPng,
} from '../utils/visualStatement';

interface ClientAccountStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  pendingBoletas: Boleta[];
  paidBoletas: Boleta[];
  config: DistributorConfig;
  activeUserName?: string;
  onSaveClientPhone?: (clientId: string, phone: string) => void;
  onApplyFifoPayment?: (payload: {
    clientId: string;
    totalAmount: number;
    date: string;
    paymentMethod: 'efectivo' | 'transferencia' | 'cheque' | 'otro';
    notes?: string;
    receivedBy?: string;
    allocation: ExcessPaymentAllocationPlan;
  }) => void;
}

export const ClientAccountStatementModal: React.FC<ClientAccountStatementModalProps> = ({
  isOpen,
  onClose,
  client,
  pendingBoletas,
  paidBoletas,
  config,
  activeUserName = 'Administración',
  onSaveClientPhone,
  onApplyFifoPayment,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [amountStr, setAmountStr] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(todayStr);
  const [paymentMethod, setPaymentMethod] = useState<
    'efectivo' | 'transferencia' | 'cheque' | 'otro'
  >('efectivo');
  const [notes, setNotes] = useState<string>('');
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [phoneSaved, setPhoneSaved] = useState<boolean>(false);
  const [showPaymentForm, setShowPaymentForm] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSendingPayLink, setIsSendingPayLink] = useState<boolean>(false);
  const [payLinkNotice, setPayLinkNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && client) {
      setPhoneInput(client.phone || '');
      setPhoneSaved(false);
      setAmountStr('');
      setNotes('');
      setShowPaymentForm(false);
      setFormError(null);
      setPayLinkNotice(null);
    }
  }, [isOpen, client?.id, client?.phone]);

  if (!isOpen || !client) return null;

  const labels = getBusinessLabels(config);
  const sym = config.currencySymbol || '$';

  const clientPending = [...pendingBoletas]
    .filter((b) => b.clientId === client.id && b.status === 'pending')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const clientPaid = [...paidBoletas]
    .filter((b) => b.clientId === client.id)
    .sort((a, b) => (b.paidAt || b.saleDate).localeCompare(a.paidAt || a.saleDate));

  const totalPendingDebt = clientPending.reduce(
    (acc, b) => acc + getBoletaBalance(b).balanceDue,
    0
  );

  const creditLimit = client.creditLimit && client.creditLimit > 0 ? client.creditLimit : 0;
  const availableCredit = creditLimit > 0 ? Math.max(0, creditLimit - totalPendingDebt) : 0;
  const isOverLimit = creditLimit > 0 && totalPendingDebt > creditLimit;

  const numEntered = parseFloat(amountStr) || 0;
  const allocationPreview: ExcessPaymentAllocationPlan | null =
    clientPending.length > 0 && numEntered > 0
      ? calculateExcessPaymentAllocation({
          currentBoleta: clientPending[0],
          candidateBoletas: clientPending,
          totalAmountEntered: numEntered,
        })
      : null;

  const canOfferSavePhone =
    Boolean(onSaveClientPhone) &&
    Boolean(phoneInput.trim()) &&
    phoneInput.trim() !== (client.phone || '').trim();

  const handleSavePhone = () => {
    if (canOfferSavePhone && onSaveClientPhone) {
      onSaveClientPhone(client.id, phoneInput.trim());
      setPhoneSaved(true);
    }
  };

  const handleSendStatementWhatsApp = () => {
    if (canOfferSavePhone && onSaveClientPhone && !phoneSaved) {
      onSaveClientPhone(client.id, phoneInput.trim());
      setPhoneSaved(true);
    }
    const msg = generateClientStatementWhatsAppMessage({
      client,
      pendingBoletas: clientPending,
      paidBoletas: clientPaid,
      config,
    });
    const url = createWhatsAppUrl(phoneInput.trim(), msg);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadStatementPng = async () => {
    await downloadClientStatementPng({
      client,
      pendingBoletas: clientPending,
      paidBoletas: clientPaid,
      config,
    });
  };

  const handleDownloadStatementPdf = async () => {
    await downloadClientStatementPdf({
      client,
      pendingBoletas: clientPending,
      paidBoletas: clientPaid,
      config,
    });
  };

  const handleSendPaymentLinkWhatsApp = async () => {
    if (clientPending.length === 0 || totalPendingDebt <= 0) return;
    if (canOfferSavePhone && onSaveClientPhone && !phoneSaved) {
      onSaveClientPhone(client.id, phoneInput.trim());
      setPhoneSaved(true);
    }
    setIsSendingPayLink(true);
    setPayLinkNotice(null);
    setFormError(null);
    try {
      const { payUrl, order } = await createClientPaymentLink({
        client,
        pendingBoletas: clientPending,
        config,
      });
      if (navigator.clipboard) {
        navigator.clipboard.writeText(payUrl).catch(() => {});
      }
      setPayLinkNotice(payUrl);
      const url = buildClientPaymentWhatsAppHref({
        phone: phoneInput.trim(),
        client,
        order,
        payUrl,
        config,
      });
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setFormError(err.message || 'No se pudo generar el link de pago.');
    } finally {
      setIsSendingPayLink(false);
    }
  };

  const handleSubmitFifoPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!numEntered || numEntered <= 0) {
      setFormError('Ingresá un monto mayor a cero para registrar la entrega.');
      return;
    }

    if (!allocationPreview || clientPending.length === 0) {
      setFormError('Este cliente no posee comprobantes pendientes de cobro.');
      return;
    }

    if (canOfferSavePhone && onSaveClientPhone && !phoneSaved) {
      onSaveClientPhone(client.id, phoneInput.trim());
    }

    if (onApplyFifoPayment) {
      onApplyFifoPayment({
        clientId: client.id,
        totalAmount: numEntered,
        date: paymentDate,
        paymentMethod,
        notes: notes.trim() || 'Entrega general a cuenta corriente (FIFO)',
        receivedBy: activeUserName,
        allocation: allocationPreview,
      });
    }

    setAmountStr('');
    setNotes('');
    setShowPaymentForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050C18]/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-6">
        {/* Top Navy Header */}
        <div className="bg-[#091428] text-white px-5 py-4 border-b border-[#B6C2D2]/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#162E59] text-[#E2E8F0] border border-[#B6C2D2]/30 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-[#CBD5E1]">
                  {client.clientNumber || 'S/N'}
                </span>
                <span className="text-[11px] font-semibold text-[#94A3B8]">
                  · Cuenta Corriente Unificada ({labels.shortLabel})
                </span>
              </div>
              <h2 className="text-base font-bold text-white truncate">{client.name}</h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#13264A] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] block">
                Saldo Total Adeudado
              </span>
              <span
                className={`text-xl font-black font-mono tabular-nums mt-0.5 block ${
                  totalPendingDebt > 0
                    ? 'text-[#991B1B] dark:text-rose-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {formatCurrency(totalPendingDebt, sym)}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] tabular-nums">
                {clientPending.length} comprobante(s) abierto(s)
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] block">
                Tope de Fiado / Crédito
              </span>
              <span className="text-lg font-black font-mono tabular-nums text-[#0B1933] dark:text-white mt-0.5 block">
                {creditLimit > 0 ? formatCurrency(creditLimit, sym) : 'Sin tope fijo'}
              </span>
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  isOverLimit ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-[#94A3B8]'
                }`}
              >
                {creditLimit > 0
                  ? isOverLimit
                    ? `Excedido por ${formatCurrency(totalPendingDebt - creditLimit, sym)}`
                    : `Disponible: ${formatCurrency(availableCredit, sym)}`
                  : 'Manejo libre'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] block">
                Historial Pagado
              </span>
              <span className="text-lg font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                {clientPaid.length} cancelado(s)
              </span>
              <span className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                {client.address || 'Sin dirección'}
              </span>
            </div>
          </div>

          {/* Action Bar: FIFO Payment + WhatsApp Statement */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0F2142] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-1">
                <Phone className="w-4 h-4 text-[#162E59] dark:text-[#CBD5E1] shrink-0" />
                <input
                  type="text"
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value);
                    setPhoneSaved(false);
                  }}
                  placeholder="WhatsApp del cliente (podés tipearlo ahora si no está agendado)"
                  className="flex-1 text-xs font-mono px-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white"
                />
                {canOfferSavePhone && !phoneSaved && (
                  <button
                    type="button"
                    onClick={handleSavePhone}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-semibold bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Agendar</span>
                  </button>
                )}
                {phoneSaved && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Guardado
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {clientPending.length > 0 && (
                  <button
                    type="button"
                    disabled={isSendingPayLink}
                    onClick={handleSendPaymentLinkWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#009EE3] hover:bg-[#008AD0] disabled:opacity-60 text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    {isSendingPayLink ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CreditCard className="w-3.5 h-3.5" />
                    )}
                    <span>Link de Pago MP / Tarjeta WA</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSendStatementWhatsApp}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold cursor-pointer transition-colors"
                  title="Enviar el detalle completo escrito por WhatsApp al instante"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Estado WA</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadStatementPdf}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-xs font-bold cursor-pointer transition-colors"
                  title="Descargar Estado de Cuenta en PDF para enviar por WhatsApp"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadStatementPng}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-xs font-bold cursor-pointer transition-colors"
                  title="Descargar Imagen PNG del Estado de Cuenta"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Imagen</span>
                </button>

                {clientPending.length > 0 && onApplyFifoPayment && (
                  <button
                    type="button"
                    onClick={() => setShowPaymentForm((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold cursor-pointer transition-colors"
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>{showPaymentForm ? 'Ocultar Pago FIFO' : 'Entrega a Cuenta General'}</span>
                  </button>
                )}
              </div>
            </div>

            {payLinkNotice && (
              <div className="p-2.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 text-[11px] text-sky-900 dark:text-sky-200 flex items-center justify-between gap-2 flex-wrap">
                <span>
                  Link enviado y copiado: <strong className="font-mono underline">{payLinkNotice}</strong>
                </span>
                <span>Al acreditarse (MP, crédito, débito o alias), la cuenta se marca PAGADA sola.</span>
              </div>
            )}

            {config.merchantPaymentAlias && (
              <p className="text-[11px] text-slate-600 dark:text-[#CBD5E1]">
                Alias configurado para cobros:{' '}
                <strong className="font-mono">{config.merchantPaymentAlias}</strong>
                {config.merchantPaymentCvu ? ` · CVU: ${config.merchantPaymentCvu}` : ''}
              </p>
            )}
          </div>

          {/* General FIFO Lump-Sum Payment Form */}
          {showPaymentForm && clientPending.length > 0 && (
            <form
              onSubmit={handleSubmitFifoPayment}
              className="p-4 rounded-xl bg-white dark:bg-[#071021] border-2 border-[#162E59] dark:border-[#CBD5E1]/40 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#B6C2D2]/15 pb-2">
                <div>
                  <h3 className="text-xs font-bold text-[#0B1933] dark:text-white uppercase tracking-wide">
                    Entrega a Cuenta General (Imputación Automática por Vencimiento)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                    Cancela primero el comprobante más antiguo; si adelanta cuotas con financiación, reduce intereses proporcionalmente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAmountStr(String(totalPendingDebt))}
                  className="text-[11px] font-bold text-[#162E59] dark:text-[#CBD5E1] hover:underline cursor-pointer shrink-0"
                >
                  Total ({formatCurrency(totalPendingDebt, sym)})
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                    Monto que entrega ({sym}) *
                  </label>
                  <input
                    type="number" inputMode="decimal"
                    step="0.01"
                    min="1"
                    max={totalPendingDebt}
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    placeholder={`Máx ${totalPendingDebt}`}
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] font-mono font-bold text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-[#CBD5E1] flex items-center gap-1 mb-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Fecha</span>
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933]"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-[#CBD5E1] flex items-center gap-1 mb-1">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Medio de pago</span>
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933]"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia / MP</option>
                    <option value="cheque">Cheque</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>

              <div>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observación o comprobante (opcional)"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933]"
                />
              </div>

              {allocationPreview && (
                <div className="p-3 rounded-lg bg-[#F4F6F9] dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-2 text-xs tabular-nums">
                  <div className="flex items-center justify-between font-bold text-[#0B1933] dark:text-white">
                    <span>Imputación en {allocationPreview.lines.filter((l) => l.appliedPayment > 0).length} comprobante(s)</span>
                    {allocationPreview.totalInterestReduction > 0 && (
                      <span className="text-emerald-700 dark:text-emerald-400 font-mono">
                        Bonificación interés: -{formatCurrency(allocationPreview.totalInterestReduction, sym)}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {allocationPreview.lines
                      .filter((l) => l.appliedPayment > 0 || l.interestReduction > 0)
                      .map((line) => (
                        <div
                          key={line.boletaId}
                          className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-white dark:bg-[#071021] border border-slate-200 dark:border-[#B6C2D2]/15"
                        >
                          <span className="font-semibold text-[#0B1933] dark:text-[#E2E8F0]">
                            {line.installmentLabel}
                          </span>
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-emerald-700 dark:text-emerald-400">
                              -{formatCurrency(line.appliedPayment, sym)}
                            </span>
                            {line.interestReduction > 0 && (
                              <span className="text-sky-700 dark:text-sky-400">
                                (-{formatCurrency(line.interestReduction, sym)} int.)
                              </span>
                            )}
                            <span className={line.willSettleCompletely ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                              {line.willSettleCompletely ? 'SALDADO' : `Resta ${formatCurrency(line.newBalanceDue, sym)}`}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-[#B6C2D2]/15 font-bold">
                    <span>Nuevo saldo total del cliente:</span>
                    <span className="font-mono text-[#0B1933] dark:text-white">
                      {formatCurrency(allocationPreview.remainingPlanDebtAfter, sym)}
                    </span>
                  </div>
                </div>
              )}

              {formError && (
                <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentForm(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-[#13264A] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:text-[#091428] text-white text-xs font-bold cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Confirmar Entrega a Cuenta</span>
                </button>
              </div>
            </form>
          )}

          {/* Open Pending Movements / Boletas / Cuotas */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#94A3B8]">
              Comprobantes Pendientes ({clientPending.length})
            </h3>
            {clientPending.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 text-center text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Cuenta al día: no registra comprobantes pendientes de pago.</span>
              </div>
            ) : (
              <div className="border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0B1933] text-[#E2E8F0] font-semibold">
                    <tr>
                      <th className="px-3 py-2.5">Comprobante</th>
                      <th className="px-3 py-2.5">Detalle / Prendas</th>
                      <th className="px-3 py-2.5">Vencimiento</th>
                      <th className="px-3 py-2.5 text-right">Saldo Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-[#B6C2D2]/15 bg-white dark:bg-[#071021]">
                    {clientPending.map((b) => {
                      const bal = getBoletaBalance(b);
                      return (
                        <tr key={b.id}>
                          <td className="px-3 py-2.5 font-mono font-bold text-[#0B1933] dark:text-white whitespace-nowrap">
                            #{b.boletaNumber}
                            {b.totalInstallments && b.installmentNumber && (
                              <span className="block text-[10px] font-sans font-semibold text-indigo-600 dark:text-indigo-300">
                                Cuota {b.installmentNumber}/{b.totalInstallments}
                              </span>
                            )}
                            {b.saleMode === 'sena_reserva' && (
                              <span className="block text-[10px] font-sans font-semibold text-amber-700 dark:text-amber-300">
                                Reserva c/ Seña
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 dark:text-[#CBD5E1]">
                            {b.itemSummary || b.notes || 'Operación en cuenta'}
                            {(bal.lateSurchargeApplied > 0 || bal.earlyPaymentDiscountApplied > 0) && (
                              <span className="block text-[10px] font-mono text-slate-400">
                                {bal.lateSurchargeApplied > 0 ? `+${formatCurrency(bal.lateSurchargeApplied, sym)} recargo ` : ''}
                                {bal.earlyPaymentDiscountApplied > 0 ? `-${formatCurrency(bal.earlyPaymentDiscountApplied, sym)} desc. int.` : ''}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-slate-600 dark:text-[#CBD5E1]">
                            {formatDateEs(b.dueDate)}
                            <span className="block text-[10px] text-slate-400">
                              Emisión: {formatDateEs(b.saleDate)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="font-bold text-[#991B1B] dark:text-rose-400">
                              {formatCurrency(bal.balanceDue, sym)}
                            </span>
                            {bal.hasPartialPayments && (
                              <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">
                                Entregado: -{formatCurrency(bal.totalPaid, sym)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#F8FAFC] dark:bg-[#091428] border-t border-slate-200 dark:border-[#B6C2D2]/15 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:text-[#091428] text-white cursor-pointer"
          >
            Cerrar Cuenta Corriente
          </button>
        </div>
      </div>
    </div>
  );
};
