import type { CatalogPickupOrder } from '../types';

/** Minutos que un pedido sin pagar online retiene el stock antes de liberarlo (0 = no liberar). */
export const DEFAULT_STOCK_HOLD_MINUTES = 25;
export const STOCK_HOLD_OPTIONS = [0, 15, 25, 30, 60] as const;

/**
 * Un pedido de la tienda que quedó esperando un pago online (Mercado Pago o transferencia sin comprobante)
 * y todavía no se empezó a preparar. Los que se pagan en el local o al recibir (efectivo, a coordinar)
 * son reservas válidas y nunca se liberan solos.
 */
export function isWaitingOnlinePayment(order: CatalogPickupOrder): boolean {
  if (order.saleChannel === 'mostrador' || String(order.orderNumber || '').startsWith('MOS-')) return false;
  if (order.status !== 'pendiente_retiro') return false;
  if (order.paymentStatus && order.paymentStatus !== 'pendiente') return false;
  const method = order.confirmedPaymentMethod || order.preferredPaymentMethod;
  if (method === 'link_pago' || method === 'mercadopago_dinero_cuenta') return true;
  if (method === 'transferencia') return !order.transferReceiptImageUrl;
  return false;
}

export function isStockHoldExpired(order: CatalogPickupOrder, minutes: number, nowMs: number = Date.now()): boolean {
  if (!minutes || minutes <= 0) return false;
  if (!order.stockDeducted) return false; // no tiene stock retenido
  if (!isWaitingOnlinePayment(order)) return false;
  const created = Date.parse(order.createdAt || '');
  return Number.isFinite(created) && nowMs - created >= minutes * 60_000;
}
