import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarCheck,
  CalendarRange,
  Search,
  CheckCircle2,
  Clock,
  Receipt,
  MessageCircle,
  User,
  Image as ImageIcon,
  PlusCircle,
  AlertTriangle,
  MapPin,
  Package,
  Filter,
  ClipboardCheck,
  FileText,
} from 'lucide-react';
import {
  Boleta,
  Client,
  Salesperson,
  Administrator,
  DistributorConfig,
  ReminderLog,
} from '../types';
import {
  calculateAlertStatus,
  formatCurrency,
  formatDateEs,
  getBoletaBalance,
} from '../utils/alerts';
import {
  computeDailyClosingMetrics,
  createWhatsAppUrl,
  generateClientWhatsAppMessage,
  generateUserSignedReminder,
} from '../utils/whatsapp';
import { getBusinessLabels } from '../utils/businessMode';
import { ReceiptModalData } from './PaymentReceiptModal';
import { getVisitOutcomeMeta } from './CollectionVisitModal';

export type AgendaHorizon = 'hoy' | '3d' | '7d';

interface QuickCollectionAgendaViewProps {
  boletas: Boleta[];
  paidBoletas: Boleta[];
  clients: Client[];
  salespeople: Salesperson[];
  admins: Administrator[];
  config: DistributorConfig;
  currentDateRef: string;
  activeUserName: string;
  onMarkAsPaid: (boleta: Boleta) => void;
  onOpenPartialPaymentModal: (boleta: Boleta) => void;
  onOpenExtendModal: (boleta: Boleta) => void;
  onOpenVisitModal: (boleta: Boleta) => void;
  onOpenReceipt: (receipt: ReceiptModalData) => void;
  onQuickSendStatement?: (boleta: Boleta) => void;
  onRecordReminder: (
    boletaId: string,
    type: ReminderLog['type'],
    channel: 'whatsapp' | 'email',
    recipient: string
  ) => void;
  onOpenNewBoleta: () => void;
}

interface AnnotatedAgendaItem {
  boleta: Boleta;
  balanceDue: number;
  originalAmount: number;
  totalPaid: number;
  percentagePaid: number;
  hasPartialPayments: boolean;
  effectiveDate: string; // promisedPaymentDate || dueDate
  diffDays: number; // respecto a effectiveDate (< 0 atrasada/incumplida, 0 hoy, > 0 próximo)
  dueDiffDays: number; // respecto a dueDate real
  client?: Client;
  salesperson?: Salesperson;
  isUrgent: boolean;
}

function getDiffDays(dueDateStr: string, refDateStr: string): number {
  const due = new Date(`${dueDateStr}T12:00:00`).getTime();
  const ref = new Date(`${refDateStr}T12:00:00`).getTime();
  return Math.round((due - ref) / (1000 * 60 * 60 * 24));
}

function getDayHeadline(diffDays: number, dueDateStr: string): string {
  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return `Atrasada hace ${abs} día${abs === 1 ? '' : 's'} (Venció ${formatDateEs(dueDateStr)})`;
  }
  if (diffDays === 0) return `Vence HOY (${formatDateEs(dueDateStr)})`;
  if (diffDays === 1) return `Mañana · En 1 día (${formatDateEs(dueDateStr)})`;
  return `En ${diffDays} días (${formatDateEs(dueDateStr)})`;
}

export const QuickCollectionAgendaView: React.FC<QuickCollectionAgendaViewProps> = ({
  boletas,
  paidBoletas,
  clients,
  salespeople,
  config,
  currentDateRef,
  activeUserName,
  onMarkAsPaid,
  onOpenPartialPaymentModal,
  onOpenExtendModal,
  onOpenVisitModal,
  onOpenReceipt,
  onQuickSendStatement,
  onRecordReminder,
  onOpenNewBoleta,
}) => {
  const [horizon, setHorizon] = useState<AgendaHorizon>('hoy');
  const [hoyScope, setHoyScope] = useState<'all_due' | 'only_today' | 'only_overdue'>('all_due');
  const [sevenDayScope, setSevenDayScope] = useState<'1_to_7' | '4_to_7'>('1_to_7');
  const [searchTerm, setSearchTerm] = useState('');
  const [salespersonFilter, setSalespersonFilter] = useState<string>('all');
  const [noticeText, setNoticeText] = useState<string | null>(null);

  const labels = getBusinessLabels(config);
  const sym = config.currencySymbol || '$';

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    for (const c of clients) map.set(c.id, c);
    return map;
  }, [clients]);

  const sellerMap = useMemo(() => {
    const map = new Map<string, Salesperson>();
    for (const s of salespeople) map.set(s.id, s);
    return map;
  }, [salespeople]);

  const dailyMetrics = useMemo(
    () => computeDailyClosingMetrics(boletas, paidBoletas, currentDateRef),
    [boletas, paidBoletas, currentDateRef]
  );

  // Filter base (search + salesperson) before bucketing so counts & totals match filters cleanly
  const annotatedPending = useMemo<AnnotatedAgendaItem[]>(() => {
    const q = searchTerm.trim().toLowerCase();
    return boletas
      .filter((b) => b.status === 'pending')
      .filter((b) => {
        if (salespersonFilter !== 'all' && b.salespersonId !== salespersonFilter) return false;
        if (!q) return true;
        const cl = clientMap.get(b.clientId);
        return (
          b.clientName.toLowerCase().includes(q) ||
          b.boletaNumber.toLowerCase().includes(q) ||
          b.salespersonName.toLowerCase().includes(q) ||
          (b.itemSummary || '').toLowerCase().includes(q) ||
          (b.clientAddress || cl?.address || '').toLowerCase().includes(q) ||
          (b.notes || '').toLowerCase().includes(q)
        );
      })
      .map((b) => {
        const bal = getBoletaBalance(b);
        const effectiveDate = b.promisedPaymentDate || b.dueDate;
        const diffDays = getDiffDays(effectiveDate, currentDateRef);
        const dueDiffDays = getDiffDays(b.dueDate, currentDateRef);
        const st = calculateAlertStatus(b, config, currentDateRef);
        return {
          boleta: b,
          balanceDue: bal.balanceDue,
          originalAmount: bal.originalAmount,
          totalPaid: bal.totalPaid,
          percentagePaid: bal.percentagePaid,
          hasPartialPayments: bal.hasPartialPayments,
          effectiveDate,
          diffDays,
          dueDiffDays,
          client: clientMap.get(b.clientId),
          salesperson: sellerMap.get(b.salespersonId),
          isUrgent: st.isUrgentAlertMode || diffDays < 0,
        };
      })
      .filter((item) => item.balanceDue > 0);
  }, [boletas, searchTerm, salespersonFilter, clientMap, sellerMap, currentDateRef, config]);

  const buckets = useMemo(() => {
    const dueTodayExact = annotatedPending.filter((i) => i.diffDays === 0);
    const overdue = annotatedPending
      .filter((i) => i.diffDays < 0)
      .sort((a, b) => a.diffDays - b.diffDays || b.balanceDue - a.balanceDue);
    const hoyAll = [...overdue, ...dueTodayExact.sort((a, b) => b.balanceDue - a.balanceDue)];

    const within3Days = annotatedPending
      .filter((i) => i.diffDays >= 1 && i.diffDays <= 3)
      .sort((a, b) => a.diffDays - b.diffDays || b.balanceDue - a.balanceDue);

    const days4to7 = annotatedPending
      .filter((i) => i.diffDays >= 4 && i.diffDays <= 7)
      .sort((a, b) => a.diffDays - b.diffDays || b.balanceDue - a.balanceDue);

    const within7Days = [...within3Days, ...days4to7].sort(
      (a, b) => a.diffDays - b.diffDays || b.balanceDue - a.balanceDue
    );

    const sum = (list: AnnotatedAgendaItem[]) => list.reduce((acc, x) => acc + x.balanceDue, 0);

    return {
      dueTodayExact,
      overdue,
      hoyAll,
      hoyTotal: sum(hoyAll),
      todayExactTotal: sum(dueTodayExact),
      overdueTotal: sum(overdue),
      within3Days,
      threeDaysTotal: sum(within3Days),
      days4to7,
      days4to7Total: sum(days4to7),
      within7Days,
      sevenDaysTotal: sum(within7Days),
    };
  }, [annotatedPending]);

  const activeItems = useMemo(() => {
    if (horizon === 'hoy') {
      if (hoyScope === 'only_today') return buckets.dueTodayExact;
      if (hoyScope === 'only_overdue') return buckets.overdue;
      return buckets.hoyAll;
    }
    if (horizon === '3d') return buckets.within3Days;
    return sevenDayScope === '4_to_7' ? buckets.days4to7 : buckets.within7Days;
  }, [horizon, hoyScope, sevenDayScope, buckets]);

  // Group active items by date for clean visual scanning
  const groupedSections = useMemo(() => {
    if (horizon === 'hoy') {
      const sections: { key: string; title: string; subtitle: string; tone: 'crimson' | 'navy'; items: AnnotatedAgendaItem[] }[] = [];
      const overdueItems = activeItems.filter((i) => i.diffDays < 0);
      const todayItems = activeItems.filter((i) => i.diffDays === 0);

      if (todayItems.length > 0) {
        sections.push({
          key: 'due-today',
          title: `Vencen Hoy (${formatDateEs(currentDateRef)})`,
          subtitle: 'Compromisos con fecha de cobro programada para hoy',
          tone: 'navy',
          items: todayItems,
        });
      }
      if (overdueItems.length > 0) {
        sections.push({
          key: 'overdue-pending',
          title: 'Atrasadas / Vencidas pendientes de cobro hoy',
          subtitle: 'Saldo exigible ya vencido que requiere gestión en la jornada',
          tone: 'crimson',
          items: overdueItems,
        });
      }
      return sections;
    }

    const byDate = new Map<string, AnnotatedAgendaItem[]>();
    for (const item of activeItems) {
      const key = item.effectiveDate;
      const arr = byDate.get(key) || [];
      arr.push(item);
      byDate.set(key, arr);
    }

    return Array.from(byDate.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([targetDateStr, items]) => {
        const diffDays = items[0]?.diffDays ?? 0;
        return {
          key: targetDateStr,
          title: getDayHeadline(diffDays, targetDateStr),
          subtitle:
            diffDays <= 3
              ? 'Tramo corto (en 3 días) · Incluye vencimientos y promesas agendadas'
              : 'Tramo semanal (4 a 7 días) · Planificación preventiva de caja',
          tone: 'navy' as const,
          items,
        };
      });
  }, [horizon, activeItems, currentDateRef]);

  const showNotice = (msg: string) => {
    setNoticeText(msg);
    setTimeout(() => setNoticeText(null), 4000);
  };

  const handleOpenWhatsAppClient = (item: AnnotatedAgendaItem) => {
    if (!config.enableClientWhatsAppReminders) {
      showNotice('Los recordatorios por WhatsApp a clientes están desactivados en Ajustes.');
      return;
    }
    const msg = generateClientWhatsAppMessage(item.boleta, item.client, config);
    const phone = item.client?.phone || item.boleta.clientPhone || '';
    const url = createWhatsAppUrl(phone, msg);
    window.open(url, '_blank', 'noopener,noreferrer');
    onRecordReminder(
      item.boleta.id,
      item.diffDays <= 0 ? 'vence_hoy' : 'manual',
      'whatsapp',
      item.client?.name || item.boleta.clientName
    );
  };

  const handleOpenWhatsAppSeller = (item: AnnotatedAgendaItem) => {
    const msg = generateUserSignedReminder(
      item.boleta,
      item.salesperson,
      activeUserName,
      config,
      config.customCobranzaTemplate
    );
    const phone = item.salesperson?.phone || item.boleta.salespersonPhone || '';
    const url = createWhatsAppUrl(phone, msg);
    window.open(url, '_blank', 'noopener,noreferrer');
    onRecordReminder(
      item.boleta.id,
      item.diffDays <= 0 ? 'vence_hoy' : 'vendedor_3dias',
      'whatsapp',
      item.salesperson?.name || item.boleta.salespersonName
    );
  };

  const handleOpenVisualReceipt = (item: AnnotatedAgendaItem) => {
    const b = item.boleta;
    onOpenReceipt({
      receiptNumber: `COMP-${b.boletaNumber}`,
      boletaNumber: b.boletaNumber,
      clientId: b.clientId,
      clientName: b.clientName,
      clientAddress: b.clientAddress || item.client?.address,
      salespersonName: b.salespersonName,
      paymentDate: b.saleDate,
      amountPaidNow: item.totalPaid + (b.downPayment || 0),
      paymentMethod: b.paymentMethod || 'efectivo',
      originalAmount: item.originalAmount + (b.downPayment || 0),
      totalPaidAccumulated: item.totalPaid + (b.downPayment || 0),
      remainingBalance: item.balanceDue,
      receivedBy: b.salespersonName,
      notes: b.notes || b.itemSummary,
      isFullSettlement: item.balanceDue <= 0,
      initialPhone: item.client?.phone || b.clientPhone || '',
      items: b.items,
      saleModeLabel:
        b.totalInstallments && b.installmentNumber
          ? `CUOTA ${b.installmentNumber}/${b.totalInstallments}`
          : b.saleMode === 'sena_reserva'
          ? 'RESERVA C/ SEÑA'
          : 'ESTADO DE COMPROBANTE',
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-[#0B1933] text-white dark:bg-[#13264A] border border-[#B6C2D2]/25 shrink-0">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-extrabold text-[#0B1933] dark:text-white tracking-tight">
                Agenda Rápida de Cobros
              </h2>
              <span className="px-2 py-0.5 rounded bg-[#E9EEF5] dark:bg-[#13264A] text-[#0B1933] dark:text-[#CBD5E1] font-mono text-[11px] font-semibold tabular-nums border border-[#CBD5E1] dark:border-[#B6C2D2]/25">
                Ref: {formatDateEs(currentDateRef)}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-[#94A3B8] mt-0.5">
              Organizá lo que hay para cobrar hoy, en 3 días y de acá a 7 días con cobro y WhatsApp en un clic.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700/40 text-xs tabular-nums">
            <span className="text-emerald-800 dark:text-emerald-300 font-semibold">Cobrado hoy: </span>
            <span className="font-mono font-bold text-emerald-900 dark:text-emerald-200">
              {formatCurrency(dailyMetrics.totalGeneralCobrado, sym)}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenNewBoleta}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Nueva {labels.saleSingular}</span>
          </button>
        </div>
      </div>

      {/* Inline Feedback Notice */}
      {noticeText && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{noticeText}</span>
        </div>
      )}

      {/* 3 Horizon Cards / Switcher */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* Bucket 1: HOY */}
        <button
          type="button"
          onClick={() => setHorizon('hoy')}
          className={`text-left rounded-xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
            horizon === 'hoy'
              ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#13264A] dark:border-[#CBD5E1]/50 shadow-sm'
              : 'bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white border-[#CBD5E1] dark:border-[#B6C2D2]/20 hover:border-[#0B1933]/50 dark:hover:border-[#CBD5E1]/40'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                horizon === 'hoy' ? 'text-[#CBD5E1]' : 'text-slate-500 dark:text-[#94A3B8]'
              }`}
            >
              1 · Para Cobrar Hoy
            </span>
            <div
              className={`p-1.5 rounded-lg ${
                horizon === 'hoy'
                  ? 'bg-[#1D3B6E] text-white'
                  : buckets.overdue.length > 0
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-[#991B1B] dark:text-rose-300'
                  : 'bg-[#E9EEF5] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0]'
              }`}
            >
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3">
            <div className="text-2xl font-black font-mono tabular-nums tracking-tight">
              {formatCurrency(buckets.hoyTotal, sym)}
            </div>
            <div
              className={`text-[11px] font-medium mt-1 tabular-nums flex items-center gap-2 flex-wrap ${
                horizon === 'hoy' ? 'text-[#CBD5E1]' : 'text-slate-600 dark:text-[#94A3B8]'
              }`}
            >
              <span>
                {buckets.dueTodayExact.length} vencen hoy ({formatCurrency(buckets.todayExactTotal, sym)})
              </span>
              {buckets.overdue.length > 0 && (
                <span
                  className={`font-bold ${
                    horizon === 'hoy' ? 'text-rose-300' : 'text-[#991B1B] dark:text-rose-400'
                  }`}
                >
                  · {buckets.overdue.length} atrasada{buckets.overdue.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Bucket 2: EN 3 DÍAS */}
        <button
          type="button"
          onClick={() => setHorizon('3d')}
          className={`text-left rounded-xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
            horizon === '3d'
              ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#13264A] dark:border-[#CBD5E1]/50 shadow-sm'
              : 'bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white border-[#CBD5E1] dark:border-[#B6C2D2]/20 hover:border-[#0B1933]/50 dark:hover:border-[#CBD5E1]/40'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                horizon === '3d' ? 'text-[#CBD5E1]' : 'text-slate-500 dark:text-[#94A3B8]'
              }`}
            >
              2 · En 3 Días
            </span>
            <div
              className={`p-1.5 rounded-lg ${
                horizon === '3d'
                  ? 'bg-[#1D3B6E] text-white'
                  : 'bg-[#E9EEF5] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0]'
              }`}
            >
              <Clock className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3">
            <div className="text-2xl font-black font-mono tabular-nums tracking-tight">
              {formatCurrency(buckets.threeDaysTotal, sym)}
            </div>
            <div
              className={`text-[11px] font-medium mt-1 tabular-nums ${
                horizon === '3d' ? 'text-[#CBD5E1]' : 'text-slate-600 dark:text-[#94A3B8]'
              }`}
            >
              {buckets.within3Days.length} {buckets.within3Days.length === 1 ? 'comprobante' : 'comprobantes'} entre mañana y 3 días
            </div>
          </div>
        </button>

        {/* Bucket 3: DE ACÁ A 7 DÍAS */}
        <button
          type="button"
          onClick={() => setHorizon('7d')}
          className={`text-left rounded-xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
            horizon === '7d'
              ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#13264A] dark:border-[#CBD5E1]/50 shadow-sm'
              : 'bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white border-[#CBD5E1] dark:border-[#B6C2D2]/20 hover:border-[#0B1933]/50 dark:hover:border-[#CBD5E1]/40'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                horizon === '7d' ? 'text-[#CBD5E1]' : 'text-slate-500 dark:text-[#94A3B8]'
              }`}
            >
              3 · De Acá a 7 Días
            </span>
            <div
              className={`p-1.5 rounded-lg ${
                horizon === '7d'
                  ? 'bg-[#1D3B6E] text-white'
                  : 'bg-[#E9EEF5] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0]'
              }`}
            >
              <CalendarRange className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3">
            <div className="text-2xl font-black font-mono tabular-nums tracking-tight">
              {formatCurrency(buckets.sevenDaysTotal, sym)}
            </div>
            <div
              className={`text-[11px] font-medium mt-1 tabular-nums ${
                horizon === '7d' ? 'text-[#CBD5E1]' : 'text-slate-600 dark:text-[#94A3B8]'
              }`}
            >
              {buckets.within7Days.length} en la próxima semana ({buckets.days4to7.length} entre 4 y 7 días)
            </div>
          </div>
        </button>
      </div>

      {/* Filters + Sub-scope Segmented Bar */}
      <div className="bg-white dark:bg-[#0B1933] p-3.5 sm:p-4 rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row gap-2.5 flex-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8D9CB0]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar cliente, comprobante, prenda/producto o dirección..."
              className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-[#0B1933] dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#162E59]"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
            <select
              value={salespersonFilter}
              onChange={(e) => setSalespersonFilter(e.target.value)}
              className="text-xs px-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#091428] text-[#0B1933] dark:text-[#E2E8F0] font-medium"
            >
              <option value="all">Todos los Vendedores</option>
              {salespeople.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.zone})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sub-filters tailored per active horizon */}
        {horizon === 'hoy' && (
          <div className="inline-flex rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-[#F4F6F9] dark:bg-[#071021] p-0.5 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setHoyScope('all_due')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                hoyScope === 'all_due'
                  ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-[#0B1933] dark:hover:text-white'
              }`}
            >
              Hoy + Atrasadas ({buckets.hoyAll.length})
            </button>
            <button
              type="button"
              onClick={() => setHoyScope('only_today')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                hoyScope === 'only_today'
                  ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-[#0B1933] dark:hover:text-white'
              }`}
            >
              Solo Vencen Hoy ({buckets.dueTodayExact.length})
            </button>
            <button
              type="button"
              onClick={() => setHoyScope('only_overdue')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                hoyScope === 'only_overdue'
                  ? 'bg-[#991B1B] text-white'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-[#991B1B] dark:hover:text-rose-300'
              }`}
            >
              Solo Atrasadas ({buckets.overdue.length})
            </button>
          </div>
        )}

        {horizon === '7d' && (
          <div className="inline-flex rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-[#F4F6F9] dark:bg-[#071021] p-0.5 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setSevenDayScope('1_to_7')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                sevenDayScope === '1_to_7'
                  ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-[#0B1933] dark:hover:text-white'
              }`}
            >
              Semana completa · 1 a 7 días ({buckets.within7Days.length})
            </button>
            <button
              type="button"
              onClick={() => setSevenDayScope('4_to_7')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                sevenDayScope === '4_to_7'
                  ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-[#0B1933] dark:hover:text-white'
              }`}
            >
              Solo 4 a 7 días ({buckets.days4to7.length})
            </button>
          </div>
        )}
      </div>

      {/* Agenda Sections */}
      {groupedSections.length === 0 ? (
        <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl p-12 text-center space-y-3">
          <CheckCircle2 className="w-11 h-11 mx-auto text-emerald-500/80" />
          <h3 className="text-sm font-bold text-[#0B1933] dark:text-white">
            {horizon === 'hoy'
              ? 'No hay cobros pendientes para hoy'
              : horizon === '3d'
              ? 'No hay vencimientos en los próximos 3 días'
              : 'No hay vencimientos programados de acá a 7 días'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-[#94A3B8] max-w-md mx-auto">
            {searchTerm || salespersonFilter !== 'all'
              ? 'Probá limpiar los filtros de búsqueda o vendedor para ver todos los vencimientos del tramo.'
              : 'Podés cambiar entre los apartados de Hoy, En 3 Días o De Acá a 7 Días para planificar los próximos ingresos.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedSections.map((section) => {
            const sectionTotal = section.items.reduce((acc, i) => acc + i.balanceDue, 0);
            return (
              <div
                key={section.key}
                className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl overflow-hidden shadow-2xs"
              >
                {/* Section Banner */}
                <div
                  className={`px-4 py-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                    section.tone === 'crimson'
                      ? 'bg-rose-50/90 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800/60'
                      : 'bg-[#F8FAFC] dark:bg-[#0F2142] border-[#CBD5E1]/80 dark:border-[#B6C2D2]/15'
                  }`}
                >
                  <div>
                    <h3
                      className={`text-xs sm:text-sm font-extrabold flex items-center gap-2 ${
                        section.tone === 'crimson'
                          ? 'text-[#991B1B] dark:text-rose-300'
                          : 'text-[#0B1933] dark:text-white'
                      }`}
                    >
                      <span>{section.title}</span>
                      <span className="px-2 py-0.5 rounded bg-white/80 dark:bg-[#071021]/70 border border-current/15 font-mono text-[11px] tabular-nums">
                        {section.items.length}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-[#94A3B8] mt-0.5">
                      {section.subtitle}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="block text-[10px] uppercase font-semibold tracking-wide text-slate-500 dark:text-[#94A3B8]">
                      Subtotal del tramo
                    </span>
                    <span
                      className={`text-sm sm:text-base font-black font-mono tabular-nums ${
                        section.tone === 'crimson'
                          ? 'text-[#991B1B] dark:text-rose-300'
                          : 'text-[#0B1933] dark:text-white'
                      }`}
                    >
                      {formatCurrency(sectionTotal, sym)}
                    </span>
                  </div>
                </div>

                {/* Agenda Rows */}
                <div className="divide-y divide-slate-200 dark:divide-[#B6C2D2]/15">
                  {section.items.map((item) => {
                    const b = item.boleta;
                    const quotaTag =
                      b.totalInstallments && b.installmentNumber
                        ? `Cuota ${b.installmentNumber}/${b.totalInstallments}`
                        : b.saleMode === 'sena_reserva'
                        ? 'Reserva c/ Seña'
                        : b.saleMode === 'canasto_mixto'
                        ? 'Canasto'
                        : null;

                    return (
                      <div
                        key={b.id}
                        className="p-3.5 sm:p-4 hover:bg-[#F8FAFC] dark:hover:bg-[#10203E]/70 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3.5"
                      >
                        {/* Left info */}
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-[#0B1933] dark:text-[#CBD5E1] bg-[#E9EEF5] dark:bg-[#13264A] px-2 py-0.5 rounded border border-[#CBD5E1] dark:border-[#B6C2D2]/25 tabular-nums">
                              #{b.boletaNumber}
                            </span>

                            <span className="text-sm font-extrabold text-[#0B1933] dark:text-white truncate">
                              {b.clientName}
                            </span>

                            {quotaTag && (
                              <span className="px-2 py-0.5 rounded bg-[#162E59] text-white dark:bg-[#E2E8F0] dark:text-[#091428] text-[10px] font-bold">
                                {quotaTag}
                              </span>
                            )}

                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold border tabular-nums ${
                                item.diffDays < 0
                                  ? 'bg-[#991B1B] text-white border-[#7F1D1D]'
                                  : item.diffDays === 0
                                  ? 'bg-rose-50 text-[#991B1B] border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-700'
                                  : item.diffDays <= 3
                                  ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-700/60'
                                  : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-[#13264A] dark:text-[#CBD5E1] dark:border-[#B6C2D2]/25'
                              }`}
                            >
                              {b.promisedPaymentDate
                                ? item.diffDays < 0
                                  ? `Promesa incumplida (+${Math.abs(item.diffDays)}d)`
                                  : item.diffDays === 0
                                  ? 'PROMESA HOY'
                                  : item.diffDays === 1
                                  ? 'Promesa mañana'
                                  : `Promesa en ${item.diffDays}d`
                                : item.diffDays < 0
                                ? `Atrasada +${Math.abs(item.diffDays)}d`
                                : item.diffDays === 0
                                ? 'VENCE HOY'
                                : item.diffDays === 1
                                ? 'Mañana'
                                : `En ${item.diffDays} días`}
                            </span>

                            {b.lastVisitOutcome && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border tabular-nums ${
                                  getVisitOutcomeMeta(b.lastVisitOutcome).badgeClass
                                }`}
                                title={b.lastVisitNote || 'Última gestión registrada'}
                              >
                                {getVisitOutcomeMeta(b.lastVisitOutcome).shortLabel}
                                {b.lastVisitDate ? ` · ${formatDateEs(b.lastVisitDate)}` : ''}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-600 dark:text-[#94A3B8]">
                            <span className="tabular-nums">
                              Vence: <strong className="text-[#0B1933] dark:text-[#E2E8F0]">{formatDateEs(b.dueDate)}</strong>
                            </span>
                            {b.promisedPaymentDate && b.promisedPaymentDate !== b.dueDate && (
                              <span className="tabular-nums text-[#0B1933] dark:text-[#CBD5E1] font-semibold">
                                Reagendado: {formatDateEs(b.promisedPaymentDate)}
                              </span>
                            )}
                            <span>
                              Vendedor: <strong className="text-[#0B1933] dark:text-[#E2E8F0]">{b.salespersonName}</strong>
                            </span>
                            {(b.clientAddress || item.client?.address) && (
                              <span className="inline-flex items-center gap-1 truncate max-w-[260px]">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{b.clientAddress || item.client?.address}</span>
                              </span>
                            )}
                            {b.items && b.items.length > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[#0B1933] dark:text-[#CBD5E1] font-medium">
                                <Package className="w-3 h-3 shrink-0" />
                                <span>
                                  {b.items.length} prod.: {b.items.map((x) => `${x.quantity}x ${x.name}`).join(', ')}
                                </span>
                              </span>
                            ) : b.itemSummary ? (
                              <span className="inline-flex items-center gap-1 truncate max-w-[300px]">
                                <Package className="w-3 h-3 shrink-0" />
                                <span className="truncate">{b.itemSummary}</span>
                              </span>
                            ) : null}
                          </div>

                          {b.lastVisitNote && (
                            <p className="text-[11px] text-slate-500 dark:text-[#94A3B8] italic">
                              Última gestión: “{b.lastVisitNote}”
                              {b.visitLogs && b.visitLogs.length > 1
                                ? ` (${b.visitLogs.length} visitas registradas)`
                                : ''}
                            </p>
                          )}
                        </div>

                        {/* Right: Balance + Quick Actions */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between lg:justify-end gap-3 shrink-0">
                          <div className="text-left sm:text-right">
                            <div className="text-base font-black font-mono tabular-nums text-[#0B1933] dark:text-white">
                              {formatCurrency(item.balanceDue, sym)}
                            </div>
                            {item.hasPartialPayments ? (
                              <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                Abonado {item.percentagePaid}% de {formatCurrency(item.originalAmount, sym)}
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-500 dark:text-[#8D9CB0] tabular-nums">
                                Venta: {formatDateEs(b.saleDate)}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => onOpenVisitModal(b)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] border border-[#94A3B8]/50 transition-colors cursor-pointer"
                              title="Registrar visita en calle (local cerrado, pasar más tarde o promesa de pago)"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              <span>Visita / Promesa</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenWhatsAppClient(item)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                                config.enableClientWhatsAppReminders
                                  ? 'bg-[#065F46] hover:bg-emerald-700 text-white'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                              }`}
                              title={
                                config.enableClientWhatsAppReminders
                                  ? 'Enviar recordatorio por WhatsApp al cliente (con Alias)'
                                  : 'WhatsApp a clientes desactivado en Ajustes'
                              }
                            >
                              <User className="w-3.5 h-3.5" />
                              <span>WA Cliente</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenWhatsAppSeller(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-700 hover:bg-emerald-600 text-white transition-colors cursor-pointer"
                              title="Avisar al vendedor por WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Vendedor</span>
                            </button>

                            {onQuickSendStatement && (
                              <button
                                type="button"
                                onClick={() => onQuickSendStatement(b)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] transition-colors cursor-pointer"
                                title="Enviar Estado de Cuenta instantáneo al cliente por WhatsApp (Texto, PNG o PDF)"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Estado Cta.</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleOpenVisualReceipt(item)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F4F6F9] hover:bg-[#E9EEF5] dark:bg-[#0F2142] dark:hover:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 transition-colors cursor-pointer"
                              title="Ver / descargar comprobante visual PNG"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenExtendModal(b)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] border border-[#94A3B8]/50 transition-colors cursor-pointer"
                              title="Prorrogar fecha de vencimiento"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Prorrogar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenPartialPaymentModal(b)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer"
                              title="Registrar entrega parcial / seña"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Parcial</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onMarkAsPaid(b)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] transition-colors cursor-pointer"
                              title="Marcar boleta como cobrada total"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Cobrar</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
