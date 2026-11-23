import React, { useMemo, useState } from 'react';
import {
  Award,
  Calendar,
  Download,
  Gift,
  MessageCircle,
  Percent,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  CatalogLoyaltyAccount,
  CatalogPickupOrder,
  CatalogProduct,
  OnlineCatalogSettings,
} from '../types';
import { formatCurrency } from '../utils/alerts';
import { createWhatsAppUrl } from '../utils/whatsapp';
import {
  AudienceSegmentKey,
  WebLoyaltyCustomerInsight,
  buildWebLoyaltyCustomerInsights,
} from '../utils/webLoyaltyInsights';

interface WebLoyaltyClientsPanelProps {
  loyaltyAccounts: CatalogLoyaltyAccount[];
  orders: CatalogPickupOrder[];
  products: CatalogProduct[];
  settings: OnlineCatalogSettings;
  currencySymbol: string;
  catalogPublicUrl?: string;
  onRefreshLoyaltyAccounts?: () => Promise<void> | void;
  showToast?: (msg: string) => void;
}

type PromoTemplateMode = 'sugerencia_categoria' | 'puntos_descuento' | 'fecha_especial' | 'cupon_regalo';

function formatShortDateEs(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function escapeCsvCell(raw: string | number): string {
  const s = String(raw ?? '');
  if (/[",\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const WebLoyaltyClientsPanel: React.FC<WebLoyaltyClientsPanelProps> = ({
  loyaltyAccounts,
  orders,
  products,
  settings,
  currencySymbol,
  catalogPublicUrl,
  onRefreshLoyaltyAccounts,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<'all' | AudienceSegmentKey>('all');
  const [seasonFilter, setSeasonFilter] = useState<string>('all');
  const [onlyUnlocked, setOnlyUnlocked] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // WhatsApp Promo Composer Modal State
  const [composerCustomer, setComposerCustomer] = useState<WebLoyaltyCustomerInsight | null>(null);
  const [composerPhone, setComposerPhone] = useState('');
  const [templateMode, setTemplateMode] = useState<PromoTemplateMode>('sugerencia_categoria');
  const [selectedCouponCode, setSelectedCouponCode] = useState('');
  const [composerMessage, setComposerMessage] = useState('');

  const storeName = settings.storeName || 'Nuestra Tienda';
  const activeCoupons = useMemo(
    () => (settings.coupons || []).filter((c) => c.active !== false),
    [settings.coupons]
  );

  const insights = useMemo(
    () =>
      buildWebLoyaltyCustomerInsights({
        loyaltyAccounts,
        orders,
        products,
        loyaltyTiers: settings.loyaltyTiers,
      }),
    [loyaltyAccounts, orders, products, settings.loyaltyTiers]
  );

  const availableSeasons = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of insights.customers) {
      for (const p of c.commercialPeriods) {
        if (!map.has(p.key)) map.set(p.key, p.label);
      }
    }
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [insights.customers]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return insights.customers.filter((c) => {
      if (audienceFilter !== 'all' && c.dominantAudience !== audienceFilter) {
        return false;
      }
      if (
        seasonFilter !== 'all' &&
        !c.commercialPeriods.some((p) => p.key === seasonFilter)
      ) {
        return false;
      }
      if (onlyUnlocked && !c.highestUnlockedTier) {
        return false;
      }
      if (!q) return true;
      return (
        c.dni.includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        c.customerPhone.toLowerCase().includes(q) ||
        c.dominantAudienceLabel.toLowerCase().includes(q) ||
        c.topProducts.some((p) => p.productName.toLowerCase().includes(q)) ||
        (c.topCommercialPeriod?.label || '').toLowerCase().includes(q)
      );
    });
  }, [insights.customers, searchQuery, audienceFilter, seasonFilter, onlyUnlocked]);

  const unlockedClientsCount = useMemo(
    () => insights.customers.filter((c) => Boolean(c.highestUnlockedTier)).length,
    [insights.customers]
  );

  const buildPersonalizedMessage = (
    customer: WebLoyaltyCustomerInsight,
    mode: PromoTemplateMode,
    couponCode?: string
  ): string => {
    const firstName = customer.customerName.split(' ')[0] || 'Hola';
    const topProd = customer.topProducts[0]?.productName;
    const catHint =
      customer.dominantAudience !== 'otro'
        ? `la línea de *${customer.dominantAudienceLabel}*`
        : customer.topCategories[0]?.category
        ? `*${customer.topCategories[0].category}*`
        : 'nuestro catálogo';
    const catalogLinkLine = catalogPublicUrl
      ? `\n\n🛍️ Mirá el catálogo acá y sumá más puntos con tu DNI (${customer.dni}):\n${catalogPublicUrl}`
      : `\n\n🪪 Recordá ingresar tu *DNI ${customer.dni}* arriba del catálogo web para seguir sumando puntos.`;

    if (mode === 'puntos_descuento') {
      const unlockLine = customer.highestUnlockedTier
        ? `¡Ya tenés *${customer.pointsBalance} puntos* acumulados y desbloqueaste *${customer.highestUnlockedTier.discountPercent}% OFF* para tu próxima compra!`
        : customer.nextTier
        ? `Tenés *${customer.pointsBalance} puntos* acumulados y te faltan solo *${Math.max(
            0,
            customer.nextTier.minPoints - customer.pointsBalance
          )} pts* para desbloquear *${customer.nextTier.discountPercent}% OFF*.`
        : `Ya tenés *${customer.pointsBalance} puntos* acumulados con tu DNI en nuestra tienda web.`;
      return (
        `¡Hola *${firstName}*! 👋 Te escribimos de *${storeName}*.\n\n` +
        `Como sos *Cliente Web* registrado con tu DNI, te contamos que:\n` +
        `🎁 ${unlockLine}\n\n` +
        `Podés canjear tu descuento directamente al finalizar tu compra web pagando con *Retiro en el local*, *Transferencia* o *Dinero en cuenta (Mercado Pago)*.` +
        catalogLinkLine
      );
    }

    if (mode === 'fecha_especial') {
      const seasonTarget =
        customer.topCommercialPeriod?.key.startsWith('dia_') ||
        customer.topCommercialPeriod?.key === 'navidad_fiestas'
          ? customer.topCommercialPeriod.label
          : customer.upcomingCommercialEvent.label;
      return (
        `¡Hola *${firstName}*! 🎉 Te saludamos de *${storeName}*.\n\n` +
        `Pensando en *${seasonTarget}* y sabiendo que como *Cliente Web* elegís ${catHint}` +
        `${topProd ? ` (especialmente *${topProd}*)` : ''}, armamos sugerencias y promociones especiales para vos.\n\n` +
        `${
          customer.highestUnlockedTier
            ? `Además recordá que tenés *${customer.pointsBalance} pts* (*${customer.highestUnlockedTier.discountPercent}% OFF* disponible con tu DNI).`
            : `Además con tu compra seguís sumando puntos con tu *DNI ${customer.dni}*.`
        }` +
        catalogLinkLine
      );
    }

    if (mode === 'cupon_regalo') {
      const matchedCoupon = activeCoupons.find((c) => c.code === couponCode) || activeCoupons[0];
      const couponText = matchedCoupon
        ? `Usá el cupón *${matchedCoupon.code}* (${
            matchedCoupon.discountType === 'percent'
              ? `${matchedCoupon.value}% OFF`
              : `${formatCurrency(matchedCoupon.value, currencySymbol)} OFF`
          }) en tu carrito web.`
        : `Consultanos por esta promo exclusiva para *Clientes Web* con un descuento especial en ${catHint}.`;
      return (
        `¡Hola *${firstName}*! 🏷️ En *${storeName}* tenemos una promoción especial para vos por ser *Cliente Web*:\n\n` +
        `✨ ${couponText}\n` +
        `Ideal para aprovechar en ${catHint}${topProd ? ` y llevarte novedades similares a *${topProd}*` : ''}.` +
        catalogLinkLine
      );
    }

    // Default: 'sugerencia_categoria'
    return (
      `¡Hola *${firstName}*! 👋 Te escribimos de *${storeName}*.\n\n` +
      `Vimos que sos *Cliente Web* habitual de ${catHint}` +
      `${topProd ? ` y que lo que más elegís es *${topProd}*` : ''}. ` +
      `Ingresaron novedades y opciones recomendadas justo de tu estilo que creemos que te pueden encantar.\n\n` +
      `${
        customer.highestUnlockedTier
          ? `🎁 Tenés *${customer.pointsBalance} pts* (*${customer.highestUnlockedTier.discountPercent}% OFF*) listos para canjear con retiro en el local, transferencia o Dinero en cuenta MP.`
          : `⭐ Con tu *DNI ${customer.dni}* ya tenés *${customer.pointsBalance} pts* acumulados para alcanzar descuentos.`
      }` +
      catalogLinkLine
    );
  };

  const openWhatsAppComposer = (customer: WebLoyaltyCustomerInsight) => {
    const defaultMode: PromoTemplateMode = customer.highestUnlockedTier
      ? 'puntos_descuento'
      : 'sugerencia_categoria';
    const defaultCoupon = activeCoupons[0]?.code || '';
    setComposerCustomer(customer);
    setComposerPhone(customer.customerPhone || '');
    setTemplateMode(defaultMode);
    setSelectedCouponCode(defaultCoupon);
    setComposerMessage(buildPersonalizedMessage(customer, defaultMode, defaultCoupon));
  };

  const handleTemplateSwitch = (nextMode: PromoTemplateMode, couponOverride?: string) => {
    if (!composerCustomer) return;
    const code = couponOverride ?? selectedCouponCode;
    setTemplateMode(nextMode);
    setComposerMessage(buildPersonalizedMessage(composerCustomer, nextMode, code));
  };

  const handleExportCsv = () => {
    const headers = [
      'Tipo',
      'DNI',
      'Cliente',
      'Telefono WhatsApp',
      'Puntos Disponibles',
      'Descuento Desbloqueado',
      'Compras Web',
      'Total Comprado',
      'Porcentaje Dinero Web (%)',
      'Categoria Principal (Hombre/Mujer/Nino)',
      'Lo Que Mas Compra',
      'Periodo / Fecha Pico',
      'Parte del Mes Habitual',
      'Ultima Compra',
    ];
    const rows = filteredCustomers.map((c) => [
      'CLIENTE WEB',
      c.dni,
      c.customerName,
      c.customerPhone,
      c.pointsBalance,
      c.highestUnlockedTier ? `${c.highestUnlockedTier.discountPercent}% OFF` : 'En progreso',
      c.ordersCount,
      c.totalSpent.toFixed(2),
      `${c.revenueSharePercent.toFixed(1)}%`,
      `${c.dominantAudienceLabel} (${c.dominantAudiencePercent}%)`,
      c.mostPurchasedSummary,
      c.topCommercialPeriod
        ? `${c.topCommercialPeriod.label} (${c.topCommercialPeriod.percent}%)`
        : '—',
      c.topMonthPeriod ? `${c.topMonthPeriod.label} (${c.topMonthPeriod.percent}%)` : '—',
      formatShortDateEs(c.lastOrderAt),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes_web_puntos_dni_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast?.('Listado de Clientes Web (DNI) descargado en CSV.');
  };

  return (
    <div className="space-y-4">
      {/* Header & Summary Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#0B1933]" />
              <span>Clientes Web · Participantes del Programa de Puntos por DNI</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cada persona identificada con su DNI queda marcada como{' '}
              <strong className="text-[#0B1933]">Cliente Web</strong> con su perfil de consumo
              (productos top, % del dinero comprado, Mujer/Hombre/Niño y fechas especiales) para enviarle promos por WhatsApp.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onRefreshLoyaltyAccounts && (
              <button
                type="button"
                disabled={isRefreshing}
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    await onRefreshLoyaltyAccounts();
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Actualizar</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredCustomers.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-50 text-white cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* 4 KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center justify-between">
              <span>Clientes Web (DNI)</span>
              <Users className="w-3.5 h-3.5 text-[#0B1933]" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {insights.customers.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Marcados como Cliente Web
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center justify-between">
              <span>% Dinero Comprado (DNI)</span>
              <Percent className="w-3.5 h-3.5 text-emerald-700" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {insights.totalLoyaltySharePercent.toFixed(1)}%
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
              {formatCurrency(insights.totalLoyaltyRevenue, currencySymbol)} de{' '}
              {formatCurrency(insights.totalStoreWebRevenue, currencySymbol)} web
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center justify-between">
              <span>Con Descuento Listo</span>
              <Award className="w-3.5 h-3.5 text-indigo-700" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-indigo-700 mt-1">
              {unlockedClientsCount}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Listos para recordarles canje por WhatsApp
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center justify-between">
              <span>Próxima Fecha Comercial</span>
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-sm font-bold text-slate-900 mt-1">
              {insights.upcomingEvent.label}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {insights.upcomingEvent.hint}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por DNI, nombre, WhatsApp o producto comprado..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  { id: 'mujer', label: 'Mujer' },
                  { id: 'hombre', label: 'Hombre' },
                  { id: 'nino', label: 'Niño' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAudienceFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors ${
                    audienceFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {availableSeasons.length > 0 && (
              <select
                value={seasonFilter}
                onChange={(e) => setSeasonFilter(e.target.value)}
                aria-label="Filtrar por período comercial"
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="all">Todas las fechas / períodos</option>
                {availableSeasons.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}

            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyUnlocked}
                onChange={(e) => setOnlyUnlocked(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Con descuento listo</span>
            </label>
          </div>
        </div>
      </div>

      {/* Customer Cards List */}
      {filteredCustomers.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-2">
          <UserCheck className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="text-sm font-bold text-slate-800">
            {insights.customers.length === 0
              ? 'Todavía no hay Clientes Web registrados con su DNI'
              : 'Ningún Cliente Web coincide con los filtros seleccionados'}
          </div>
          <p className="text-xs text-slate-500 max-w-lg mx-auto">
            {insights.customers.length === 0
              ? 'Cuando tus clientes ingresen su DNI en la página del catálogo para sumar o canjear puntos, aparecerán acá automáticamente marcados como Cliente Web con su análisis de compras.'
              : 'Probá limpiando el buscador o seleccionando otra categoría o período comercial.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCustomers.map((customer) => {
            const mujerStat = customer.audienceBreakdown.find((a) => a.key === 'mujer');
            const hombreStat = customer.audienceBreakdown.find((a) => a.key === 'hombre');
            const ninoStat = customer.audienceBreakdown.find((a) => a.key === 'nino');

            return (
              <div
                key={customer.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 hover:border-slate-300 transition-colors"
              >
                {/* Top Identity Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0B1933] text-white text-[10px] font-bold tracking-wide uppercase">
                        <UserCheck className="w-3 h-3 text-emerald-300" />
                        <span>Cliente Web</span>
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                        DNI {customer.dni}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">
                        {customer.customerName}
                      </h4>
                      {customer.customerPhone && (
                        <span className="text-xs font-mono text-slate-500">
                          · {customer.customerPhone}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-slate-600">
                      <span>
                        Puntos disponibles:{' '}
                        <strong className="text-[#0B1933]">{customer.pointsBalance} pts</strong>
                      </span>
                      <span>·</span>
                      <span>
                        {customer.highestUnlockedTier ? (
                          <strong className="text-emerald-700">
                            Desbloqueó {customer.highestUnlockedTier.discountPercent}% OFF
                          </strong>
                        ) : customer.nextTier ? (
                          <span>
                            A {customer.nextTier.minPoints - customer.pointsBalance} pts del{' '}
                            {customer.nextTier.discountPercent}% OFF
                          </span>
                        ) : (
                          <span>Participando en puntos</span>
                        )}
                      </span>
                      <span>·</span>
                      <span>Última compra: {formatShortDateEs(customer.lastOrderAt)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openWhatsAppComposer(customer)}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shrink-0 shadow-2xs"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Enviar Promo / Sugerencia WhatsApp</span>
                  </button>
                </div>

                {/* 4 Requested Analytics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  {/* 1. Qué es lo que más compra */}
                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-[#0B1933]" />
                      <span>Qué es lo que más compra</span>
                    </div>
                    {customer.topProducts.length === 0 ? (
                      <div className="text-[11px] text-slate-500">
                        Sin ítems detallados todavía.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {customer.topProducts.slice(0, 3).map((prod, idx) => (
                          <div
                            key={prod.key}
                            className="flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="font-medium text-slate-800 truncate">
                              {idx + 1}. {prod.productName}
                            </span>
                            <span className="font-mono tabular-nums font-bold text-slate-700 shrink-0">
                              {prod.units} u.
                            </span>
                          </div>
                        ))}
                        {customer.topCategories[0] && (
                          <div className="text-[10px] text-slate-500 pt-0.5">
                            Rubro principal: <strong>{customer.topCategories[0].category}</strong>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 2. % de dinero que compra */}
                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Porcentaje de dinero que compra</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-lg font-bold font-mono tabular-nums text-emerald-700">
                        {customer.revenueSharePercent.toFixed(1)}%
                      </span>
                      <span className="text-[11px] font-mono tabular-nums font-bold text-slate-800">
                        {formatCurrency(customer.totalSpent, currencySymbol)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(customer.totalSpent > 0 ? 4 : 0, customer.revenueSharePercent))}%`,
                        }}
                      />
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-slate-500">
                      {customer.ordersCount} pedido(s) · Ticket prom.{' '}
                      {formatCurrency(customer.averageTicket, currencySymbol)}
                    </div>
                  </div>

                  {/* 3. Categoría Hombre, Mujer o Niño */}
                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-indigo-700" />
                      <span>Categoría Hombre / Mujer / Niño</span>
                    </div>
                    <div className="text-xs font-bold text-[#0B1933]">
                      {customer.dominantAudienceLabel}
                      {customer.dominantAudiencePercent > 0
                        ? ` (${customer.dominantAudiencePercent}%)`
                        : ''}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono tabular-nums pt-0.5">
                      <div className="bg-white border border-slate-200 rounded-md px-1.5 py-1 text-center">
                        <div className="text-slate-500 font-sans">Mujer</div>
                        <div className="font-bold text-slate-900">{mujerStat?.percent || 0}%</div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-md px-1.5 py-1 text-center">
                        <div className="text-slate-500 font-sans">Hombre</div>
                        <div className="font-bold text-slate-900">{hombreStat?.percent || 0}%</div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-md px-1.5 py-1 text-center">
                        <div className="text-slate-500 font-sans">Niño</div>
                        <div className="font-bold text-slate-900">{ninoStat?.percent || 0}%</div>
                      </div>
                    </div>
                  </div>

                  {/* 4. Período de fecha donde compra más */}
                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      <span>Período / fecha en que compra más</span>
                    </div>
                    {customer.topCommercialPeriod ? (
                      <>
                        <div className="text-xs font-bold text-slate-900">
                          {customer.topCommercialPeriod.label}{' '}
                          <span className="font-mono text-amber-700">
                            ({customer.topCommercialPeriod.percent}%)
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {customer.topCommercialPeriod.hint}
                        </div>
                        {customer.commercialPeriods.length > 1 && (
                          <div className="text-[10px] text-slate-600 truncate">
                            También: {customer.commercialPeriods[1].label} (
                            {customer.commercialPeriods[1].percent}%)
                          </div>
                        )}
                        {customer.topMonthPeriod && (
                          <div className="text-[10px] font-medium text-slate-500">
                            Momento del mes: {customer.topMonthPeriod.label} (
                            {customer.topMonthPeriod.percent}%)
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-[11px] text-slate-500">
                        Sin fechas registradas aún.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* WhatsApp Promo & Suggestion Composer Modal */}
      {composerCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-[#0B1933] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-300" />
                <div>
                  <h4 className="text-sm font-bold">
                    Enviar Sugerencia o Promo por WhatsApp
                  </h4>
                  <p className="text-[11px] text-slate-300 font-mono">
                    CLIENTE WEB · DNI {composerCustomer.dni} · {composerCustomer.customerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setComposerCustomer(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Customer Mini Insights */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500 block">Categoría que más compra:</span>
                  <strong className="text-slate-900">
                    {composerCustomer.dominantAudienceLabel} ({composerCustomer.dominantAudiencePercent}%)
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Puntos / Descuento:</span>
                  <strong className="text-emerald-700 font-mono">
                    {composerCustomer.pointsBalance} pts
                    {composerCustomer.highestUnlockedTier
                      ? ` (${composerCustomer.highestUnlockedTier.discountPercent}% OFF listo)`
                      : ''}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Lo que más compra:</span>
                  <strong className="text-slate-900 truncate block">
                    {composerCustomer.topProducts[0]?.productName || 'Varios'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Período habitual:</span>
                  <strong className="text-slate-900">
                    {composerCustomer.topCommercialPeriod?.label ||
                      composerCustomer.upcomingCommercialEvent.label}
                  </strong>
                </div>
              </div>

              {/* Template Selector */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-slate-800">
                  Elegí el enfoque del mensaje
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: 'sugerencia_categoria',
                        label: 'Sugerencia por Categoría / Top',
                        icon: ShoppingBag,
                      },
                      {
                        id: 'puntos_descuento',
                        label: 'Recordar Puntos y % OFF',
                        icon: Award,
                      },
                      {
                        id: 'fecha_especial',
                        label: 'Promo por Fecha Especial',
                        icon: Calendar,
                      },
                      {
                        id: 'cupon_regalo',
                        label: 'Enviar Cupón / Descuento',
                        icon: Gift,
                      },
                    ] as const
                  ).map((item) => {
                    const Icon = item.icon;
                    const active = templateMode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleTemplateSwitch(item.id)}
                        className={`px-3 py-2 rounded-xl border text-left text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#0B1933] text-white border-[#0B1933]'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {templateMode === 'cupon_regalo' && activeCoupons.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Cupón a incluir en el mensaje
                  </label>
                  <select
                    value={selectedCouponCode}
                    onChange={(e) => {
                      setSelectedCouponCode(e.target.value);
                      handleTemplateSwitch('cupon_regalo', e.target.value);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                  >
                    {activeCoupons.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code} ·{' '}
                        {c.discountType === 'percent'
                          ? `${c.value}% OFF`
                          : `${formatCurrency(c.value, currencySymbol)} OFF`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">
                  Teléfono WhatsApp del Cliente Web
                </label>
                <input
                  type="tel"
                  value={composerPhone}
                  onChange={(e) => setComposerPhone(e.target.value)}
                  placeholder="Ej. 11 4567-8900"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">
                  Mensaje personalizado (editable antes de enviar)
                </label>
                <textarea
                  rows={6}
                  value={composerMessage}
                  onChange={(e) => setComposerMessage(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setComposerCustomer(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <a
                  href={createWhatsAppUrl(composerPhone, composerMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!composerPhone.trim()) {
                      e.preventDefault();
                      showToast?.('Ingresá un número de WhatsApp válido antes de enviar.');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Abrir WhatsApp y Enviar</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
