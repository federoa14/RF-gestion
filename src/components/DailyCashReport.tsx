import React, { useMemo, useState } from 'react';
import { Banknote, CalendarDays, Landmark, Receipt, Smartphone, Undo2, Wallet } from 'lucide-react';
import type { CatalogPickupOrder } from '../types';
import { buildDailyReport, getOrderPaymentSplit, isCounterSale, localDayKey } from '../utils/salesReport';

interface DailyCashReportProps {
  orders: CatalogPickupOrder[];
  currencySymbol: string;
  /** Cobra el saldo que quedó a cuenta en un pedido (efectivo o transferencia). */
  onCollectBalance: (order: CatalogPickupOrder, method: 'efectivo' | 'transferencia') => void;
}

const shiftDay = (day: string, delta: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return localDayKey(new Date(y, m - 1, d + delta));
};

/** Caja del día: elegís una fecha y ves cuánto se vendió, cuánto entró por cada medio, lo que quedó a cuenta y lo devuelto. */
export const DailyCashReport: React.FC<DailyCashReportProps> = ({ orders, currencySymbol, onCollectBalance }) => {
  const today = localDayKey(new Date());
  const [day, setDay] = useState(today);
  const report = useMemo(() => buildDailyReport(orders, day), [orders, day]);
  const fmt = (n: number) => `${currencySymbol} ${Math.round(n).toLocaleString('es-AR')}`;
  const cards: Array<{ label: string; value: number; icon: React.ReactNode; tone?: string }> = [
    { label: 'Vendido', value: report.totalSold, icon: <Receipt className="w-4 h-4" /> },
    { label: 'Efectivo', value: report.efectivo, icon: <Banknote className="w-4 h-4" />, tone: 'text-emerald-700' },
    { label: 'Transferencia', value: report.transferencia, icon: <Landmark className="w-4 h-4" />, tone: 'text-sky-700' },
    { label: 'Mercado Pago', value: report.mercadopago, icon: <Smartphone className="w-4 h-4" />, tone: 'text-indigo-700' },
    { label: 'A cuenta (por cobrar)', value: report.aCuenta, icon: <Wallet className="w-4 h-4" />, tone: 'text-amber-700' },
    { label: 'Devoluciones (restan)', value: report.refunds, icon: <Undo2 className="w-4 h-4" />, tone: 'text-rose-700' },
  ];
  const label = new Date(`${day}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4" aria-label="Caja del día">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[#0B1933]" />
            Caja del día
          </h3>
          <p className="text-[11px] text-slate-500 capitalize">{label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setDay(shiftDay(day, -1))} className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold cursor-pointer" aria-label="Día anterior">
            ‹
          </button>
          <input
            type="date"
            value={day}
            max={today}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            aria-label="Elegir el día"
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
          />
          <button type="button" onClick={() => setDay(shiftDay(day, 1))} disabled={day >= today} className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold cursor-pointer" aria-label="Día siguiente">
            ›
          </button>
          <button type="button" onClick={() => setDay(today)} className="px-3 py-1.5 rounded-lg bg-[#0B1933] text-white text-xs font-bold cursor-pointer">
            Hoy
          </button>
          <button type="button" onClick={() => setDay(shiftDay(today, -1))} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold cursor-pointer">
            Ayer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className={`text-[11px] font-semibold flex items-center gap-1.5 ${c.tone || 'text-slate-500'}`}>
              {c.icon}
              {c.label}
            </div>
            <div className="text-xl font-extrabold text-slate-900 tabular-nums">{fmt(c.value)}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-emerald-800">Neto cobrado del día (efectivo + transferencia + Mercado Pago − devoluciones)</div>
          <div className="text-2xl font-extrabold text-emerald-900 tabular-nums">{fmt(report.netCollected)}</div>
        </div>
        <div className="text-[11px] text-emerald-900/80 text-right">
          {report.salesCount} venta{report.salesCount === 1 ? '' : 's'} · {report.counterCount} de mostrador · {report.onlineCount} online
          {report.porCobrar > 0 && <div className="font-semibold text-amber-800">Pedidos online sin pagar: {fmt(report.porCobrar)}</div>}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {report.sales.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-500">No hay ventas registradas en este día.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {report.sales.map((o) => {
              const sp = getOrderPaymentSplit(o);
              const chips: Array<[string, number]> = [
                ['Efectivo', sp.efectivo],
                ['Transf.', sp.transferencia],
                ['MP', sp.mercadopago],
                ['A cuenta', sp.aCuenta],
                ['Por cobrar', sp.porCobrar],
              ];
              return (
                <li key={o.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 flex flex-wrap items-center gap-2">
                      <span className="font-mono">#{o.orderNumber}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-600">
                        {isCounterSale(o) ? 'Mostrador' : 'Online'}
                      </span>
                      <span className="text-slate-600 font-normal truncate">{o.customerName}</span>
                      <span className="text-[11px] text-slate-400 font-normal">
                        {new Date(o.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {chips
                        .filter(([, v]) => v > 0)
                        .map(([name, v]) => (
                          <span key={name} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${name === 'A cuenta' || name === 'Por cobrar' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                            {name} {fmt(v)}
                          </span>
                        ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold tabular-nums text-slate-900">{fmt(Number(o.totalAmount) || 0)}</span>
                    {sp.aCuenta > 0 && (
                      <>
                        <button type="button" onClick={() => onCollectBalance(o, 'efectivo')} className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap">
                          Cobró en efectivo
                        </button>
                        <button type="button" onClick={() => onCollectBalance(o, 'transferencia')} className="px-2 py-1 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap">
                          Cobró por transf.
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-slate-500">
        La caja muestra lo que entró, no la ganancia: para calcular ganancia hace falta cargar el costo de cada producto.
      </p>
    </div>
  );
};
