import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  TrendingDown,
  TrendingUp,
  Percent,
  Bike,
  User,
  Users,
  Search,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Calendar,
  MessageCircle,
  FileText,
  Receipt,
  Filter,
} from 'lucide-react';
import { Client, Salesperson, Boleta, DistributorConfig } from '../types';
import { calculateAlertStatus, formatCurrency, formatDateEs, getBoletaBalance } from '../utils/alerts';
import { createWhatsAppUrl, hasUsablePhone } from '../utils/whatsapp';

interface CreditAuditManagerProps {
  clients: Client[];
  salespeople: Salesperson[];
  boletas: Boleta[];
  paidBoletas: Boleta[];
  config: DistributorConfig;
  onNavigateToTab?: (tab: string) => void;
}

export const CreditAuditManager: React.FC<CreditAuditManagerProps> = ({
  clients,
  salespeople,
  boletas,
  paidBoletas,
  config,
  onNavigateToTab,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'clientes' | 'vendedores'>('clientes');
  const [clientSearch, setClientSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'critical' | 'delayed' | 'punctual'>('all');
  const [sellerSearch, setSellerSearch] = useState('');

  const today = new Date();

  // Helper to calculate days between dates
  const daysDiff = (startStr: string, endStr: string): number => {
    const d1 = new Date(startStr + 'T12:00:00');
    const d2 = new Date(endStr + 'T12:00:00');
    return Math.max(0, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  };

  // 1. COMPUTE METRICS PER CLIENT
  const clientMetrics = clients.map((c) => {
    const clientPaid = paidBoletas.filter((b) => b.clientId === c.id);
    const clientPending = boletas.filter((b) => b.clientId === c.id && b.status === 'pending');
    const allClientBoletas = [...clientPaid, ...clientPending];

    // Compute actual payment days
    let totalRealDays = 0;
    let totalTermDays = 0;
    let countedBoletas = 0;
    let partialPaymentCount = 0;

    clientPaid.forEach((b) => {
      const actualDays = b.paidAt ? daysDiff(b.saleDate, b.paidAt) : b.termDays;
      totalRealDays += actualDays;
      totalTermDays += b.termDays;
      countedBoletas++;
      if (b.partialPayments && b.partialPayments.length > 0) {
        partialPaymentCount++;
      }
    });

    // Also include pending boletas that are currently running
    clientPending.forEach((b) => {
      const currentDaysElapsed = daysDiff(b.saleDate, today.toISOString().split('T')[0]);
      // If overdue, penalize with elapsed days
      if (currentDaysElapsed > b.termDays) {
        totalRealDays += currentDaysElapsed;
        totalTermDays += b.termDays;
        countedBoletas++;
      }
      if (b.partialPayments && b.partialPayments.length > 0) {
        partialPaymentCount++;
      }
    });

    const avgTermDays = countedBoletas > 0 ? totalTermDays / countedBoletas : config.defaultTermDays || 7;
    const avgRealDays = countedBoletas > 0 ? totalRealDays / countedBoletas : avgTermDays;

    // Percentage of excess delay: e.g., if term 7 and takes 14, (14 - 7) / 7 = +100%
    const delayPercentage = avgTermDays > 0 ? Math.round(((avgRealDays - avgTermDays) / avgTermDays) * 100) : 0;

    // Percentage of payments made in partial installments / percentages
    const totalTransactions = allClientBoletas.length;
    const partialPaymentRate = totalTransactions > 0 ? Math.round((partialPaymentCount / totalTransactions) * 100) : 0;

    const currentPendingBoleta = clientPending[0];
    const currentPendingBalance = currentPendingBoleta ? getBoletaBalance(currentPendingBoleta).balanceDue : 0;
    const isCurrentlyOverdue = currentPendingBoleta ? calculateAlertStatus(currentPendingBoleta, config).isOverdueOrToday : false;

    // Determine Risk Level
    let riskLevel: 'critical' | 'delayed' | 'punctual' = 'punctual';
    const hasPurgedDebts =
      (c.creditHistory?.totalPurgedUnpaid || 0) > 0 ||
      c.creditHistory?.reputationStatus === 'problematico';

    if (
      hasPurgedDebts ||
      delayPercentage > 70 ||
      isCurrentlyOverdue ||
      (delayPercentage > 40 && partialPaymentRate >= 50)
    ) {
      riskLevel = 'critical';
    } else if (
      c.creditHistory?.reputationStatus === 'regular' ||
      delayPercentage > 20 ||
      partialPaymentRate > 40
    ) {
      riskLevel = 'delayed';
    }

    const assignedSeller = salespeople.find((s) => s.id === c.assignedSalespersonId);

    return {
      client: c,
      assignedSeller,
      avgTermDays: Number(avgTermDays.toFixed(1)),
      avgRealDays: Number(avgRealDays.toFixed(1)),
      delayPercentage,
      partialPaymentCount,
      partialPaymentRate,
      riskLevel,
      currentPendingBoleta,
      currentPendingBalance,
      isCurrentlyOverdue,
      totalBoletasCount: totalTransactions,
      paidBoletasCount: clientPaid.length,
    };
  });

  // Sort clients: worst delay percentage first (most problematic "largueros")
  const sortedClients = [...clientMetrics].sort((a, b) => b.delayPercentage - a.delayPercentage);

  const filteredClients = sortedClients.filter((item) => {
    const term = clientSearch.toLowerCase();
    const matchesSearch =
      item.client.name.toLowerCase().includes(term) ||
      item.client.contactPerson?.toLowerCase().includes(term) ||
      (item.client.clientNumber && item.client.clientNumber.toLowerCase().includes(term)) ||
      (item.assignedSeller && item.assignedSeller.name.toLowerCase().includes(term));

    let matchesRisk = true;
    if (riskFilter === 'critical') matchesRisk = item.riskLevel === 'critical';
    if (riskFilter === 'delayed') matchesRisk = item.riskLevel === 'delayed';
    if (riskFilter === 'punctual') matchesRisk = item.riskLevel === 'punctual';

    return matchesSearch && matchesRisk;
  });

  // 2. COMPUTE METRICS PER SALESPERSON ("Cuáles tienen las facturas más dificultosas")
  const sellerMetrics = salespeople.map((s) => {
    const sellerPaid = paidBoletas.filter((b) => b.salespersonId === s.id);
    const sellerPending = boletas.filter((b) => b.salespersonId === s.id && b.status === 'pending');
    const allSellerBoletas = [...sellerPaid, ...sellerPending];

    let totalRealDays = 0;
    let totalTermDays = 0;
    let count = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let totalPendingAmount = 0;

    sellerPaid.forEach((b) => {
      const actualDays = b.paidAt ? daysDiff(b.saleDate, b.paidAt) : b.termDays;
      totalRealDays += actualDays;
      totalTermDays += b.termDays;
      count++;
    });

    sellerPending.forEach((b) => {
      const balance = getBoletaBalance(b);
      totalPendingAmount += balance.balanceDue;

      const st = calculateAlertStatus(b, config);
      if (st.isOverdueOrToday || st.category === 'admin_alert') {
        overdueCount++;
        overdueAmount += balance.balanceDue;
      }

      const elapsed = daysDiff(b.saleDate, today.toISOString().split('T')[0]);
      if (elapsed > b.termDays) {
        totalRealDays += elapsed;
        totalTermDays += b.termDays;
        count++;
      }
    });

    const avgTerm = count > 0 ? totalTermDays / count : config.defaultTermDays || 7;
    const avgCollectionDays = count > 0 ? totalRealDays / count : avgTerm;
    const avgDelayPercentage = avgTerm > 0 ? Math.round(((avgCollectionDays - avgTerm) / avgTerm) * 100) : 0;

    // Difficulty score: combination of delay percentage and overdue ratio
    const overdueRatio = allSellerBoletas.length > 0 ? (overdueCount / allSellerBoletas.length) * 100 : 0;
    const difficultyScore = Math.max(0, avgDelayPercentage + Math.round(overdueRatio));

    return {
      salesperson: s,
      allBoletasCount: allSellerBoletas.length,
      pendingCount: sellerPending.length,
      overdueCount,
      overdueAmount,
      totalPendingAmount,
      avgCollectionDays: Number(avgCollectionDays.toFixed(1)),
      avgTerm: Number(avgTerm.toFixed(1)),
      avgDelayPercentage,
      difficultyScore,
    };
  });

  // Sort sellers: from most difficult / highest delay to most efficient
  const sortedSellers = [...sellerMetrics].sort((a, b) => b.difficultyScore - a.difficultyScore);

  const criticalClientsCount = clientMetrics.filter((c) => c.riskLevel === 'critical').length;
  const delayedClientsCount = clientMetrics.filter((c) => c.riskLevel === 'delayed').length;
  const punctualClientsCount = clientMetrics.filter((c) => c.riskLevel === 'punctual').length;

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-rose-600 via-amber-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-rose-900/20">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>Auditoría de Cobranzas & Score Crediticio</span>
              <span className="text-xs bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                Control de Morosidad
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Detección de clientes más largueros en pagar, pagos fragmentados en porcentajes y análisis de dificultad por vendedor
            </p>
          </div>
        </div>

        {/* Sub-Tabs Selector */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveSubTab('clientes')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'clientes'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Clientes Más Largueros ({clients.length})
          </button>
          <button
            onClick={() => setActiveSubTab('vendedores')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'vendedores'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Dificultad por Vendedor ({salespeople.length})
          </button>
        </div>
      </div>

      {/* KPI HIGHLIGHT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
              Clientes Problemáticos
            </span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {criticalClientsCount} <span className="text-xs font-normal text-slate-400">comercios</span>
          </p>
          <span className="text-[11px] text-rose-700 dark:text-rose-300 font-semibold block mt-0.5">
            Exceso superior al +70% del plazo o mora activa
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Clientes Largueros
            </span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {delayedClientsCount} <span className="text-xs font-normal text-slate-400">comercios</span>
          </p>
          <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold block mt-0.5">
            Demora habitual +20% a +70% sobre el pacto
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Clientes Puntuales
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {punctualClientsCount} <span className="text-xs font-normal text-slate-400">comercios</span>
          </p>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold block mt-0.5">
            Pagan dentro del plazo pactado de cada boleta
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              Vendedor Más Dificultoso
            </span>
            <Bike className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-base font-black text-slate-900 dark:text-white mt-1 truncate">
            {sortedSellers[0]?.salesperson.name || 'Sin datos'}
          </p>
          <span className="text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold block mt-0.5">
            Promedio: {sortedSellers[0]?.avgCollectionDays || 0} días en la calle ({sortedSellers[0]?.avgDelayPercentage > 0 ? `+${sortedSellers[0]?.avgDelayPercentage}%` : 'al día'})
          </span>
        </div>
      </div>

      {/* SECTION 1: CLIENTES MÁS LARGUEROS Y PROBLEMÁTICOS */}
      {activeSubTab === 'clientes' && (
        <div className="space-y-4">
          {/* Controls: Search and Filter */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por comercio, titular, código de cliente o vendedor asignado..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200"
                />
              </div>

              {/* Risk Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setRiskFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    riskFilter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Todos ({clientMetrics.length})
                </button>
                <button
                  onClick={() => setRiskFilter('critical')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    riskFilter === 'critical'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200'
                  }`}
                >
                  🔴 Problemáticos ({criticalClientsCount})
                </button>
                <button
                  onClick={() => setRiskFilter('delayed')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    riskFilter === 'delayed'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200'
                  }`}
                >
                  🟡 Largueros ({delayedClientsCount})
                </button>
                <button
                  onClick={() => setRiskFilter('punctual')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    riskFilter === 'punctual'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200'
                  }`}
                >
                  🟢 Puntuales ({punctualClientsCount})
                </button>
              </div>
            </div>
          </div>

          {/* Ranking Table of Problematic Clients */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">Posición / Riesgo</th>
                    <th className="py-3 px-4">Cliente & Contacto</th>
                    <th className="py-3 px-4">Vendedor ("De quién es")</th>
                    <th className="py-3 px-4">Plazo vs Días Reales</th>
                    <th className="py-3 px-4 text-center">% Exceso de Demora</th>
                    <th className="py-3 px-4 text-center">Pagos en Porcentajes</th>
                    <th className="py-3 px-4">Deuda Actual en Calle</th>
                    <th className="py-3 px-4 text-right">Contacto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {filteredClients.map((item, idx) => {
                    const isCritical = item.riskLevel === 'critical';
                    const isDelayed = item.riskLevel === 'delayed';

                    return (
                      <tr
                        key={item.client.id}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                          isCritical
                            ? 'bg-rose-50/30 dark:bg-rose-950/20'
                            : isDelayed
                            ? 'bg-amber-50/20 dark:bg-amber-950/10'
                            : ''
                        }`}
                      >
                        {/* Position & Risk Badge */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-400 w-5">#{idx + 1}</span>
                            {isCritical ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-300 dark:border-rose-800">
                                <ShieldAlert className="w-3 h-3 text-rose-600" />
                                <span>Problemático</span>
                              </span>
                            ) : isDelayed ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Larguero</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Puntual</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Client details */}
                        <td className="py-3 px-4">
                          <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 font-bold block">
                            {item.client.clientNumber || 'S/N'}
                          </span>
                          <strong className="text-slate-900 dark:text-white block text-sm">
                            {item.client.name}
                          </strong>
                          <span className="text-[11px] text-slate-500 block">
                            Titular: {item.client.contactPerson}
                          </span>
                        </td>

                        {/* Assigned Salesperson */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <Bike className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {item.assignedSeller?.name || 'Sin asignar'}
                            </span>
                          </div>
                        </td>

                        {/* Plazo vs Real Days */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div>
                            <span className="text-slate-500 block text-[11px]">
                              Plazo pactado: <strong>{item.avgTermDays} días</strong>
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                              Tarda en promedio:{' '}
                              <strong className={isCritical ? 'text-rose-600 dark:text-rose-400' : ''}>
                                {item.avgRealDays} días
                              </strong>
                            </span>
                          </div>
                        </td>

                        {/* % Exceso de Demora */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {item.delayPercentage > 0 ? (
                            <span
                              className={`inline-block font-black font-mono text-xs px-2.5 py-1 rounded-lg ${
                                item.delayPercentage >= 70
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : item.delayPercentage >= 30
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-200'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              +{item.delayPercentage}% exceso
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-semibold text-xs">En término (0%)</span>
                          )}
                        </td>

                        {/* Pagos por Porcentajes / Cuotas */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div>
                            <span
                              className={`font-mono font-bold text-xs ${
                                item.partialPaymentRate >= 50
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {item.partialPaymentRate}% de las boletas
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              ({item.partialPaymentCount} compras con pagos en cuotas)
                            </span>
                          </div>
                        </td>

                        {/* Deuda Actual */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {item.currentPendingBoleta ? (
                            <div>
                              <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm block">
                                {formatCurrency(item.currentPendingBalance, config.currencySymbol)}
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                Boleta #{item.currentPendingBoleta.boletaNumber}{' '}
                                {item.isCurrentlyOverdue && <strong className="text-rose-600">[Vencida]</strong>}
                              </span>
                            </div>
                          ) : (
                            <span className="text-emerald-600 text-xs font-semibold">✓ Al día sin deuda</span>
                          )}
                        </td>

                        {/* WhatsApp Contact */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {hasUsablePhone(item.client.phone) && (
                            <a
                              href={createWhatsAppUrl(
                                item.client.phone,
                                `Hola ${item.client.name}, te escribimos de ${config.distributorName} por tu cuenta corriente.`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs"
                              title="Abrir WhatsApp con cliente"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: CONTROL Y DIFICULTAD POR VENDEDOR */}
      {activeSubTab === 'vendedores' && (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/40 p-4 rounded-2xl border border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-100 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <strong className="block font-bold text-sm text-amber-900 dark:text-amber-200">
                Auditoría de Rendimiento de Cobranza por Vendedor
              </strong>
              <p className="leading-relaxed">
                Este ranking ordena a los vendedores según el <strong>tiempo promedio real que tardan en cobrar sus boletas</strong> y el índice de facturas vencidas en la calle. Un vendedor con alto retraso sistemático indica clientes problemáticos asignados o baja frecuencia de cobranza presencial.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedSellers.map((item, idx) => {
              const isWorst = idx === 0 && item.avgDelayPercentage > 20;

              return (
                <div
                  key={item.salesperson.id}
                  className={`p-5 rounded-2xl border bg-white dark:bg-slate-900 shadow-xs space-y-4 flex flex-col justify-between ${
                    isWorst
                      ? 'border-rose-400 dark:border-rose-800 ring-2 ring-rose-500/20'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            Puesto #{idx + 1}
                          </span>
                          {isWorst && (
                            <span className="text-[10px] uppercase font-black bg-rose-600 text-white px-2 py-0.5 rounded-full">
                              Mayor Dificultad
                            </span>
                          )}
                        </div>
                        <h3 className="font-black text-base text-slate-900 dark:text-white mt-1">
                          {item.salesperson.name}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {item.salesperson.zone} • {item.salesperson.phone}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Días Promedio Cobro
                        </span>
                        <span
                          className={`text-2xl font-black font-mono ${
                            item.avgDelayPercentage > 30 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {item.avgCollectionDays}d
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          (Pacto habitual: {item.avgTerm}d)
                        </span>
                      </div>
                    </div>

                    {/* Delay Metric Bar */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          Índice de Demora sobre el Plazo:
                        </span>
                        <span
                          className={`font-black font-mono text-sm ${
                            item.avgDelayPercentage > 30
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {item.avgDelayPercentage > 0 ? `+${item.avgDelayPercentage}%` : 'En término'}
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            item.avgDelayPercentage >= 50
                              ? 'bg-rose-600'
                              : item.avgDelayPercentage >= 20
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(10, item.avgDelayPercentage))}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Boletas en Mora:
                        </span>
                        <span
                          className={`font-bold text-sm ${
                            item.overdueCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'
                          }`}
                        >
                          {item.overdueCount} de {item.pendingCount} activas
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {formatCurrency(item.overdueAmount, config.currencySymbol)}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Saldo Total Asignado:
                        </span>
                        <span className="font-black text-slate-900 dark:text-white text-sm font-mono block">
                          {formatCurrency(item.totalPendingAmount, config.currencySymbol)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          en {item.pendingCount} clientes
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Recommendation snippet */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                    {item.avgDelayPercentage > 30 ? (
                      <span className="text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>Revisar ruta: los clientes tardan +{item.avgDelayPercentage}% de días pactados en pagar.</span>
                      </span>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Excelente efectividad: cobra en término según los plazos establecidos.</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
