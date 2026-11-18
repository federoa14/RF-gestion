import React, { useMemo, useState } from 'react';
import {
  Snowflake,
  Search,
  MessageCircle,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Shirt,
  Calendar,
  X,
  Send,
} from 'lucide-react';
import { Boleta, Client, DistributorConfig } from '../types';
import { formatCurrency, formatDateEs } from '../utils/alerts';
import {
  analyzeColdClientsForIndumentaria,
  ColdClientOpportunity,
} from '../utils/coldClientsRadar';
import { createWhatsAppUrl } from '../utils/whatsapp';

interface ColdClientsRadarPanelProps {
  clients: Client[];
  boletas: Boleta[];
  paidBoletas: Boleta[];
  config: DistributorConfig;
  activeUserName?: string;
  currentDateRef?: string;
  onViewClientDetail: (client: Client) => void;
  onMarkClientReactivated: (client: Client, dateStr: string) => void;
  onCreateSaleForClient?: (client: Client) => void;
}

export const ColdClientsRadarPanel: React.FC<ColdClientsRadarPanelProps> = ({
  clients,
  boletas,
  paidBoletas,
  config,
  activeUserName = 'Administración',
  currentDateRef,
  onViewClientDetail,
  onMarkClientReactivated,
  onCreateSaleForClient,
}) => {
  const [thresholdDays, setThresholdDays] = useState<number>(30);
  const [debtFilter, setDebtFilter] = useState<'all' | 'clear_only' | 'with_debt'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewTarget, setPreviewTarget] = useState<{
    opportunity: ColdClientOpportunity;
    messageText: string;
    phone: string;
  } | null>(null);

  if (config.businessRubro !== 'indumentaria') return null;

  const refDate = currentDateRef || new Date().toISOString().split('T')[0];

  const allColdOpportunities = useMemo(
    () =>
      analyzeColdClientsForIndumentaria({
        clients,
        boletas,
        paidBoletas,
        config,
        senderName: activeUserName,
        thresholdDays,
        referenceDateStr: refDate,
      }),
    [clients, boletas, paidBoletas, config, activeUserName, thresholdDays, refDate]
  );

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allColdOpportunities.filter((opp) => {
      if (debtFilter === 'clear_only' && !opp.isClearToOffer) return false;
      if (debtFilter === 'with_debt' && opp.isClearToOffer) return false;
      if (!q) return true;
      return (
        opp.client.name.toLowerCase().includes(q) ||
        (opp.client.contactPerson || '').toLowerCase().includes(q) ||
        (opp.favoriteItemLabel || '').toLowerCase().includes(q) ||
        (opp.client.zone || '').toLowerCase().includes(q)
      );
    });
  }, [allColdOpportunities, debtFilter, searchTerm]);

  const clearCount = allColdOpportunities.filter((o) => o.isClearToOffer).length;
  const veryColdCount = allColdOpportunities.filter((o) => o.coldLevel === 'muy_frio').length;
  const historicalVolumeAtRisk = allColdOpportunities.reduce(
    (acc, o) => acc + o.totalHistoricalSpent,
    0
  );

  const handleOpenWhatsAppModal = (opp: ColdClientOpportunity) => {
    setPreviewTarget({
      opportunity: opp,
      messageText: opp.suggestedMessage,
      phone: opp.client.phone || '',
    });
  };

  const handleSendWhatsApp = () => {
    if (!previewTarget) return;
    const url = createWhatsAppUrl(previewTarget.phone, previewTarget.messageText);
    window.open(url, '_blank', 'noopener,noreferrer');
    onMarkClientReactivated(previewTarget.opportunity.client, refDate);
    setPreviewTarget(null);
  };

  return (
    <div className="space-y-5">
      {/* Header & KPI Strip */}
      <div className="bg-white dark:bg-[#0B1933] p-5 rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0B1933] dark:bg-[#162E59] text-white flex items-center justify-center border border-[#B6C2D2]/25 shrink-0">
              <Snowflake className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#0B1933] dark:text-white">
                Radar de Clientes Fríos · Indumentaria
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                Detecta clientes que superaron su frecuencia habitual o llevan más días de lo normal sin comprar prendas, con WhatsApp personalizado según lo que más eligen.
              </p>
            </div>
          </div>

          {/* Threshold Segmented Control */}
          <div className="flex items-center gap-1.5 bg-[#F4F6F9] dark:bg-[#071021] p-1 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/20 self-start">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8] px-2 whitespace-nowrap">
              Inactivos desde:
            </span>
            {[21, 30, 45, 60].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setThresholdDays(days)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  thresholdDays === days
                    ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                    : 'text-slate-600 dark:text-[#94A3B8] hover:text-[#0B1933] dark:hover:text-white'
                }`}
              >
                +{days}d
              </button>
            ))}
          </div>
        </div>

        {/* 3 Clean Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 tabular-nums">
          <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/15">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8] block">
              Clientes para reactivar
            </span>
            <span className="text-xl font-black font-mono text-[#0B1933] dark:text-white">
              {allColdOpportunities.length}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] block">
              {veryColdCount} con demora prolongada (+60d o 2x ritmo)
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800/50">
            <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 block">
              Al día (listos para ofrecer)
            </span>
            <span className="text-xl font-black font-mono text-emerald-700 dark:text-emerald-400">
              {clearCount}
            </span>
            <span className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 block">
              Sin saldo pendiente · Prioridad de venta
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/15">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8] block">
              Facturación histórica de este grupo
            </span>
            <span className="text-xl font-black font-mono text-[#0B1933] dark:text-white">
              {formatCurrency(historicalVolumeAtRisk, config.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] block">
              Potencial de recompra en temporada
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#0B1933] p-3.5 rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar cliente frío o prenda que suele llevar (ej. Jean, Camperas)..."
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-[#0B1933] dark:text-white"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#F4F6F9] dark:bg-[#071021] p-1 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/20 text-xs">
          <button
            type="button"
            onClick={() => setDebtFilter('all')}
            className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer whitespace-nowrap ${
              debtFilter === 'all'
                ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                : 'text-slate-600 dark:text-[#94A3B8]'
            }`}
          >
            Todos ({allColdOpportunities.length})
          </button>
          <button
            type="button"
            onClick={() => setDebtFilter('clear_only')}
            className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer whitespace-nowrap ${
              debtFilter === 'clear_only'
                ? 'bg-emerald-700 text-white'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            Solo al día ({clearCount})
          </button>
          <button
            type="button"
            onClick={() => setDebtFilter('with_debt')}
            className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer whitespace-nowrap ${
              debtFilter === 'with_debt'
                ? 'bg-amber-700 text-white'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            Con saldo ({allColdOpportunities.length - clearCount})
          </button>
        </div>
      </div>

      {/* Results Table / Empty State */}
      {filtered.length === 0 ? (
        <div className="text-center py-14 bg-white dark:bg-[#0B1933] rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-2.5 px-4">
          <Snowflake className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
          <h4 className="font-bold text-sm text-[#0B1933] dark:text-white">
            No hay clientes fríos con el filtro seleccionado (+{thresholdDays} días)
          </h4>
          <p className="text-xs text-slate-500 dark:text-[#94A3B8] max-w-md mx-auto">
            Tus clientes de indumentaria compraron recientemente o todavía no superaron el umbral de {thresholdDays} días. Podés bajar el umbral a +21d para detectar oportunidades más tempranas.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#0B1933] rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0B1933] text-[#E2E8F0] font-semibold border-b border-[#B6C2D2]/25">
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Última Compra y Ritmo</th>
                  <th className="py-3 px-4">Qué Ofrecerle (Frecuente)</th>
                  <th className="py-3 px-4">Estado Cuenta</th>
                  <th className="py-3 px-4 text-right">Histórico</th>
                  <th className="py-3 px-4 text-right">Acciones de Reactivación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#B6C2D2]/15 tabular-nums">
                {filtered.map((opp) => (
                  <tr
                    key={opp.client.id}
                    className="hover:bg-[#F8FAFC] dark:hover:bg-[#10203E] transition-colors"
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => onViewClientDetail(opp.client)}
                        className="font-bold text-[#0B1933] dark:text-white hover:underline text-left cursor-pointer"
                      >
                        {opp.client.name}
                      </button>
                      <div className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                        {opp.client.contactPerson && opp.client.contactPerson !== opp.client.name
                          ? `${opp.client.contactPerson} · `
                          : ''}
                        {opp.client.phone || 'Sin teléfono'}
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div
                        className={`font-mono font-bold ${
                          opp.coldLevel === 'muy_frio'
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        Hace {opp.daysSinceLastPurchase} días
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-[#94A3B8] font-mono">
                        {formatDateEs(opp.lastPurchaseDate)}
                        {opp.averageDaysBetweenPurchases !== null
                          ? ` · Ritmo ~${opp.averageDaysBetweenPurchases}d`
                          : ''}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {opp.favoriteItemLabel ? (
                        <div className="inline-flex items-center gap-1.5 font-semibold text-[#0B1933] dark:text-[#E2E8F0]">
                          <Shirt className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1] shrink-0" />
                          <span>
                            {opp.favoriteItemLabel} ({opp.favoriteItemCount}x)
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 dark:text-[#94A3B8]">
                          Indumentaria general ({opp.totalPurchasesCount} compras)
                        </span>
                      )}
                      {(opp.topWeekdayLabel || opp.topMonthPeriodLabel) && (
                        <div className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                          {[opp.topWeekdayLabel, opp.topMonthPeriodLabel].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {opp.isClearToOffer ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Al día ($ 0,00)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 font-mono">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Debe {formatCurrency(opp.pendingDebt, config.currencySymbol)}</span>
                        </span>
                      )}
                      {opp.isRecentlyContacted && opp.client.lastReactivationSentAt && (
                        <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-mono">
                          Contactado: {formatDateEs(opp.client.lastReactivationSentAt)}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-[#0B1933] dark:text-white whitespace-nowrap">
                      {formatCurrency(opp.totalHistoricalSpent, config.currencySymbol)}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onViewClientDetail(opp.client)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          title="Ver Ficha 360° y compras anteriores"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ficha</span>
                        </button>

                        {onCreateSaleForClient && (
                          <button
                            type="button"
                            onClick={() => onCreateSaleForClient(opp.client)}
                            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 hover:bg-slate-100 text-[#0B1933] dark:text-[#E2E8F0] text-[11px] font-semibold cursor-pointer"
                            title="Cargar venta nueva para este cliente"
                          >
                            + Venta
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenWhatsAppModal(opp)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                            opp.isRecentlyContacted
                              ? 'bg-slate-200 dark:bg-[#13264A] text-slate-700 dark:text-[#CBD5E1] hover:bg-slate-300'
                              : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                          }`}
                          title="Editar y enviar mensaje de reactivación por WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{opp.isRecentlyContacted ? 'Reenviar WA' : 'Ofrecer / WA'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Editable WhatsApp Reactivation Modal */}
      {previewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050C18]/75 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-[#B6C2D2]/15">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#0B1933] dark:text-white">
                    Reactivar Cliente: {previewTarget.opportunity.client.name}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                    Última compra hace {previewTarget.opportunity.daysSinceLastPurchase} días
                    {previewTarget.opportunity.favoriteItemLabel
                      ? ` · Frecuente: ${previewTarget.opportunity.favoriteItemLabel}`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                  Teléfono / WhatsApp destino:
                </label>
                <input
                  type="text"
                  value={previewTarget.phone}
                  onChange={(e) =>
                    setPreviewTarget({ ...previewTarget, phone: e.target.value })
                  }
                  placeholder="Ej. 54911..."
                  className="w-full text-xs font-mono p-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-[#0B1933] dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                  Mensaje sugerido (editable antes de abrir WhatsApp):
                </label>
                <textarea
                  rows={8}
                  value={previewTarget.messageText}
                  onChange={(e) =>
                    setPreviewTarget({ ...previewTarget, messageText: e.target.value })
                  }
                  className="w-full text-xs p-3 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-[#0B1933] dark:text-[#E2E8F0] leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-[#B6C2D2]/15">
              <button
                type="button"
                onClick={() => {
                  onMarkClientReactivated(previewTarget.opportunity.client, refDate);
                  setPreviewTarget(null);
                }}
                className="text-xs font-semibold text-slate-500 hover:text-[#0B1933] dark:text-[#94A3B8] dark:hover:text-white cursor-pointer flex items-center gap-1"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Solo marcar contactado</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewTarget(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-[#13264A] rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Abrir en WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
