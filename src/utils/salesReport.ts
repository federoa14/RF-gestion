import type { CatalogPaymentBreakdown, CatalogPickupOrder } from '../types';

export interface OrderPaymentSplit extends CatalogPaymentBreakdown {
  /** Pedidos online todavía sin pagar (se coordinan por WhatsApp). */
  porCobrar: number;
}

const num = (v: unknown) => Math.max(0, Number(v) || 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Fecha local del pedido como AAAA-MM-DD. */
export function localDayKey(iso: string | Date | undefined): string {
  const d = iso instanceof Date ? iso : new Date(iso || '');
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Cuánto entró por cada medio (y cuánto quedó a cuenta o por cobrar) en un pedido. */
export function getOrderPaymentSplit(order: CatalogPickupOrder): OrderPaymentSplit {
  const total = num(order.totalAmount);
  const empty: OrderPaymentSplit = { efectivo: 0, transferencia: 0, mercadopago: 0, aCuenta: 0, porCobrar: 0 };
  if (order.paymentBreakdown) {
    const b = order.paymentBreakdown;
    return { ...empty, efectivo: num(b.efectivo), transferencia: num(b.transferencia), mercadopago: num(b.mercadopago), aCuenta: num(b.aCuenta) };
  }
  const method = order.confirmedPaymentMethod || order.preferredPaymentMethod;
  if (method === 'fiado') return { ...empty, aCuenta: total };
  const paid = order.paymentStatus === 'acreditado' || order.status === 'retirado';
  if (!paid) return { ...empty, porCobrar: total };
  if (method === 'transferencia') return { ...empty, transferencia: total };
  if (method === 'mercadopago_dinero_cuenta' || method === 'link_pago') return { ...empty, mercadopago: total };
  return { ...empty, efectivo: total };
}

export interface DailyReport {
  day: string;
  salesCount: number;
  counterCount: number;
  onlineCount: number;
  totalSold: number;
  efectivo: number;
  transferencia: number;
  mercadopago: number;
  aCuenta: number;
  porCobrar: number;
  /** Devoluciones y reintegros hechos ese día (restan). */
  refunds: number;
  refundsByMethod: { efectivo: number; transferencia: number; mercadopago: number };
  /** Lo cobrado del día menos lo devuelto. */
  netCollected: number;
  sales: CatalogPickupOrder[];
}

export function isCounterSale(o: CatalogPickupOrder): boolean {
  return o.saleChannel === 'mostrador' || String(o.orderNumber || '').startsWith('MOS-');
}

export function buildDailyReport(orders: CatalogPickupOrder[], day: string): DailyReport {
  const sales = orders
    .filter((o) => localDayKey(o.createdAt) === day && o.status !== 'cancelado')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const r: DailyReport = {
    day, salesCount: sales.length, counterCount: 0, onlineCount: 0, totalSold: 0,
    efectivo: 0, transferencia: 0, mercadopago: 0, aCuenta: 0, porCobrar: 0,
    refunds: 0, refundsByMethod: { efectivo: 0, transferencia: 0, mercadopago: 0 }, netCollected: 0, sales,
  };
  for (const o of sales) {
    if (isCounterSale(o)) r.counterCount++;
    else r.onlineCount++;
    r.totalSold += num(o.totalAmount);
    const sp = getOrderPaymentSplit(o);
    r.efectivo += sp.efectivo;
    r.transferencia += sp.transferencia;
    r.mercadopago += sp.mercadopago;
    r.aCuenta += sp.aCuenta;
    r.porCobrar += sp.porCobrar;
  }
  // Devoluciones hechas ese día (aunque la venta sea de otro día)
  for (const o of orders) {
    for (const rec of o.returnRecords || []) {
      if (localDayKey(rec.date) !== day) continue;
      const amount = num(rec.returnedAmount);
      r.refunds += amount;
      const m = rec.refundMethod;
      if (m === 'transferencia') r.refundsByMethod.transferencia += amount;
      else if (m === 'mercadopago') r.refundsByMethod.mercadopago += amount;
      else r.refundsByMethod.efectivo += amount;
    }
  }
  r.netCollected = r.efectivo + r.transferencia + r.mercadopago - r.refunds;
  for (const k of ['totalSold', 'efectivo', 'transferencia', 'mercadopago', 'aCuenta', 'porCobrar', 'refunds', 'netCollected'] as const) r[k] = round2(r[k]);
  return r;
}
