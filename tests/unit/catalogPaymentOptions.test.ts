import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveEnabledPaymentOptions } from '../../src/utils/catalogPaymentOptions.ts';
import { countOrdersToPrepare } from '../../src/utils/newOrderAlerts.ts';

test('medios de pago: sin configurar se ofrecen todos (Mercado Pago solo si está conectado)', () => {
  assert.deepEqual(resolveEnabledPaymentOptions(undefined, { mercadoPagoAvailable: false }), ['transferencia', 'efectivo', 'acordar']);
  assert.deepEqual(resolveEnabledPaymentOptions(undefined, { mercadoPagoAvailable: true }), ['transferencia', 'mercadopago', 'efectivo', 'acordar']);
});

test('medios de pago: respeta lo que elige el comercio', () => {
  assert.deepEqual(resolveEnabledPaymentOptions({ efectivo: true }, { mercadoPagoAvailable: true }), ['efectivo']);
  assert.deepEqual(resolveEnabledPaymentOptions({ mercadopago: true }, { mercadoPagoAvailable: false }), []);
});

test('pedidos por preparar: cuenta solo los pendientes de armado', () => {
  assert.equal(countOrdersToPrepare([{ status: 'pendiente_retiro' }, { status: 'retirado' }, { status: 'pendiente_retiro' }]), 2);
});
