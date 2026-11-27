import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildClubMessage, giftPoints, MAX_GIFT_POINTS } from '../../src/utils/loyaltyClub';
import type { CatalogLoyaltyAccount } from '../../src/types';

const acc: CatalogLoyaltyAccount = {
  id: 'a', tenantId: 't', dni: '30123456', customerName: 'Lucía Gómez', customerPhone: '1155550001',
  pointsBalance: 120, totalPointsEarned: 200, totalPointsRedeemed: 80, ordersCount: 4, createdAt: '2026-01-01', updatedAt: '2026-01-01',
};

test('regalar puntos solo suma y deja el regalo en el historial', () => {
  const g = giftPoints(acc, 50, '2026-11-27T10:00:00.000Z');
  assert.equal(g.pointsBalance, 170);
  assert.equal(g.totalPointsEarned, 250);
  assert.equal(g.totalPointsRedeemed, 80, 'lo canjeado no se toca');
  assert.equal(g.history?.[0].pointsDelta, 50);
  assert.match(g.history?.[0].note || '', /Regalo del comercio/);
});

test('no se pueden restar puntos ni regalar montos inválidos', () => {
  assert.equal(giftPoints(acc, -10), acc);
  assert.equal(giftPoints(acc, 0), acc);
  assert.equal(giftPoints(acc, MAX_GIFT_POINTS + 1), acc);
  assert.equal(giftPoints(acc, Number.NaN), acc);
});

test('mensaje del club con puntos y cupón', () => {
  const m = buildClubMessage({ customerName: 'Lucía Gómez', storeName: 'Mi Tienda', points: 120, couponCode: 'AMIGOS10', couponLabel: '10% OFF', url: 'https://x.test' });
  assert.match(m, /Hola Lucía!/);
  assert.match(m, /120 puntos/);
  assert.match(m, /AMIGOS10/);
  assert.doesNotMatch(buildClubMessage({ storeName: 'T', points: 5 }), /cupón/);
});
