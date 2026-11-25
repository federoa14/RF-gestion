import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toggleTenantMonthlyPayment } from '../../src/utils/tenantSubscription';
import type { Tenant } from '../../src/types';

const tenant = {
  id: 't1',
  tenantCode: 'T1',
  name: 'Comercio',
  status: 'active',
  createdAt: '2026-01-01',
  subscription: { monthlyFee: 28000, currency: '$', paymentWindowStartDay: 1, paymentWindowEndDay: 5, isPaused: false, paymentHistory: [] },
} as unknown as Tenant;

test('regalar un año: cubre 12 meses y registra monto $ 0', () => {
  const t = toggleTenantMonthlyPayment(tenant, '2026-11', true, 0, 'Año de cortesía', 'Admin', {
    paymentMethod: 'manual',
    planType: 'annual',
    monthsCount: 12,
  });
  assert.equal(t.subscription?.annualPlanUntilMonth, '2027-10');
  const history = t.subscription?.paymentHistory || [];
  assert.equal(history.length, 12);
  assert.equal(history.reduce((a, p) => a + p.amountPaid, 0), 0);
});

test('año pagado sin monto usa 12 veces la cuota', () => {
  const t = toggleTenantMonthlyPayment(tenant, '2026-11', true, undefined, undefined, 'Admin', {
    planType: 'annual',
    monthsCount: 12,
  });
  assert.equal((t.subscription?.paymentHistory || [])[0].amountPaid, 28000 * 12);
});
