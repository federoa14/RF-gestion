import React, { useMemo, useState } from 'react';
import { Award, Gift, MessageCircle, RefreshCw, Search, Users, X } from 'lucide-react';
import type { CatalogLoyaltyAccount, CatalogCoupon, CatalogLoyaltyTier } from '../types';
import { getEligibleLoyaltyTiers } from '../utils/catalogStock';
import { GIFT_POINT_OPTIONS, buildClubMessage } from '../utils/loyaltyClub';
import { createWhatsAppUrl } from '../utils/whatsapp';

interface LoyaltyClubPanelProps {
  accounts: CatalogLoyaltyAccount[];
  tiers?: CatalogLoyaltyTier[];
  coupons: CatalogCoupon[];
  storeName: string;
  publicUrl: string;
  onGiftPoints?: (account: CatalogLoyaltyAccount, points: number) => void;
  onRefresh?: () => Promise<void> | void;
  showToast: (message: string) => void;
}

type SortKey = 'points' | 'recent' | 'name';

/**
 * Club de puntos: lista de clientes con su total de puntos, solo para mirar. El comercio no puede
 * restar ni editar puntos; puede escribirle por WhatsApp (con un cupón de regalo) o regalarle puntos.
 */
export const LoyaltyClubPanel: React.FC<LoyaltyClubPanelProps> = ({
  accounts,
  tiers,
  coupons,
  storeName,
  publicUrl,
  onGiftPoints,
  onRefresh,
  showToast,
}) => {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('points');
  const [refreshing, setRefreshing] = useState(false);
  const [composer, setComposer] = useState<CatalogLoyaltyAccount | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [message, setMessage] = useState('');
  const activeCoupons = useMemo(() => coupons.filter((c) => c.active !== false), [coupons]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = accounts.filter((a) =>
      !q ||
      a.dni.includes(q.replace(/\D/g, '') || '§') ||
      (a.customerName || '').toLowerCase().includes(q) ||
      (a.customerPhone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')
    );
    return [...list].sort((a, b) =>
      sort === 'points'
        ? b.pointsBalance - a.pointsBalance
        : sort === 'recent'
        ? (b.lastOrderAt || b.updatedAt || '').localeCompare(a.lastOrderAt || a.updatedAt || '')
        : (a.customerName || a.dni).localeCompare(b.customerName || b.dni)
    );
  }, [accounts, query, sort]);

  const totalPoints = accounts.reduce((s, a) => s + a.pointsBalance, 0);
  const withDiscount = accounts.filter((a) => getEligibleLoyaltyTiers(a.pointsBalance, tiers).highestUnlocked).length;
  const couponLabel = (code: string) => {
    const c = activeCoupons.find((x) => x.code === code);
    return c ? (c.discountType === 'percent' ? `${c.value}% OFF` : `$ ${c.value} OFF`) : undefined;
  };

  const openComposer = (acc: CatalogLoyaltyAccount) => {
    const code = activeCoupons[0]?.code || '';
    setCouponCode(code);
    setMessage(
      buildClubMessage({ customerName: acc.customerName, storeName, points: acc.pointsBalance, couponCode: code || undefined, couponLabel: code ? couponLabel(code) : undefined, url: publicUrl })
    );
    setComposer(acc);
  };

  const changeCoupon = (code: string) => {
    if (!composer) return;
    setCouponCode(code);
    setMessage(
      buildClubMessage({ customerName: composer.customerName, storeName, points: composer.pointsBalance, couponCode: code || undefined, couponLabel: code ? couponLabel(code) : undefined, url: publicUrl })
    );
  };

  const digits = (composer?.customerPhone || '').replace(/\D/g, '');

  return (
    <div className="space-y-4" aria-label="Club de puntos">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-700" />
              Club de puntos
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
              Tus clientes con los puntos que juntaron. Los puntos los suma el sistema con cada compra: no se pueden editar ni restar desde acá. Podés escribirles por WhatsApp con un cupón de regalo o regalarles puntos.
            </p>
          </div>
          {onRefresh && (
            <button
              type="button"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await onRefresh();
                } finally {
                  setRefreshing(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Socios', String(accounts.length), <Users key="u" className="w-3.5 h-3.5" />],
            ['Puntos en circulación', totalPoints.toLocaleString('es-AR'), <Award key="a" className="w-3.5 h-3.5" />],
            ['Con descuento listo', String(withDiscount), <Gift key="g" className="w-3.5 h-3.5" />],
          ].map(([label, value, icon]) => (
            <div key={label as string} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                {icon}
                {label}
              </div>
              <div className="text-lg font-extrabold text-slate-900 tabular-nums">{value}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, DNI o teléfono…"
              aria-label="Buscar socios del club"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Ordenar socios"
            className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
          >
            <option value="points">Más puntos primero</option>
            <option value="recent">Compra más reciente</option>
            <option value="name">Nombre A–Z</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-500">
            {accounts.length === 0
              ? 'Todavía no hay socios. Aparecen cuando un cliente se suma al club con su DNI o compra con su DNI.'
              : 'Ningún socio coincide con esa búsqueda.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((acc) => {
              const { highestUnlocked, nextTier } = getEligibleLoyaltyTiers(acc.pointsBalance, tiers);
              return (
                <li key={acc.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{acc.customerName || 'Cliente sin nombre'}</div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2.5">
                      <span className="font-mono">DNI {acc.dni}</span>
                      {acc.customerPhone && <span className="font-mono">{acc.customerPhone}</span>}
                      <span>{acc.ordersCount} compra{acc.ordersCount === 1 ? '' : 's'}</span>
                    </div>
                    <div className="text-[11px] mt-0.5">
                      {highestUnlocked ? (
                        <span className="font-bold text-emerald-700">Descuento listo: {highestUnlocked.discountPercent}% OFF</span>
                      ) : nextTier ? (
                        <span className="text-slate-500">Le faltan {nextTier.minPoints - acc.pointsBalance} pts para el {nextTier.discountPercent}% OFF</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className="text-lg font-extrabold text-[#0B1933] tabular-nums leading-none">{acc.pointsBalance}</div>
                      <div className="text-[10px] text-slate-500">puntos</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openComposer(acc)}
                      disabled={!acc.customerPhone}
                      title={acc.customerPhone ? 'Escribirle por WhatsApp (con cupón de regalo)' : 'Este cliente no dejó teléfono'}
                      aria-label={`Escribirle por WhatsApp a ${acc.customerName || acc.dni}`}
                      className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    {onGiftPoints && (
                      <div className="inline-flex items-center gap-1" role="group" aria-label="Regalar puntos">
                        <Gift className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        {GIFT_POINT_OPTIONS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              if (window.confirm(`¿Regalarle ${p} puntos a ${acc.customerName || `el DNI ${acc.dni}`}? Quedan anotados como regalo del comercio.`)) {
                                onGiftPoints(acc, p);
                              }
                            }}
                            title={`Regalar ${p} puntos`}
                            className="px-1.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-mono font-bold text-[11px] cursor-pointer"
                          >
                            +{p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {composer && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Escribirle al socio por WhatsApp">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 space-y-3 max-h-[94vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">Escribirle a {composer.customerName || `DNI ${composer.dni}`}</h4>
              <button type="button" onClick={() => setComposer(null)} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {activeCoupons.length > 0 ? (
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-700">Cupón de regalo</span>
                <select value={couponCode} onChange={(e) => changeCoupon(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900">
                  <option value="">Sin cupón</option>
                  {activeCoupons.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} ({c.discountType === 'percent' ? `${c.value}% OFF` : `$ ${c.value} OFF`})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-[11px] text-slate-500">Todavía no tenés cupones activos. Podés crearlos en Configuración y mandarlos desde acá.</p>
            )}
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">Mensaje</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900" />
            </label>
            <a
              href={digits.length >= 8 ? createWhatsAppUrl(composer.customerPhone || '', message) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (digits.length < 8) {
                  e.preventDefault();
                  showToast('Este cliente no tiene un teléfono válido.');
                  return;
                }
                showToast('Se abrió WhatsApp con el mensaje listo para enviar.');
                setComposer(null);
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              Abrir WhatsApp y enviar
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
