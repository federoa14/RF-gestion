import React, { useMemo } from 'react';
import {
  X,
  User,
  Phone,
  MapPin,
  Calendar,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Edit2,
  FileText,
  MessageCircle,
  PlusCircle,
  Clock,
  Sparkles,
  DollarSign,
  CreditCard,
  RefreshCw,
  Check,
} from 'lucide-react';
import { Boleta, Client, DistributorConfig } from '../types';
import { formatCurrency, formatDateEs } from '../utils/alerts';
import { analyzeClientPurchaseInsights } from '../utils/clientInsights';
import { getBusinessLabels } from '../utils/businessMode';
import { createWhatsAppUrl } from '../utils/whatsapp';
import { createClientPaymentLink, buildClientPaymentWhatsAppHref } from '../utils/clientPaymentLinks';

interface ClientDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  boletas: Boleta[];
  paidBoletas: Boleta[];
  config: DistributorConfig;
  currentDateRef?: string;
  onEditClient: (client: Client) => void;
  onOpenStatement: (client: Client) => void;
  onQuickSendStatement?: (client: Client) => void;
  onCreateSaleForClient?: (client: Client) => void;
}

export const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  isOpen,
  onClose,
  client,
  boletas,
  paidBoletas,
  config,
  currentDateRef,
  onEditClient,
  onOpenStatement,
  onQuickSendStatement,
  onCreateSaleForClient,
}) => {
  const [isGeneratingLink, setIsGeneratingLink] = React.useState(false);
  const [generatedLinkFeedback, setGeneratedLinkFeedback] = React.useState<{
    payUrl: string;
    error?: string;
  } | null>(null);

  React.useEffect(() => {
    setGeneratedLinkFeedback(null);
  }, [isOpen, client?.id]);

  const insights = useMemo(() => {
    if (!client) return null;
    return analyzeClientPurchaseInsights(client, boletas, paidBoletas, currentDateRef);
  }, [client, boletas, paidBoletas, currentDateRef]);

  if (!isOpen || !client || !insights) return null;

  const labels = getBusinessLabels(config);
  const creditLimit = client.creditLimit && client.creditLimit > 0 ? client.creditLimit : 0;
  const availableCredit = creditLimit > 0 ? Math.max(0, creditLimit - insights.pendingDebtTotal) : null;

  const clientPendingBoletas = boletas.filter(
    (b) => b.clientId === client.id && b.status === 'pending'
  );

  const handleSendPaymentLinkWhatsApp = async () => {
    setIsGeneratingLink(true);
    setGeneratedLinkFeedback(null);
    try {
      const { payUrl, order } = await createClientPaymentLink({
        client,
        pendingBoletas: clientPendingBoletas,
        config,
      });
      if (navigator.clipboard) {
        navigator.clipboard.writeText(payUrl).catch(() => {});
      }
      setGeneratedLinkFeedback({ payUrl });
      const href = buildClientPaymentWhatsAppHref({
        phone: client.phone || '',
        client,
        order,
        payUrl,
        config,
      });
      window.open(href, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setGeneratedLinkFeedback({
        payUrl: '',
        error: err.message || 'No se pudo generar el enlace de pago.',
      });
    } finally {
      setIsGeneratingLink(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050C18]/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-[#091428] text-white border-b border-[#B6C2D2]/20 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#162E59] border border-[#B6C2D2]/30 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-[#E2E8F0]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {client.clientNumber && (
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-[#13264A] border border-[#B6C2D2]/25 text-[#CBD5E1]">
                    {client.clientNumber}
                  </span>
                )}
                <h2 className="text-base sm:text-lg font-bold text-white truncate">{client.name}</h2>
                {insights.isDebtor ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-900/80 text-rose-200 border border-rose-500/40">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Con Deuda Pendiente</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Sin Deuda (Al Día)</span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#94A3B8] mt-1">
                <span>Titular: <strong className="text-[#E2E8F0]">{client.contactPerson || '—'}</strong></span>
                {client.zone && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{client.address ? `${client.address} (${client.zone})` : client.zone}</span>
                  </span>
                )}
                {client.phone && (
                  <span className="inline-flex items-center gap-1 font-mono text-[#CBD5E1]">
                    <Phone className="w-3 h-3" />
                    <span>{client.phone}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-[#13264A] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Actions Bar */}
        <div className="px-6 py-3 bg-[#F4F6F9] dark:bg-[#071021] border-b border-[#CBD5E1] dark:border-[#B6C2D2]/15 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {onCreateSaleForClient && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateSaleForClient(client);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Cargar {labels.saleSingular}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenStatement(client);
              }}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Estado de Cuenta / Cobrar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onEditClient(client);
              }}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Editar Datos / Tope</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onQuickSendStatement && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onQuickSendStatement(client);
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Enviar Estado de Cuenta completo por WhatsApp (Escrito, Imagen PNG o PDF sin link)"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Enviar Estado de Cuenta WA</span>
              </button>
            )}

            {insights.pendingDebtTotal > 0 && (
              <button
                type="button"
                disabled={isGeneratingLink}
                onClick={handleSendPaymentLinkWhatsApp}
                className="px-3 py-1.5 rounded-lg bg-[#009EE3] hover:bg-[#008AD0] disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {isGeneratingLink ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CreditCard className="w-3.5 h-3.5" />
                )}
                <span>Enviar Link de Pago por WhatsApp</span>
              </button>
            )}

            {client.phone && (
              <a
                href={createWhatsAppUrl(
                  client.phone,
                  `Hola ${client.contactPerson || client.name}, te escribimos de ${config.distributorName}.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] text-xs font-bold inline-flex items-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Chat WA</span>
              </a>
            )}
          </div>
        </div>

        {generatedLinkFeedback && (
          <div
            className={`px-6 py-2.5 text-xs border-b flex items-center justify-between gap-2 flex-wrap ${
              generatedLinkFeedback.error
                ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                : 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/50 text-sky-900 dark:text-sky-200'
            }`}
          >
            {generatedLinkFeedback.error ? (
              <span>{generatedLinkFeedback.error}</span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Link generado y copiado ({config.merchantPaymentAlias ? `Alias: ${config.merchantPaymentAlias}` : 'Mercado Pago / Tarjeta'}):{' '}
                    <span className="font-mono underline">{generatedLinkFeedback.payUrl}</span>
                  </span>
                </span>
                <span className="text-[11px] opacity-80">
                  Al acreditarse el pago, las boletas se marcan como PAGADAS automáticamente.
                </span>
              </>
            )}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* 1. KPI Strip: Debt, Credit Limit, Frequency, Last Purchase */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
            <div
              className={`p-3.5 rounded-xl border ${
                insights.isDebtor
                  ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800/60'
                  : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
              }`}
            >
              <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-[#94A3B8] flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" />
                <span>Saldo Actual</span>
              </span>
              <div
                className={`text-lg font-mono font-black mt-1 ${
                  insights.isDebtor
                    ? 'text-rose-700 dark:text-rose-300'
                    : 'text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {formatCurrency(insights.pendingDebtTotal, config.currencySymbol)}
              </div>
              <span className="text-[11px] text-slate-600 dark:text-[#CBD5E1]">
                {insights.isDebtor
                  ? `${insights.pendingCount} comprobante(s) pendiente(s)`
                  : 'Cuenta al día sin saldo pendiente'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
              <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-[#94A3B8]">
                Tope de Fiado ($)
              </span>
              <div className="text-lg font-mono font-black text-[#0B1933] dark:text-white mt-1">
                {creditLimit > 0 ? formatCurrency(creditLimit, config.currencySymbol) : 'Sin tope'}
              </div>
              <span className="text-[11px] text-slate-600 dark:text-[#CBD5E1]">
                {availableCredit !== null
                  ? `Disponible: ${formatCurrency(availableCredit, config.currencySymbol)}`
                  : 'Límite abierto / configurable'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
              <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-[#94A3B8] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Última Compra</span>
              </span>
              <div className="text-lg font-mono font-black text-[#0B1933] dark:text-white mt-1">
                {insights.lastPurchaseDate ? formatDateEs(insights.lastPurchaseDate) : 'Sin compras'}
              </div>
              <span className="text-[11px] text-slate-600 dark:text-[#CBD5E1]">
                {insights.daysSinceLastPurchase !== null
                  ? insights.daysSinceLastPurchase === 0
                    ? 'Compró hoy'
                    : `Hace ${insights.daysSinceLastPurchase} día(s)`
                  : 'Aún sin operaciones'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
              <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-[#94A3B8] flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Volumen Histórico</span>
              </span>
              <div className="text-lg font-mono font-black text-[#0B1933] dark:text-white mt-1">
                {formatCurrency(insights.totalHistoricalSpent, config.currencySymbol)}
              </div>
              <span className="text-[11px] text-slate-600 dark:text-[#CBD5E1]">
                {insights.totalPurchasesCount} operación(es) ·{' '}
                {insights.averageDaysBetweenPurchases !== null
                  ? `Cada ~${insights.averageDaysBetweenPurchases}d`
                  : 'Frecuencia en cálculo'}
              </span>
            </div>
          </div>

          {/* 2. Commercial Intelligence Banner */}
          <div className="p-4 rounded-xl bg-[#091428] text-white border border-[#B6C2D2]/25 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[#162E59] border border-[#B6C2D2]/25 shrink-0">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div className="text-xs space-y-1">
              <div className="font-bold text-[#E2E8F0]">
                Qué ofrecerle y cuándo — Análisis de hábitos del cliente
              </div>
              <p className="text-[#CBD5E1] leading-relaxed">{insights.recommendationText}</p>
            </div>
          </div>

          {/* 3. Two-Column Insights: Top Frequent Items + Frequent Dates/Days */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Products / What to Offer */}
            <div className="p-4 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B1933] dark:text-white flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-[#162E59] dark:text-[#CBD5E1]" />
                  <span>Lo que Compra con Más Frecuencia</span>
                </h3>
                <span className="text-[10px] font-mono text-slate-500 dark:text-[#94A3B8]">
                  Qué ofrecerle
                </span>
              </div>

              {insights.topItems.length === 0 ? (
                <div className="p-4 rounded-lg bg-white dark:bg-[#071021] border border-dashed border-[#CBD5E1] dark:border-[#B6C2D2]/20 text-xs text-slate-500 dark:text-[#94A3B8]">
                  No hay detalle de productos todavía. Al cargar un canasto por producto o completar el campo «Detalle de prenda / producto», se rankean automáticamente aquí.
                </div>
              ) : (
                <div className="space-y-2">
                  {insights.topItems.map((item, idx) => {
                    const maxCount = insights.topItems[0]?.purchaseCount || 1;
                    const barWidth = Math.max(18, Math.round((item.purchaseCount / maxCount) * 100));
                    return (
                      <div
                        key={item.key}
                        className="p-2.5 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-1.5 text-xs tabular-nums"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[#0B1933] dark:text-white truncate">
                            {idx + 1}. {item.label}
                          </span>
                          <span className="font-mono font-bold text-[#162E59] dark:text-[#E2E8F0] shrink-0">
                            {item.purchaseCount} {item.purchaseCount === 1 ? 'vez' : 'veces'} ({item.totalUnits} u.)
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-[#071021] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#0B1933] dark:bg-[#CBD5E1]"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-[#94A3B8] font-mono">
                          <span>Total acumulado: {formatCurrency(item.totalSpent, config.currencySymbol)}</span>
                          <span>Última vez: {formatDateEs(item.lastDate)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Frequent Dates & Buying Cadence */}
            <div className="p-4 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B1933] dark:text-white flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#162E59] dark:text-[#CBD5E1]" />
                  <span>Fechas y Días Más Frecuentes</span>
                </h3>
                <span className="text-[10px] font-mono text-slate-500 dark:text-[#94A3B8]">
                  Cuándo contactarlo
                </span>
              </div>

              {insights.topWeekdays.length === 0 ? (
                <div className="p-4 rounded-lg bg-white dark:bg-[#071021] border border-dashed border-[#CBD5E1] dark:border-[#B6C2D2]/20 text-xs text-slate-500 dark:text-[#94A3B8]">
                  Aún no hay fechas suficientes registradas para calcular el patrón de días habituales.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Momento del mes */}
                  <div className="p-3 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-2">
                    <div className="text-[11px] font-bold text-slate-600 dark:text-[#CBD5E1]">
                      Momento del Mes Habitual:
                    </div>
                    <div className="space-y-1.5">
                      {insights.topMonthPeriods.map((mp) => (
                        <div key={mp.label} className="space-y-1 text-xs tabular-nums">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#0B1933] dark:text-white">
                              {mp.label}{' '}
                              {mp.subLabel && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({mp.subLabel})
                                </span>
                              )}
                            </span>
                            <span className="font-mono font-bold text-[#0B1933] dark:text-[#E2E8F0]">
                              {mp.count} ({mp.percent}%)
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-[#071021] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
                              style={{ width: `${Math.max(8, mp.percent)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Días de la semana */}
                  <div className="p-3 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-2">
                    <div className="text-[11px] font-bold text-slate-600 dark:text-[#CBD5E1]">
                      Días de la Semana en que Suele Comprar:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {insights.topWeekdays.map((wd, idx) => (
                        <span
                          key={wd.label}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border ${
                            idx === 0
                              ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#E2E8F0] dark:text-[#091428]'
                              : 'bg-[#F8FAFC] dark:bg-[#071021] text-slate-700 dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#B6C2D2]/25'
                          }`}
                        >
                          {wd.label}: {wd.count} ({wd.percent}%)
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4. Últimas Compras y Fechas */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B1933] dark:text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#162E59] dark:text-[#CBD5E1]" />
                <span>Últimas Compras y Fechas ({insights.recentPurchases.length})</span>
              </h3>
            </div>

            {insights.recentPurchases.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-xs text-slate-500 dark:text-[#94A3B8]">
                Este cliente aún no tiene compras o comprobantes cargados.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F4F6F9] dark:bg-[#091428] text-[10px] font-bold uppercase text-slate-500 dark:text-[#94A3B8] border-b border-[#CBD5E1] dark:border-[#B6C2D2]/20">
                      <th className="py-2.5 px-3">Fecha Compra</th>
                      <th className="py-2.5 px-3">Comprobante</th>
                      <th className="py-2.5 px-3">Detalle / Productos</th>
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-3 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#B6C2D2]/10 bg-white dark:bg-[#071021] tabular-nums">
                    {insights.recentPurchases.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-[#0B1933]">
                        <td className="py-2.5 px-3 font-mono whitespace-nowrap text-slate-700 dark:text-[#CBD5E1]">
                          {formatDateEs(rec.saleDate)}
                          <span className="block text-[10px] text-slate-400">
                            Vto: {formatDateEs(rec.dueDate)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[#0B1933] dark:text-white whitespace-nowrap">
                          #{rec.boletaNumber}
                          <span className="block text-[10px] font-sans font-normal text-slate-400">
                            {rec.salespersonName}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 dark:text-[#CBD5E1] max-w-xs">
                          <span className="line-clamp-2">{rec.itemsText}</span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {rec.status === 'paid' || rec.status === 'purged_paid' ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                              Pagada {rec.paidAt ? `(${formatDateEs(rec.paidAt)})` : ''}
                            </span>
                          ) : rec.status === 'partial' ? (
                            <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold text-[10px]">
                              Parcial (Debe {formatCurrency(rec.balanceDue, config.currencySymbol)})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-bold text-[10px]">
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0B1933] dark:text-white whitespace-nowrap">
                          {formatCurrency(rec.amount, config.currencySymbol)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
