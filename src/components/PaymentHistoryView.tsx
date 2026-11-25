import React, { useState } from 'react';
import {
  History,
  Search,
  Download,
  Calendar,
  DollarSign,
  CheckCircle,
  Banknote,
  CreditCard,
  FileCheck,
  Bike,
  User,
  Filter,
  Printer,
  RotateCcw,
  Receipt,
} from 'lucide-react';
import { Boleta, DistributorConfig } from '../types';
import { formatCurrency, formatDateEs } from '../utils/alerts';
import type { ReceiptModalData } from './PaymentReceiptModal';

interface PaymentHistoryViewProps {
  paidBoletas: Boleta[];
  config: DistributorConfig;
  onRestoreBoleta?: (boletaId: string) => void;
  onOpenReceipt?: (receipt: ReceiptModalData) => void;
}

export const PaymentHistoryView: React.FC<PaymentHistoryViewProps> = ({
  paidBoletas,
  config,
  onRestoreBoleta,
  onOpenReceipt,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [salespersonFilter, setSalespersonFilter] = useState<string>('all');
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  // Unique salespeople in history
  const uniqueSalespeople = Array.from(
    new Set(paidBoletas.map((b) => b.salespersonName).filter(Boolean))
  );

  // Filter paid boletas
  const filtered = paidBoletas.filter((b) => {
    const matchesSearch =
      b.boletaNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.salespersonName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.paymentReference && b.paymentReference.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesMethod =
      methodFilter === 'all' || b.paymentMethod === methodFilter;

    const matchesSeller =
      salespersonFilter === 'all' || b.salespersonName === salespersonFilter;

    return matchesSearch && matchesMethod && matchesSeller;
  });

  // Net cash collected helper (never counts returned merchandise / Notas de Crédito as cash)
  const getNetCashCollected = (b: Boleta): { net: number; creditNotesTotal: number } => {
    const creditNotesTotal = (b.creditNotes || []).reduce(
      (sum, cn) => sum + (Number(cn.amount) || 0),
      0
    );
    const net = Math.max(0, Math.round(((b.amount || 0) - creditNotesTotal) * 100) / 100);
    return { net, creditNotesTotal };
  };

  // Calculate totals
  const totalCollected = filtered.reduce((acc, b) => acc + getNetCashCollected(b).net, 0);
  const cashTotal = filtered
    .filter((b) => b.paymentMethod === 'efectivo')
    .reduce((acc, b) => acc + getNetCashCollected(b).net, 0);
  const transferTotal = filtered
    .filter((b) => b.paymentMethod === 'transferencia')
    .reduce((acc, b) => acc + getNetCashCollected(b).net, 0);
  const checkTotal = filtered
    .filter((b) => b.paymentMethod === 'cheque')
    .reduce((acc, b) => acc + getNetCashCollected(b).net, 0);

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      'Nro Boleta',
      'Cliente',
      'Vendedor',
      'Fecha Venta',
      'Fecha Pago',
      'Monto ($)',
      'Medio de Pago',
      'Comprobante/Referencia',
      'Notas',
    ];

    const rows = filtered.map((b) => [
      `"${b.boletaNumber}"`,
      `"${b.clientName}"`,
      `"${b.salespersonName}"`,
      `"${b.saleDate}"`,
      `"${b.paidAt || ''}"`,
      b.amount,
      `"${b.paymentMethod || 'Efectivo'}"`,
      `"${b.paymentReference || ''}"`,
      `"${b.paymentNotes || ''}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Historial_Cobranzas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & KPI Cards */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600" />
            <span>Historial de Boletas Pagadas</span>
          </h2>
          <p className="text-xs text-slate-500">
            Registro de boletas cobradas (conservadas durante 30 días para optimizar base de datos y memoria). El historial de puntualidad de cada cliente se preserva permanentemente.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white shadow-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Exportar a CSV / Excel</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total Cobrado</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totalCollected, config.currencySymbol)}
          </span>
          <span className="text-xs text-slate-500 block mt-0.5">{filtered.length} boletas canceladas</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Banknote className="w-3.5 h-3.5 text-emerald-500" />
            <span>En Efectivo</span>
          </span>
          <span className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {formatCurrency(cashTotal, config.currencySymbol)}
          </span>
          <span className="text-xs text-slate-400 block mt-0.5">Rendición directa</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5 text-blue-500" />
            <span>Transferencias</span>
          </span>
          <span className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {formatCurrency(transferTotal, config.currencySymbol)}
          </span>
          <span className="text-xs text-slate-400 block mt-0.5">Bancarias</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <FileCheck className="w-3.5 h-3.5 text-purple-500" />
            <span>Cheques / Otros</span>
          </span>
          <span className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {formatCurrency(checkTotal, config.currencySymbol)}
          </span>
          <span className="text-xs text-slate-400 block mt-0.5">En cartera</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-3 items-center justify-between shadow-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, n° de boleta, vendedor o recibo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Medio:</span>
          </div>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
          >
            <option value="all">Todos los medios</option>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="cheque">Cheque</option>
            <option value="otro">Otro</option>
          </select>

          <select
            value={salespersonFilter}
            onChange={(e) => setSalespersonFilter(e.target.value)}
            className="text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
          >
            <option value="all">Todos los vendedores</option>
            {uniqueSalespeople.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table of Paid Boletas */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto rt-cards-scroll">
          <table className="rt-cards w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">N° Boleta</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3">Fecha Venta</th>
                <th className="px-4 py-3">Fecha Cobro</th>
                <th className="px-4 py-3 text-right">Monto Cobrado</th>
                <th className="px-4 py-3">Medio de Pago</th>
                <th className="px-4 py-3">Referencia / Notas</th>
                {(onRestoreBoleta || onOpenReceipt) && <th className="px-4 py-3 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No se encontraron boletas pagadas con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr
                    key={b.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-800 dark:text-slate-200" data-label="N° Boleta">
                      #{b.boletaNumber}
                    </td>
                    <td className="px-4 py-3.5" data-label="Cliente">
                      <span className="font-bold text-slate-900 dark:text-white block">
                        {b.clientName}
                      </span>
                      {b.clientAddress && (
                        <span className="text-[11px] text-slate-400">{b.clientAddress}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300" data-label="Vendedor">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Bike className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{b.salespersonName}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500" data-label="Fecha Venta">
                      {formatDateEs(b.saleDate)}
                    </td>
                    <td className="px-4 py-3.5" data-label="Fecha Cobro">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 block">
                        {formatDateEs(b.paidAt || b.saleDate)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {b.paidAt && b.saleDate
                          ? `En ${Math.max(
                              0,
                              Math.floor(
                                (new Date(b.paidAt).getTime() - new Date(b.saleDate).getTime()) /
                                  (1000 * 60 * 60 * 24)
                              )
                            )} días`
                          : 'Cancelado'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-black text-slate-900 dark:text-white text-sm font-mono tabular-nums" data-label="Monto Cobrado">
                      {(() => {
                        const { net, creditNotesTotal } = getNetCashCollected(b);
                        return (
                          <>
                            <span>{formatCurrency(net, config.currencySymbol)}</span>
                            {creditNotesTotal > 0 && (
                              <span className="block text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                Orig: {formatCurrency(b.amount, config.currencySymbol)} · NC: -
                                {formatCurrency(creditNotesTotal, config.currencySymbol)}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3.5" data-label="Medio de Pago">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 capitalize">
                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                        <span>
                          {getNetCashCollected(b).net <= 0 && (b.creditNotes?.length || 0) > 0
                            ? 'Devuelta (NC)'
                            : b.paymentMethod || 'Efectivo'}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 max-w-xs truncate" data-label="Referencia / Notas">
                      {b.paymentReference && (
                        <span className="font-mono text-[11px] block text-slate-700 dark:text-slate-300">
                          Ref: {b.paymentReference}
                        </span>
                      )}
                      {b.paymentNotes && (
                        <span className="text-[11px] italic text-slate-400">
                          "{b.paymentNotes}"
                        </span>
                      )}
                    </td>
                    {(onRestoreBoleta || onOpenReceipt) && (
                      <td className="px-4 py-3.5 text-right whitespace-nowrap" data-label="Acciones">
                        <div className="inline-flex items-center gap-1">
                          {onOpenReceipt && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenReceipt({
                                  receiptNumber: b.paymentReference || `REC-${b.boletaNumber}`,
                                  boletaNumber: b.boletaNumber,
                                  clientId: b.clientId,
                                  clientName: b.clientName,
                                  clientAddress: b.clientAddress,
                                  salespersonName: b.salespersonName,
                                  paymentDate: b.paidAt || b.saleDate,
                                  amountPaidNow: b.amount,
                                  paymentMethod: b.paymentMethod || 'efectivo',
                                  originalAmount: b.amount,
                                  totalPaidAccumulated: b.amount,
                                  remainingBalance: 0,
                                  receivedBy: b.salespersonName,
                                  notes: b.paymentNotes || b.itemSummary,
                                  isFullSettlement: true,
                                  initialPhone: b.clientPhone || '',
                                  items: b.items,
                                  saleModeLabel: 'COMPROBANTE CANCELADO',
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-[#F4F6F9] hover:bg-[#E9EEF5] dark:bg-[#0F2142] dark:hover:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 cursor-pointer"
                              title="Ver / descargar comprobante visual PNG"
                            >
                              <Receipt className="w-3 h-3" />
                              <span>Recibo</span>
                            </button>
                          )}
                          {onRestoreBoleta && (
                            confirmRestoreId === b.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onRestoreBoleta(b.id);
                                    setConfirmRestoreId(null);
                                  }}
                                  className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  Reactivar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRestoreId(null)}
                                  className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-semibold cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmRestoreId(b.id)}
                                className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                                title="Deshacer cobro y devolver a boletas pendientes"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
