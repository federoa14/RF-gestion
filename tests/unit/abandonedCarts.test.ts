import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCartReminderInfo } from '../../src/utils/abandonedCarts';
import type { CatalogAbandonedCart } from '../../src/types';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const hAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const cart = (o: Partial<CatalogAbandonedCart> = {}): CatalogAbandonedCart => ({
  id: 'c1', tenantId: 't', customerName: 'Lucía', customerPhone: '1155', items: [], totalAmount: 100, currencySymbol: '$',
  status: 'abandoned', createdAt: hAgo(10), updatedAt: hAgo(10), ...o,
});

test('un carrito nuevo espera y después queda listo para recordar', () => {
  assert.equal(getCartReminderInfo(cart({ updatedAt: hAgo(2) }), 6, NOW).state, 'waiting');
  assert.equal(Math.round(getCartReminderInfo(cart({ updatedAt: hAgo(2) }), 6, NOW).waitHours), 4);
  assert.equal(getCartReminderInfo(cart({ updatedAt: hAgo(7) }), 6, NOW).state, 'ready');
});

test('sin teléfono no se puede recordar', () => {
  assert.equal(getCartReminderInfo(cart({ customerPhone: '' }), 6, NOW).state, 'nophone');
});

test('segundo aviso a las 24 h del primero y nunca más de dos', () => {
  const reminded = cart({ status: 'reminded', reminderCount: 1, reminderSentAt: hAgo(5) });
  assert.equal(getCartReminderInfo(reminded, 6, NOW).state, 'waiting');
  assert.equal(getCartReminderInfo({ ...reminded, reminderSentAt: hAgo(25) }, 6, NOW).state, 'second');
  assert.equal(getCartReminderInfo({ ...reminded, reminderCount: 2, reminderSentAt: hAgo(80) }, 6, NOW).state, 'done');
});

test('recuperados y descartados no se recuerdan', () => {
  assert.equal(getCartReminderInfo(cart({ status: 'recovered' }), 6, NOW).state, 'done');
  assert.equal(getCartReminderInfo(cart({ status: 'discarded' }), 6, NOW).state, 'done');
});
