import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isStockHoldExpired } from '../../src/utils/stockHold';
import type { CatalogPickupOrder } from '../../src/types';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const minAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const order = (o: Partial<CatalogPickupOrder> = {}): CatalogPickupOrder =>
  ({ id: 'o', orderNumber: 'PED-1', tenantId: 't', storeName: 's', customerName: 'c', customerPhone: '1', items: [], totalAmount: 1, currencySymbol: '$', status: 'pendiente_retiro', paymentStatus: 'pendiente', preferredPaymentMethod: 'link_pago', stockDeducted: true, createdAt: minAgo(30), ...o }) as CatalogPickupOrder;

test('un pedido con pago online pendiente libera el stock pasados los minutos', () => {
  assert.equal(isStockHoldExpired(order(), 25, NOW), true);
  assert.equal(isStockHoldExpired(order({ createdAt: minAgo(10) }), 25, NOW), false);
  assert.equal(isStockHoldExpired(order({ preferredPaymentMethod: 'transferencia' }), 25, NOW), true);
});

test('no libera lo que es una reserva válida o ya avanzó', () => {
  assert.equal(isStockHoldExpired(order({ preferredPaymentMethod: 'efectivo' }), 25, NOW), false, 'efectivo se paga al retirar');
  assert.equal(isStockHoldExpired(order({ preferredPaymentMethod: 'acordar' }), 25, NOW), false);
  assert.equal(isStockHoldExpired(order({ preferredPaymentMethod: 'transferencia', transferReceiptImageUrl: 'data:x' }), 25, NOW), false, 'mandó comprobante');
  assert.equal(isStockHoldExpired(order({ paymentStatus: 'comprobante_en_revision' }), 25, NOW), false);
  assert.equal(isStockHoldExpired(order({ paymentStatus: 'acreditado' }), 25, NOW), false);
  assert.equal(isStockHoldExpired(order({ status: 'listo_para_retirar' }), 25, NOW), false);
  assert.equal(isStockHoldExpired(order({ saleChannel: 'mostrador' }), 25, NOW), false);
  assert.equal(isStockHoldExpired(order({ stockDeducted: false }), 25, NOW), false);
});

test('con 0 minutos la función está apagada', () => {
  assert.equal(isStockHoldExpired(order(), 0, NOW), false);
});
