import React, { useState } from 'react';
import {
  FileText,
  Search,
  Filter,
  Flame,
  Clock,
  Calendar,
  DollarSign,
  Download,
  CheckCircle2,
  Receipt,
  Bike,
  User,
  MapPin,
  MessageCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Boleta, DistributorConfig, Client, Salesperson, Administrator } from '../types';
import { calculateAlertStatus, formatCurrency, formatDateEs, getBoletaBalance } from '../utils/alerts';
import { createWhatsAppUrl, generateClientWhatsAppMessage, generateUserSignedReminder } from '../utils/whatsapp';

interface UnpaidBoletasViewProps {
  boletas: Boleta[];
  config: DistributorConfig;
  clients: Client[];
  salespeople: Salesperson[];
  admins: Administrator[];
  onOpenNewBoleta: () => void;
  onOpenExtendModal: (boleta: Boleta) => void;
  onMarkAsPaid: (boleta: Boleta) => void;
  onOpenPartialPaymentModal: (boleta: Boleta) => void;
  onOpenCreditNoteModal?: (boleta: Boleta) => void;
  onQuickSendStatement?: (boleta: Boleta) => void;
  onDeleteBoleta: (boletaId: string) => void;
  currentDateRef?: string;
  initialFilter?: 'all' | 'critical_overdue' | 'extended' | 'normal';
}

export const UnpaidBoletasView: React.FC<UnpaidBoletasViewProps> = ({
  boletas,
  config,
  clients,
  salespeople,
  admins,
  onOpenNewBoleta,
  onOpenExtendModal,
  onMarkAsPaid,
  onOpenPartialPaymentModal,
  onOpenCreditNoteModal,
  onQuickSendStatement,
  onDeleteBoleta,
  currentDateRef,
  initialFilter = 'all',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'critical_overdue' | 'overdue_mild' | 'extended' | 'normal'>(
    initialFilter === 'critical_overdue' ? 'critical_overdue' : 'all'
  );
  const [sellerFilter, setSellerFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const pendingBoletas = boletas.filter((b) => b.status === 'pending');
  const graceThreshold = config.overdueGraceDays !== undefined ? config.overdueGraceDays : 5;

  // Enriched items with balance and alert status
  const enrichedItems = pendingBoletas.map((b) => {
    const status = calculateAlertStatus(b, config, currentDateRef);
    const balance = getBoletaBalance(b);
    const client = clients.find((c) => c.id === b.clientId);
    const salesperson = salespeople.find((s) => s.id === b.salespersonId);
    return { boleta: b, status, balance, client, salesperson };
  });

  // KPI calculations
  const totalPendingDebt = enrichedItems.reduce((acc, item) => acc + item.balance.balanceDue, 0);

  const criticalOverdueItems = enrichedItems.filter(
    (item) => item.status.daysPastDueDate >= graceThreshold
  );
  const criticalOverdueDebt = criticalOverdueItems.reduce(
    (acc, item) => acc + item.balance.balanceDue,
    0
  );

  const extendedItems = enrichedItems.filter((item) => item.status.isExtended);
  const onTimeItems = enrichedItems.filter(
    (item) => !item.status.isOverdueOrToday && item.status.daysPastDueDate === 0
  );

  // Filter items
  const filtered = enrichedItems.filter(({ boleta, status, client, salesperson }) => {
    const matchesSearch =
      boleta.boletaNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      boleta.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      boleta.salespersonName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (boleta.clientAddress && boleta.clientAddress.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesSeller = sellerFilter === 'all' || boleta.salespersonId === sellerFilter;

    let matchesStatus = true;
    if (statusFilter === 'critical_overdue') {
      matchesStatus = status.daysPastDueDate >= graceThreshold;
    } else if (statusFilter === 'overdue_mild') {
      matchesStatus = status.daysPastDueDate > 0 && status.daysPastDueDate < graceThreshold;
    } else if (statusFilter === 'extended') {
      matchesStatus = status.isExtended;
    } else if (statusFilter === 'normal') {
      matchesStatus = !status.isOverdueOrToday && status.daysPastDueDate === 0;
    }

    return matchesSearch && matchesSeller && matchesStatus;
  });

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Nro Boleta',
      'Cliente',
      'Direccion',
      'Telefono',
      'Vendedor',
      'Monto Original ($)',
      'Saldo Pendiente ($)',
      'Fecha Venta',
      'Fecha Vencimiento',
      'Dias Desde Venta',
      'Dias Vencida / Restantes',
      'Prorrogada (Dias)',
      'Estado',
    ];

    const rows = filtered.map(({ boleta, status, balance, client }) => [
      `"${boleta.boletaNumber}"`,
      `"${boleta.clientName}"`,
      `"${boleta.clientAddress || client?.address || ''}"`,
      `"${boleta.clientPhone || client?.phone || ''}"`,
      `"${boleta.salespersonName}"`,
      balance.originalAmount,
      balance.balanceDue,
      `"${boleta.saleDate}"`,
      `"${boleta.dueDate}"`,
      status.daysElapsed,
      status.daysPastDueDate > 0 ? `+${status.daysPastDueDate}d vencida` : `${status.daysRemaining}d restantes`,
      boleta.extensionDays || 0,
      `"${status.categoryLabel}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Boletas_Impagas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeAdmin = admins.find((a) => a.id === config.activeAdminId) || admins[0];

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-[#0B1933] dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#162E59] dark:text-[#CBD5E1]" />
              <span>Boletas Impagas (Cartera en Calle)</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-mono tabular-nums font-bold bg-[#E9EEF5] text-[#0B1933] dark:bg-[#13264A] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25">
              {pendingBoletas.length} activas
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-[#94A3B8] mt-0.5">
            Detalle completo con cliente, monto adeudado, fecha de emisión, vencimiento y botón directo para prorrogar.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={onOpenNewBoleta}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] transition-colors cursor-pointer"
          >
            <span>+ Cargar Boleta Fiada</span>
          </button>
        </div>
      </div>

      {/* Financial KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Fiado en Calle */}
        <div
          onClick={() => setStatusFilter('all')}
          className={`p-4 rounded-xl border transition-colors cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-[#E9EEF5] dark:bg-[#13264A] border-[#162E59] dark:border-[#CBD5E1]'
              : 'bg-white dark:bg-[#0B1933] border-[#CBD5E1] dark:border-[#B6C2D2]/20 hover:border-[#94A3B8]'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            Total Fiado en Calle
          </span>
          <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white block mt-1">
            {formatCurrency(totalPendingDebt, config.currencySymbol)}
          </span>
          <span className="text-xs text-slate-500 block mt-0.5">
            {pendingBoletas.length} boletas impagas
          </span>
        </div>

        {/* Vencido Crítico (+5d) */}
        <div
          onClick={() => setStatusFilter('critical_overdue')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'critical_overdue'
              ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-rose-600" />
              <span>Vencido Crítico (+{graceThreshold}d)</span>
            </span>
          </div>
          <span className="text-xl sm:text-2xl font-black font-mono text-rose-600 dark:text-rose-400 block mt-1">
            {formatCurrency(criticalOverdueDebt, config.currencySymbol)}
          </span>
          <span className="text-xs text-rose-600 font-semibold block mt-0.5">
            {criticalOverdueItems.length} boleta(s) vencida(s)
          </span>
        </div>

        {/* Con Prórroga Activa */}
        <div
          onClick={() => setStatusFilter('extended')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'extended'
              ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-400 ring-2 ring-indigo-400/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Prorrogadas</span>
          </span>
          <span className="text-xl sm:text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400 block mt-1">
            {extendedItems.length}
          </span>
          <span className="text-xs text-slate-500 block mt-0.5">
            Plazo extendido
          </span>
        </div>

        {/* Al Día */}
        <div
          onClick={() => setStatusFilter('normal')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'normal'
              ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-400 ring-2 ring-emerald-400/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Al Día / En Término</span>
          </span>
          <span className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 block mt-1">
            {onTimeItems.length}
          </span>
          <span className="text-xs text-slate-500 block mt-0.5">
            Dentro de fecha
          </span>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-3 items-center justify-between shadow-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por cliente que debe la factura, número de boleta o vendedor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick status tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Todas ({pendingBoletas.length})
            </button>
            <button
              onClick={() => setStatusFilter('critical_overdue')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${
                statusFilter === 'critical_overdue'
                  ? 'bg-rose-600 text-white shadow-xs font-bold'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              🔴 Vencidas +{graceThreshold}d ({criticalOverdueItems.length})
            </button>
            <button
              onClick={() => setStatusFilter('extended')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${
                statusFilter === 'extended'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-indigo-600 dark:text-indigo-400'
              }`}
            >
              ⏱️ Prorrogadas ({extendedItems.length})
            </button>
          </div>

          {/* Vendedor filter */}
          <select
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
            className="text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
          >
            <option value="all">Todos los vendedores</option>
            {salespeople.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Detailed Table View */}
      <div className="bg-white dark:bg-[#0B1933] rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B1933] text-[#E2E8F0] font-semibold border-b border-[#B6C2D2]/25">
              <tr>
                <th className="px-4 py-3.5">N° Boleta</th>
                <th className="px-4 py-3.5">Cliente que Debe la Factura</th>
                <th className="px-4 py-3.5 text-right">Monto y Saldo</th>
                <th className="px-4 py-3.5">Fecha de Venta</th>
                <th className="px-4 py-3.5">Vencimiento</th>
                <th className="px-4 py-3.5">Estado / Demora</th>
                <th className="px-4 py-3.5">Vendedor a Cargo</th>
                <th className="px-4 py-3.5 text-center">Prórroga & Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    No se encontraron boletas impagas con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filtered.map(({ boleta, status, balance, client }) => {
                  const isCritical = status.daysPastDueDate >= graceThreshold;

                  // WhatsApp direct links (cliente vs vendedor)
                  const clientPhone = boleta.clientPhone || client?.phone || '';
                  const clientMsg = generateClientWhatsAppMessage(boleta, client, config);
                  const clientWhatsappUrl = createWhatsAppUrl(clientPhone, clientMsg);

                  const vendedor = salespeople.find((s) => s.id === boleta.salespersonId);
                  const sellerPhone = vendedor?.phone || boleta.salespersonPhone || '';
                  const sellerMsg = generateUserSignedReminder(
                    boleta,
                    vendedor,
                    activeAdmin?.name || 'Administración',
                    config,
                    config.customCobranzaTemplate
                  );
                  const sellerWhatsappUrl = createWhatsAppUrl(sellerPhone, sellerMsg);

                  return (
                    <tr
                      key={boleta.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                        isCritical
                          ? 'bg-rose-50/40 dark:bg-rose-950/20 font-medium'
                          : status.isExtended
                          ? 'bg-indigo-50/20 dark:bg-indigo-950/10'
                          : ''
                      }`}
                    >
                      {/* Nro Boleta */}
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>#{boleta.boletaNumber}</span>
                          {boleta.isSigned && (
                            <span className="text-[10px] text-emerald-600" title="Boleta firmada">
                              ✍️
                            </span>
                          )}
                          {boleta.installmentNumber && boleta.totalInstallments && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]">
                              C{boleta.installmentNumber}/{boleta.totalInstallments}
                            </span>
                          )}
                          {boleta.saleMode === 'sena_reserva' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              Seña
                            </span>
                          )}
                        </div>
                        {boleta.extensionDays ? (
                          <span className="inline-block mt-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 font-mono">
                            Prórr: +{boleta.extensionDays}d
                          </span>
                        ) : null}
                      </td>

                      {/* Cliente que debe la factura */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-slate-900 dark:text-white text-sm">
                            {boleta.clientName}
                          </span>
                          {client?.creditHistory?.reputationStatus === 'problematico' && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-300">
                              🚨 Problemático
                            </span>
                          )}
                        </div>
                        {boleta.itemSummary && (
                          <span className="text-[11px] font-medium text-[#0B1933] dark:text-[#CBD5E1] block truncate max-w-xs">
                            {boleta.itemSummary}
                          </span>
                        )}
                        {boleta.clientAddress && (
                          <span className="text-[11px] text-slate-500 block truncate max-w-xs">
                            {boleta.clientAddress}
                          </span>
                        )}
                        {clientPhone && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Tel: {clientPhone}
                          </span>
                        )}
                      </td>

                      {/* Monto y Saldo adeudado */}
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                        <span className="text-sm font-black text-slate-900 dark:text-white block">
                          {formatCurrency(balance.balanceDue, config.currencySymbol)}
                        </span>
                        {balance.hasCreditNotes && (
                          <span className="text-[10px] text-amber-700 dark:text-amber-300 block font-semibold">
                            NC/Devolución: -{formatCurrency(balance.totalCreditNotes, config.currencySymbol)}
                          </span>
                        )}
                        {balance.hasPartialPayments ? (
                          <span className="text-[10px] text-emerald-600 block">
                            Entregado: -{formatCurrency(balance.totalPaid, config.currencySymbol)} ({balance.percentagePaid}%)
                          </span>
                        ) : !balance.hasCreditNotes ? (
                          <span className="text-[10px] text-slate-400 block">100% pendiente</span>
                        ) : null}
                      </td>

                      {/* Fecha de Venta (cuándo se hizo) */}
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                          {formatDateEs(boleta.saleDate)}
                        </span>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          Hace {status.daysElapsed} días
                        </span>
                      </td>

                      {/* Fecha de Cobro Programada (cuándo se debió cobrar) */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`font-bold block ${
                            isCritical
                              ? 'text-rose-600 dark:text-rose-400'
                              : status.isOverdueOrToday
                              ? 'text-amber-600'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {formatDateEs(boleta.dueDate)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {status.daysPastDueDate > 0 ? (
                            <strong className="text-rose-600 dark:text-rose-400 font-semibold">
                              Vencida hace {status.daysPastDueDate} días
                            </strong>
                          ) : status.daysRemaining === 0 ? (
                            <strong className="text-amber-600 font-semibold">Vence hoy</strong>
                          ) : (
                            <span>Vence en {status.daysRemaining} días</span>
                          )}
                        </span>
                      </td>

                      {/* Estado y Demora */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-2xs ${status.badgeColor}`}
                        >
                          {status.categoryLabel}
                        </span>
                      </td>

                      {/* Vendedor a cargo */}
                      <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-1 font-semibold">
                          <Bike className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{boleta.salespersonName}</span>
                        </div>
                      </td>

                      {/* Prórroga & Acciones Rápidas */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* BOTÓN PRORROGAR BOLETA */}
                          <button
                            type="button"
                            onClick={() => onOpenExtendModal(boleta)}
                            className="px-2.5 py-1 rounded-lg bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] border border-[#94A3B8]/50 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                            title="Prorrogar vencimiento de la boleta sumando días"
                          >
                            <Clock className="w-3 h-3" />
                            <span>Prorrogar</span>
                          </button>

                          {/* WhatsApp Cliente (si está activado) o Vendedor */}
                          {config.enableClientWhatsAppReminders && clientPhone ? (
                            <a
                              href={clientWhatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50"
                              title="Enviar recordatorio por WhatsApp al cliente"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          ) : sellerPhone ? (
                            <a
                              href={sellerWhatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-[#162E59] hover:bg-[#E9EEF5] dark:text-[#CBD5E1] dark:hover:bg-[#13264A] border border-[#CBD5E1] dark:border-[#B6C2D2]/25"
                              title={
                                config.enableClientWhatsAppReminders
                                  ? 'Cliente sin teléfono · Enviar aviso al vendedor'
                                  : 'WhatsApp a clientes desactivado · Enviar aviso al vendedor'
                              }
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          ) : null}

                          {onQuickSendStatement && (
                            <button
                              type="button"
                              onClick={() => onQuickSendStatement(boleta)}
                              className="px-2 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                              title="Enviar Estado de Cuenta instantáneo por WhatsApp (Escrito, Imagen PNG o PDF)"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Estado Cta.</span>
                            </button>
                          )}

                          {/* Pago Parcial */}
                          <button
                            type="button"
                            onClick={() => onOpenPartialPaymentModal(boleta)}
                            className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] cursor-pointer"
                            title="Registrar entrega a cuenta"
                          >
                            <Receipt className="w-3 h-3" />
                          </button>

                          {config.businessRubro === 'indumentaria' && onOpenCreditNoteModal && (
                            <button
                              type="button"
                              onClick={() => onOpenCreditNoteModal(boleta)}
                              className="px-2 py-1 rounded-lg bg-[#F4F6F9] hover:bg-[#E9EEF5] dark:bg-[#0F2142] dark:hover:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 font-bold text-[11px] cursor-pointer"
                              title="Registrar devolución o Nota de Crédito (Indumentaria)"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}

                          {/* Cobrar */}
                          <button
                            type="button"
                            onClick={() => onMarkAsPaid(boleta)}
                            className="px-2.5 py-1 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                            title="Marcar como cobrada"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Cobrar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
