import React, { useState } from 'react';
import {
  User,
  Bike,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  Trash2,
  MessageCircle,
  Mail,
  ShieldAlert,
  Image as ImageIcon,
  Receipt,
  Flame,
  ClipboardCheck,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { Boleta, Client, Salesperson, Administrator, DistributorConfig } from '../types';
import { calculateAlertStatus, formatCurrency, formatDateEs, getBoletaBalance } from '../utils/alerts';
import {
  createWhatsAppUrl,
  createMailtoUrl,
  generateVendedorWhatsAppMessage,
  generateAdminWhatsAppMessage,
  generateClientWhatsAppMessage,
  generateUserSignedReminder,
} from '../utils/whatsapp';
import type { ReceiptModalData } from './PaymentReceiptModal';
import { getVisitOutcomeMeta } from './CollectionVisitModal';

interface BoletaCardProps {
  boleta: Boleta;
  config: DistributorConfig;
  clients: Client[];
  salespeople: Salesperson[];
  admins: Administrator[];
  onMarkAsPaid: (boleta: Boleta) => void;
  onOpenPartialPaymentModal?: (boleta: Boleta) => void;
  onOpenExtendModal?: (boleta: Boleta) => void;
  onOpenVisitModal?: (boleta: Boleta) => void;
  onOpenCreditNoteModal?: (boleta: Boleta) => void;
  onOpenReceipt?: (receipt: ReceiptModalData) => void;
  onQuickSendStatement?: (boleta: Boleta) => void;
  onDelete: (boletaId: string) => void;
  onRecordReminder?: (boletaId: string, type: any, channel: 'whatsapp' | 'email', recipient: string) => void;
}

export const BoletaCard: React.FC<BoletaCardProps> = ({
  boleta,
  config,
  clients,
  salespeople,
  admins,
  onMarkAsPaid,
  onOpenPartialPaymentModal,
  onOpenExtendModal,
  onOpenVisitModal,
  onOpenCreditNoteModal,
  onOpenReceipt,
  onQuickSendStatement,
  onDelete,
  onRecordReminder,
}) => {
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showMessagePreviewModal, setShowMessagePreviewModal] = useState(false);
  const [clientDisabledNotice, setClientDisabledNotice] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [previewData, setPreviewData] = useState<{
    title: string;
    recipientName: string;
    recipientPhone: string;
    messageText: string;
    type: any;
  } | null>(null);

  const status = calculateAlertStatus(boleta, config);
  const balance = getBoletaBalance(boleta);
  const client = clients.find((c) => c.id === boleta.clientId);
  const salesperson = salespeople.find((s) => s.id === boleta.salespersonId);
  const mainAdmin = admins.find((a) => a.receiveAdminAlerts) || admins[0];
  const activeAdmin = admins.find((a) => a.id === config.activeAdminId) || mainAdmin;

  const handleOpenVendedorWhatsApp = () => {
    const msg = generateUserSignedReminder(
      boleta,
      salesperson,
      activeAdmin.name,
      config,
      config.customCobranzaTemplate
    );
    const phone = salesperson?.phone || boleta.salespersonPhone || '';
    setPreviewData({
      title: `Aviso WhatsApp al Vendedor (Firma: ${activeAdmin.name})`,
      recipientName: salesperson?.name || boleta.salespersonName,
      recipientPhone: phone,
      messageText: msg,
      type:
        status.category === 'overdue_today'
          ? 'vence_hoy'
          : status.category === 'admin_alert' || status.category === 'admin_6d'
          ? 'admin_5dias'
          : 'vendedor_3dias',
    });
    setShowMessagePreviewModal(true);
  };

  const handleOpenAdminWhatsApp = () => {
    const msg = generateAdminWhatsAppMessage(boleta, mainAdmin, config);
    const phone = mainAdmin?.phone || '';
    setPreviewData({
      title: 'Alerta WhatsApp a Administrador / Dueño',
      recipientName: mainAdmin?.name || 'Administración',
      recipientPhone: phone,
      messageText: msg,
      type: 'admin_5dias',
    });
    setShowMessagePreviewModal(true);
  };

  const handleOpenClientWhatsApp = () => {
    if (!config.enableClientWhatsAppReminders) {
      setClientDisabledNotice(true);
      setTimeout(() => setClientDisabledNotice(false), 5000);
      return;
    }
    const msg = generateClientWhatsAppMessage(boleta, client, config);
    const phone = client?.phone || boleta.clientPhone || '';
    setPreviewData({
      title: 'Aviso WhatsApp al Cliente (Recordatorio de Factura)',
      recipientName: client?.name || boleta.clientName,
      recipientPhone: phone,
      messageText: msg,
      type: 'manual',
    });
    setShowMessagePreviewModal(true);
  };

  const handleDispatchWhatsApp = () => {
    if (!previewData) return;
    const url = createWhatsAppUrl(previewData.recipientPhone, previewData.messageText);
    window.open(url, '_blank', 'noopener,noreferrer');
    if (onRecordReminder) {
      onRecordReminder(boleta.id, previewData.type, 'whatsapp', previewData.recipientName);
    }
    setShowMessagePreviewModal(false);
  };

  const handleSendEmail = () => {
    const targetEmail = salesperson?.email || mainAdmin?.email || '';
    const subject = `[${config.distributorName}] Cobranza Boleta #${boleta.boletaNumber} - ${boleta.clientName}`;
    const body = generateVendedorWhatsAppMessage(boleta, salesperson, config);
    const mailto = createMailtoUrl(targetEmail, subject, body);
    window.location.href = mailto;
    if (onRecordReminder) {
      onRecordReminder(boleta.id, 'manual', 'email', targetEmail);
    }
  };

  return (
    <div
      className={`relative rounded-xl border bg-white dark:bg-[#0B1933] shadow-xs transition-colors flex flex-col justify-between ${
        status.isUrgentAlertMode
          ? 'border-[#B91C1C] dark:border-rose-500/70'
          : status.category === 'overdue_today' || status.category === 'critical_overdue_grace'
          ? 'border-rose-400 dark:border-rose-500/50'
          : status.category === 'admin_6d' || status.category === 'admin_alert'
          ? 'border-amber-400 dark:border-amber-500/40'
          : 'border-[#CBD5E1] dark:border-[#B6C2D2]/20 hover:border-[#94A3B8]'
      }`}
    >
      {/* Sober Crimson Priority Header for 10+ Days Overdue */}
      {status.isUrgentAlertMode && (
        <div className="bg-[#991B1B] text-white px-3.5 py-1.5 flex items-center justify-between text-xs font-bold tracking-wide rounded-t-[10px]">
          <div className="flex items-center gap-1.5 tabular-nums">
            <Flame className="w-3.5 h-3.5 text-amber-300" />
            <span>PRIORIDAD URGENTE · +{status.daysElapsed} DÍAS SIN COBRO</span>
          </div>
          <span className="bg-black/25 text-[10px] font-mono px-2 py-0.5 rounded border border-white/20">
            MORA
          </span>
        </div>
      )}

      {/* Top Status Bar */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 border-b border-slate-200/80 dark:border-[#B6C2D2]/15 ${
          status.isUrgentAlertMode
            ? 'bg-rose-50/70 dark:bg-rose-950/25'
            : 'bg-[#F8FAFC] dark:bg-[#0F2142]'
        } ${!status.isUrgentAlertMode ? 'rounded-t-xl' : ''}`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono tabular-nums font-bold text-sm text-[#0B1933] dark:text-white">
            #{boleta.boletaNumber}
          </span>
          {boleta.isSigned && (
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              · Firmada
            </span>
          )}
          {boleta.installmentNumber && boleta.totalInstallments && (
            <span className="text-[10px] font-mono font-bold bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428] px-2 py-0.5 rounded">
              Cuota {boleta.installmentNumber}/{boleta.totalInstallments}
            </span>
          )}
          {boleta.saleMode === 'sena_reserva' && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700 px-2 py-0.5 rounded">
              Reserva c/ Seña
            </span>
          )}
          {boleta.extensionDays ? (
            <span
              className="text-[11px] font-mono tabular-nums font-bold text-[#162E59] dark:text-[#E2E8F0] bg-[#E9EEF5] dark:bg-[#162E59] px-2 py-0.5 rounded border border-[#CBD5E1] dark:border-[#B6C2D2]/25"
              title={`Prórroga concedida: +${boleta.extensionDays} días. Vencimiento original: ${formatDateEs(boleta.originalDueDate || '')}`}
            >
              +{boleta.extensionDays}d prórroga
            </span>
          ) : null}
          {boleta.photoUrl && (
            <button
              type="button"
              onClick={() => setShowPhotoModal(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#162E59] dark:text-[#CBD5E1] hover:underline cursor-pointer"
            >
              <ImageIcon className="w-3 h-3" />
              <span>Ver Foto</span>
            </button>
          )}
        </div>

        {/* Dynamic Status Indicator */}
        <span
          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md border tabular-nums ${status.badgeColor}`}
        >
          {status.categoryLabel}
        </span>
      </div>

      {/* Card Content Body */}
      <div className="p-4 space-y-3 flex-1">
        {/* Client & Amount Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-bold text-base text-[#0B1933] dark:text-white truncate">
                {boleta.clientName}
              </h3>
              {client && (client.creditHistory?.reputationStatus === 'problematico' || (client.creditHistory?.totalPurgedUnpaid || 0) > 0) && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700"
                  title="Cliente calificado como problemático en su historial crediticio"
                >
                  Problemático
                </span>
              )}
              {client && client.creditHistory?.reputationStatus === 'regular' && !(client.creditHistory?.totalPurgedUnpaid) && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700"
                  title="Cliente con demoras ocasionales"
                >
                  Regular
                </span>
              )}
            </div>
            {client?.contactPerson && client.contactPerson !== boleta.clientName && (
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                Contacto: {client.contactPerson}
              </p>
            )}
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-[#94A3B8] mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-[#8D9CB0] shrink-0" />
              <span className="truncate">{boleta.clientAddress || client?.address || 'Sin dirección registrada'}</span>
            </div>
            {boleta.itemSummary && (
              <p className="text-[11px] font-medium text-[#0B1933] dark:text-[#CBD5E1] mt-1 truncate">
                Detalle: {boleta.itemSummary}
              </p>
            )}
            {boleta.items && boleta.items.length > 0 && (
              <div className="mt-1.5 p-2 rounded-lg bg-[#F4F6F9] dark:bg-[#091428] border border-slate-200 dark:border-[#B6C2D2]/15 space-y-0.5 text-[11px] tabular-nums">
                {boleta.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-2">
                    <span className="text-[#0B1933] dark:text-[#E2E8F0] truncate">
                      {it.quantity}x {it.name}{' '}
                      <span className="text-[10px] text-slate-500 dark:text-[#94A3B8]">
                        · {it.paymentMode === 'contado_hoy' ? '1 Pago Hoy' : it.paymentMode === 'un_pago_fiado' ? '1 Pago Fiado' : 'En Cuotas'}
                      </span>
                    </span>
                    <span className="font-mono font-semibold text-[#0B1933] dark:text-white shrink-0">
                      {formatCurrency(it.subtotal, config.currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {(boleta.lateSurchargeApplied || boleta.earlyPaymentDiscountApplied) && (
              <div className="flex flex-wrap gap-2 mt-1 text-[10px] font-mono">
                {boleta.lateSurchargeApplied ? (
                  <span className="text-amber-700 dark:text-amber-300 font-bold">
                    +Recargo: {formatCurrency(boleta.lateSurchargeApplied, config.currencySymbol)}
                  </span>
                ) : null}
                {boleta.earlyPaymentDiscountApplied ? (
                  <span className="text-emerald-700 dark:text-emerald-300 font-bold">
                    -Interés adelantado: {formatCurrency(boleta.earlyPaymentDiscountApplied, config.currencySymbol)}
                  </span>
                ) : null}
              </div>
            )}
            {(boleta.promisedPaymentDate || boleta.lastVisitOutcome) && (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[10px]">
                {boleta.lastVisitOutcome && (
                  <span
                    className={`px-1.5 py-0.5 rounded border font-bold tabular-nums ${
                      getVisitOutcomeMeta(boleta.lastVisitOutcome).badgeClass
                    }`}
                    title={boleta.lastVisitNote || 'Última visita registrada'}
                  >
                    {getVisitOutcomeMeta(boleta.lastVisitOutcome).shortLabel}
                    {boleta.lastVisitDate ? ` · ${formatDateEs(boleta.lastVisitDate)}` : ''}
                  </span>
                )}
                {boleta.promisedPaymentDate && (
                  <span className="px-1.5 py-0.5 rounded border bg-[#E9EEF5] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0] border-[#CBD5E1] dark:border-[#B6C2D2]/25 font-mono font-semibold tabular-nums">
                    Agenda: {formatDateEs(boleta.promisedPaymentDate)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="text-right shrink-0">
            {balance.hasPartialPayments || balance.hasCreditNotes ? (
              <div>
                <span className="text-[10px] text-slate-400 block line-through tabular-nums font-mono">
                  Orig: {formatCurrency(balance.originalAmount, config.currencySymbol)}
                </span>
                {balance.hasCreditNotes && (
                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 block tabular-nums font-mono">
                    Devolución/NC: -{formatCurrency(balance.totalCreditNotes, config.currencySymbol)}
                  </span>
                )}
                {balance.hasPartialPayments && (
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 block tabular-nums">
                    Entregado: -{formatCurrency(balance.totalPaid, config.currencySymbol)} ({balance.percentagePaid}%)
                  </span>
                )}
                <p className="text-[10px] font-bold text-[#991B1B] dark:text-rose-400 uppercase tracking-wider mt-0.5">
                  Saldo a Cobrar
                </p>
                <p className="text-xl font-black text-[#991B1B] dark:text-rose-400 tracking-tight font-mono tabular-nums">
                  {formatCurrency(balance.balanceDue, config.currencySymbol)}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Monto a Cobrar</p>
                <p className="text-xl font-black text-[#0B1933] dark:text-white tracking-tight font-mono tabular-nums">
                  {formatCurrency(boleta.amount, config.currencySymbol)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Partial Payments Progress Bar */}
        {balance.hasPartialPayments && (
          <div className="p-2.5 rounded-lg bg-[#F8FAFC] dark:bg-[#0F2142] border border-slate-200 dark:border-[#B6C2D2]/20 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-[#0B1933] dark:text-[#E2E8F0] flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5 text-amber-600" />
                <span>Entregas a cuenta ({boleta.partialPayments?.length})</span>
              </span>
              <span className="text-emerald-700 dark:text-emerald-300 font-mono tabular-nums">
                {balance.percentagePaid}% cubierto
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-[#071021] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all"
                style={{ width: `${balance.percentagePaid}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-[#94A3B8] tabular-nums">
              <span>Última: {formatDateEs(boleta.partialPayments?.[boleta.partialPayments.length - 1]?.date || '')}</span>
              <div className="flex items-center gap-2">
                {onOpenReceipt && boleta.partialPayments && boleta.partialPayments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const list = boleta.partialPayments || [];
                      const lastP = list[list.length - 1];
                      onOpenReceipt({
                        receiptNumber: lastP.receiptNumber || `REC-P${list.length}`,
                        boletaNumber: boleta.boletaNumber,
                        clientId: boleta.clientId,
                        clientName: boleta.clientName,
                        clientAddress: boleta.clientAddress || client?.address,
                        salespersonName: boleta.salespersonName,
                        paymentDate: lastP.date,
                        amountPaidNow: lastP.amount,
                        paymentMethod: lastP.paymentMethod,
                        originalAmount: balance.originalAmount,
                        totalPaidAccumulated: balance.totalPaid,
                        remainingBalance: balance.balanceDue,
                        receivedBy: lastP.receivedBy,
                        notes: lastP.notes,
                        isFullSettlement: balance.balanceDue <= 0,
                        initialPhone: client?.phone || boleta.clientPhone || '',
                      });
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] font-semibold text-[10px] cursor-pointer"
                    title="Abrir recibo de pago parcial para enviar por WhatsApp"
                  >
                    <MessageCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span>Recibo WA</span>
                  </button>
                )}
                <span className="font-bold text-[#991B1B] dark:text-rose-400 font-mono">
                  Resta: {formatCurrency(balance.balanceDue, config.currencySymbol)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Salesperson & Timeline Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-[#F4F6F9] dark:bg-[#091428] p-2.5 rounded-lg border border-slate-200/80 dark:border-[#B6C2D2]/15">
          <div>
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-[#CBD5E1] font-medium">
              <Bike className="w-3.5 h-3.5 text-[#1E3A6D] dark:text-[#94A3B8]" />
              <span>
                Vendedor: <strong className="text-[#0B1933] dark:text-white">{boleta.salespersonName}</strong>
              </span>
            </div>
            {salesperson?.phone && (
              <p className="text-[11px] text-slate-500 dark:text-[#8D9CB0] ml-5 font-mono tabular-nums">{salesperson.phone}</p>
            )}
          </div>

          <div className="tabular-nums">
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-[#CBD5E1]">
              <Calendar className="w-3.5 h-3.5 text-[#1E3A6D] dark:text-[#94A3B8]" />
              <span>
                Venta: {formatDateEs(boleta.saleDate)} (<strong>{status.daysElapsed}d</strong>)
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-[#CBD5E1] mt-0.5">
              <Clock className="w-3.5 h-3.5 text-[#8D9CB0]" />
              <span>
                Vence ({boleta.termDays}d):{' '}
                <strong className={status.isOverdueOrToday ? 'text-[#991B1B] dark:text-rose-400 font-bold' : 'text-[#0B1933] dark:text-white'}>
                  {formatDateEs(boleta.dueDate)}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* Notes if any */}
        {boleta.notes && (
          <p className="text-xs text-slate-600 dark:text-[#CBD5E1] italic bg-[#F8FAFC] dark:bg-[#0F2142] px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#B6C2D2]/15">
            "{boleta.notes}"
          </p>
        )}

        {/* Action Message Bar */}
        <div className="text-xs font-medium text-slate-600 dark:text-[#94A3B8] flex items-center justify-between gap-2 pt-0.5">
          <span>{status.actionMessage}</span>
          {boleta.remindersLog && boleta.remindersLog.length > 0 && (
            <span className="text-[11px] text-slate-400 tabular-nums">
              {boleta.remindersLog.length} aviso(s)
            </span>
          )}
        </div>

        {clientDisabledNotice && (
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-[11px] text-amber-900 dark:text-amber-200 flex items-start justify-between gap-2">
            <span>
              <strong>WhatsApp a clientes desactivado:</strong> Activá esta opción en <strong>Ajustes y Dueños</strong> para enviar recordatorios directos al cliente.
            </span>
            <button
              type="button"
              onClick={() => setClientDisabledNotice(false)}
              className="text-amber-700 dark:text-amber-300 font-bold px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Card Action Footer */}
      <div className="px-4 py-3 bg-[#F8FAFC] dark:bg-[#091428] border-t border-slate-200/80 dark:border-[#B6C2D2]/15 rounded-b-xl flex flex-wrap items-center justify-between gap-2">
        {/* Communication triggers */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={handleOpenVendedorWhatsApp}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white transition-colors cursor-pointer"
            title="Enviar recordatorio por WhatsApp al vendedor asignado"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WA Vendedor</span>
          </button>

          {status.shouldNotifyAdmin && (
            <button
              type="button"
              onClick={handleOpenAdminWhatsApp}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-400/50 transition-colors cursor-pointer"
              title="Avisar a administradores/dueños por WhatsApp"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Dueños</span>
            </button>
          )}

          {config.enableClientWhatsAppReminders ? (
            <button
              type="button"
              onClick={handleOpenClientWhatsApp}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
              title="Enviar recordatorio de boleta directamente al cliente por WhatsApp"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WA Cliente</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenClientWhatsApp}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#0F2142] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border border-slate-200 dark:border-[#B6C2D2]/20 transition-colors cursor-pointer"
              title="Envío directo a clientes desactivado (activable en Ajustes y Dueños)"
            >
              <User className="w-3 h-3 opacity-60" />
              <span className="line-through opacity-75">Cliente</span>
            </button>
          )}

          {onQuickSendStatement && (
            <button
              type="button"
              onClick={() => onQuickSendStatement(boleta)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] transition-colors cursor-pointer"
              title="Enviar Estado de Cuenta completo al cliente por WhatsApp (Escrito, Imagen PNG o PDF sin link)"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Estado Cta. WA</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSendEmail}
            className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-500 hover:text-[#0B1933] dark:text-[#94A3B8] dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#13264A] transition-colors cursor-pointer"
            title="Enviar recordatorio por Correo Electrónico"
          >
            <Mail className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Primary actions: Prorrogar, Partial Payment, Mark as Paid & Delete */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {onOpenReceipt && (
            <button
              type="button"
              onClick={() =>
                onOpenReceipt({
                  receiptNumber: `COMP-${boleta.boletaNumber}`,
                  boletaNumber: boleta.boletaNumber,
                  clientId: boleta.clientId,
                  clientName: boleta.clientName,
                  clientAddress: boleta.clientAddress || client?.address,
                  salespersonName: boleta.salespersonName,
                  paymentDate: boleta.saleDate,
                  amountPaidNow: balance.totalPaid + (boleta.downPayment || 0),
                  paymentMethod: boleta.paymentMethod || 'efectivo',
                  originalAmount: balance.originalAmount + (boleta.downPayment || 0),
                  totalPaidAccumulated: balance.totalPaid + (boleta.downPayment || 0),
                  remainingBalance: balance.balanceDue,
                  receivedBy: boleta.salespersonName,
                  notes: boleta.notes || boleta.itemSummary,
                  isFullSettlement: balance.balanceDue <= 0,
                  initialPhone: client?.phone || boleta.clientPhone || '',
                  items: boleta.items,
                  saleModeLabel:
                    boleta.totalInstallments && boleta.installmentNumber
                      ? `CUOTA ${boleta.installmentNumber}/${boleta.totalInstallments}`
                      : boleta.saleMode === 'sena_reserva'
                      ? 'RESERVA C/ SEÑA'
                      : 'COMPROBANTE DE COMPRA',
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#F4F6F9] hover:bg-[#E9EEF5] dark:bg-[#0F2142] dark:hover:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 transition-colors cursor-pointer"
              title="Ver / descargar comprobante visual PNG"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Comprobante</span>
            </button>
          )}

          {onOpenVisitModal && (
            <button
              type="button"
              onClick={() => onOpenVisitModal(boleta)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] border border-[#94A3B8]/50 dark:border-[#B6C2D2]/30 transition-colors cursor-pointer"
              title="Registrar visita en calle o promesa de pago"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Visita</span>
            </button>
          )}

          {onOpenExtendModal && (
            <button
              type="button"
              onClick={() => onOpenExtendModal(boleta)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] border border-[#94A3B8]/50 dark:border-[#B6C2D2]/30 transition-colors cursor-pointer"
              title="Prorrogar vencimiento de la boleta otorgando días adicionales"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Prorrogar</span>
            </button>
          )}

          {onOpenPartialPaymentModal && (
            <button
              type="button"
              onClick={() => onOpenPartialPaymentModal(boleta)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer"
              title="Registrar una entrega a cuenta / pago parcial"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Parcial</span>
            </button>
          )}

          {config.businessRubro === 'indumentaria' && onOpenCreditNoteModal && (
            <button
              type="button"
              onClick={() => onOpenCreditNoteModal(boleta)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#F4F6F9] hover:bg-[#E9EEF5] dark:bg-[#0F2142] dark:hover:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 transition-colors cursor-pointer"
              title="Registrar devolución o Nota de Crédito (Rubro Indumentaria)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Devolución</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onMarkAsPaid(boleta)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] transition-colors cursor-pointer"
            title="Marcar como cobrado/pagado y mover al historial"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{balance.hasPartialPayments ? 'Liquidar' : 'Cobrada'}</span>
          </button>

          {confirmDelete ? (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onDelete(boleta.id);
                  setConfirmDelete(false);
                }}
                className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold cursor-pointer"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
              title="Eliminar boleta del sistema"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* WhatsApp Message Preview Modal */}
      {showMessagePreviewModal && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050C18]/75 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-[#B6C2D2]/15">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-[#0B1933] dark:text-white text-sm">
                    {previewData.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                    Destinatario: <strong className="text-[#0B1933] dark:text-white">{previewData.recipientName}</strong> ({previewData.recipientPhone || 'Sin número'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMessagePreviewModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-[#94A3B8] block mb-1.5">
                Mensaje preconfigurado (editable antes de enviar):
              </label>
              <textarea
                value={previewData.messageText}
                onChange={(e) =>
                  setPreviewData({ ...previewData, messageText: e.target.value })
                }
                rows={9}
                className="w-full text-xs font-mono p-3 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#071021] text-slate-800 dark:text-[#E2E8F0] focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#B6C2D2]/15">
              <button
                type="button"
                onClick={() => setShowMessagePreviewModal(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-[#13264A] rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDispatchWhatsApp}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Abrir en WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Modal */}
      {showPhotoModal && boleta.photoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050C18]/80 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl max-w-xl w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#B6C2D2]/15 pb-2">
              <h4 className="font-bold text-sm text-[#0B1933] dark:text-white">
                Comprobante Firmado - Boleta #{boleta.boletaNumber}
              </h4>
              <button
                type="button"
                onClick={() => setShowPhotoModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center rounded-lg bg-slate-100 dark:bg-[#071021] p-2">
              <img
                src={boleta.photoUrl}
                alt={`Boleta ${boleta.boletaNumber}`}
                className="max-h-full max-w-full rounded object-contain"
              />
            </div>
            <div className="text-right">
              <button
                type="button"
                onClick={() => setShowPhotoModal(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428] rounded-lg cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
