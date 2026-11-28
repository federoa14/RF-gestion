import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTenantEffectiveFeatureAccess,
  getTenantSubscriptionStatus,
  PLAN_WEB_MAX_PRODUCTS,
  PLAN_WEB_MAX_RUBROS,
} from '../../src/utils/tenantSubscription.ts';

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().split('T')[0];

function trialTenant(trialEndsOffset: number, planTier?: 'basico' | 'web' | 'full'): any {
  return {
    id: 't1',
    name: 'Prueba',
    status: 'trial',
    createdAt: day(-5),
    catalogEnabled: true,
    subscription: {
      monthlyFee: 28000,
      currency: '$',
      paymentWindowStartDay: 1,
      paymentWindowEndDay: 5,
      isPaused: false,
      trialDays: 30,
      trialStartedAt: day(-5),
      trialEndsAt: day(trialEndsOffset),
      selfRegistered: true,
      paymentHistory: [],
      ...(planTier ? { planTier } : {}),
    },
  };
}

test('la prueba gratis vigente se comporta como Plan 2 (con límites), no como Full', () => {
  const t = trialTenant(25, 'web');
  assert.equal(getTenantSubscriptionStatus(t).status, 'trial_active');
  const access = getTenantEffectiveFeatureAccess(t);
  assert.equal(access.tier, 'web');
  assert.equal(access.canAccessFullFeatures, false);
  assert.equal(access.canAccessWebCatalog, true);
});

test('una prueba sin plan asignado también cuenta como Plan 2', () => {
  const access = getTenantEffectiveFeatureAccess(trialTenant(25));
  assert.equal(access.tier, 'web');
  assert.equal(access.canAccessFullFeatures, false);
});

test('los límites del Plan 2 se mantienen: 5 rubros y 100 artículos', () => {
  assert.equal(PLAN_WEB_MAX_RUBROS, 5);
  assert.equal(PLAN_WEB_MAX_PRODUCTS, 100);
});

test('al vencer la prueba se pide elegir plan (queda en trial_expired)', () => {
  assert.equal(getTenantSubscriptionStatus(trialTenant(-1, 'web')).status, 'trial_expired');
});
