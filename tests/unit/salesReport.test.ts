import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDailyReport, getOrderPaymentSplit, localDayKey } from '../../src/utils/salesReport';
import type { CatalogPickupOrder } from '../../src/types';

const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).toISOString();
const order = (o: Partial<CatalogPickupOrder>): CatalogPickupOrder =>
  ({ id: 'x', orderNumber: 'PED-1', tenantId: 't', storeName: 's', customerName: 'c', customerPhone: '', items: [], totalAmount: 1000, currencySymbol: '$', status: 'pendiente_retiro', createdAt: at('2026-11-26'), ...o }) as CatalogPickupOrder;

test('un pago mixto reparte el efectivo, la transferencia y lo que queda a cuenta', () => {
  const sp = getOrderPaymentSplit(order({ paymentBreakdown: { efectivo: 300, transferencia: 500, mercadopago: 0, aCuenta: 200 } }));
  assert.deepEqual([sp.efectivo, sp.transferencia, sp.aCuenta, sp.porCobrar], [300, 500, 200, 0]);
});

test('pedidos online: pagados van al medio; sin pagar quedan por cobrar; fiado va a cuenta', () => {
  assert.equal(getOrderPaymentSplit(order({ paymentStatus: 'acreditado', confirmedPaymentMethod: 'transferencia' })).transferencia, 1000);
  assert.equal(getOrderPaymentSplit(order({ paymentStatus: 'pendiente', preferredPaymentMethod: 'efectivo' })).porCobrar, 1000);
  assert.equal(getOrderPaymentSplit(order({ confirmedPaymentMethod: 'fiado' })).aCuenta, 1000);
  assert.equal(getOrderPaymentSplit(order({ status: 'retirado', confirmedPaymentMethod: 'efectivo' })).efectivo, 1000);
});

test('reporte del día: totales por medio, cancelados afuera y devoluciones restan', () => {
  const orders = [
    order({ id: 'a', orderNumber: 'MOS-1', saleChannel: 'mostrador', totalAmount: 1000, paymentBreakdown: { efectivo: 600, transferencia: 400, mercadopago: 0, aCuenta: 0 } }),
    order({ id: 'b', orderNumber: 'MOS-2', saleChannel: 'mostrador', totalAmount: 500, paymentBreakdown: { efectivo: 0, transferencia: 0, mercadopago: 0, aCuenta: 500 } }),
    order({ id: 'c', totalAmount: 2000, paymentStatus: 'acreditado', confirmedPaymentMethod: 'mercadopago_dinero_cuenta' }),
    order({ id: 'd', totalAmount: 900, status: 'cancelado' }),
    order({ id: 'e', totalAmount: 700, createdAt: at('2026-11-25') }),
    order({ id: 'f', totalAmount: 800, createdAt: at('2026-11-20'), returnRecords: [{ id: 'r', date: at('2026-11-26'), returnedAmount: 300, refundMethod: 'efectivo' } as never] }),
  ];
  const r = buildDailyReport(orders, '2026-11-26');
  assert.equal(r.salesCount, 3);
  assert.equal(r.totalSold, 3500);
  assert.equal(r.efectivo, 600);
  assert.equal(r.transferencia, 400);
  assert.equal(r.mercadopago, 2000);
  assert.equal(r.aCuenta, 500);
  assert.equal(r.counterCount, 2);
  assert.equal(r.refunds, 300);
  assert.equal(r.netCollected, 600 + 400 + 2000 - 300);
});

test('localDayKey usa la fecha local', () => {
  assert.equal(localDayKey(new Date(2026, 10, 26, 23, 30)), '2026-11-26');
  assert.equal(localDayKey('no es fecha'), '');
});
