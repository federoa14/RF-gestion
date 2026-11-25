import { planMorning, planClosing, normalizeWhatsAppPhone, argentinaNow, isDue, businessCanDispatch, cleanVar } from '../../supabase/functions/_shared/dispatchLogic.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Lógica de los envíos de WhatsApp del servidor (hoja de ruta, alertas y cierre)
test('envíos de WhatsApp: teléfonos, matutino, cierre, horarios y plan', () => {
const today = '2026-11-25';
const d = (n: number) => new Date(Date.parse(today + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);
const snap = {
  businessId: 'biz1', businessName: 'Distribuidora Uno',
  config: { currencySymbol: '$', businessRubro: 'distribuidora' },
  boletas: [
    { id: 'b1', status: 'pending', salespersonId: 's1', clientName: 'Almacén A', saleDate: d(16), dueDate: d(9), amount: 10000, partialPayments: [{ date: today, amount: 2000, paymentMethod: 'efectivo' }] },
    { id: 'b2', status: 'pending', salespersonId: 's1', clientName: 'Kiosco B', saleDate: d(3), dueDate: d(-4), amount: 5000 },
    { id: 'b3', status: 'pending', salespersonId: 's2', clientName: 'Super C', saleDate: d(11), dueDate: d(4), amount: 7000, clientId: 'c3', boletaNumber: 'B-3' },
    { id: 'b4', status: 'pending', salespersonId: 's2', clientName: 'Nuevo D', saleDate: d(1), dueDate: d(-6), amount: 900 },
  ],
  paidBoletas: [{ id: 'p1', status: 'paid', paidAt: today, amount: 3000, paymentMethod: 'transferencia' }],
  salespeople: [{ id: 's1', name: 'Juan', phone: '11 15 2345-6789', active: true }, { id: 's2', name: 'Ana', phone: '123', active: true }],
  administrators: [{ name: 'Dueño', phone: '+54 9 11 4444-5555', receiveAdminAlerts: true }],
  clients: [{ id: 'c3', phone: '0351 155123456' }],
};
// Teléfonos
assert.equal(normalizeWhatsAppPhone('11 15 2345-6789'), '5491123456789');
assert.equal(normalizeWhatsAppPhone('+54 9 11 4444-5555'), '5491144445555');
assert.equal(normalizeWhatsAppPhone('011 2345-6789'), '5491123456789');
assert.equal(normalizeWhatsAppPhone('0351 155123456'), '5493515123456');
assert.equal(normalizeWhatsAppPhone('123'), null);
assert.equal(normalizeWhatsAppPhone('0'), null);
// Matutino
const m = planMorning(snap as any, today);
const route = m.messages.filter((x) => x.kind === 'vendor_route');
assert.equal(route.length, 1, 'solo Juan tiene teléfono válido');
assert.equal(route[0].variables[2], '2'); // b1 vencida + b2 recordatorio (3d >= 2)
assert.deepEqual(m.invalidPhones, ['Ana (123)']);
const owner = m.messages.filter((x) => x.kind === 'owner_alerts');
assert.equal(owner.length, 1);
assert.ok(owner[0].variables[3].includes('1 en modo alerta (10+ días)'));
assert.ok(owner[0].variables[3].includes('1 en alerta crítica (15+ días)'));
assert.equal(m.messages.filter((x) => x.kind === 'client_overdue').length, 0, 'clientes desactivado por defecto');
// Clientes activado
const m2 = planMorning({ ...snap, config: { ...snap.config, enableClientWhatsAppReminders: true, includeClientsInAutoDispatch: true } } as any, today);
assert.equal(m2.messages.filter((x) => x.kind === 'client_overdue').length, 1);
// Dedupe estable
assert.equal(planMorning(snap as any, today).messages[0].dedupeKey, m.messages[0].dedupeKey);
// Umbrales configurables
const m3 = planMorning({ ...snap, config: { ...snap.config, saleAlertModeDays: 12, saleCriticalDays: 20 } } as any, today);
// Cierre
const c = planClosing(snap as any, today);
assert.equal(c.totals.efectivo, 2000);
assert.equal(c.totals.transferencia, 3000);
assert.equal(c.totals.unpaidCount, 4);
// Sin saltos de línea en variables
assert.equal(cleanVar('a\nb\tc'), 'a b c');
// Horarios y plan
assert.equal(isDue('08:00', '08:00', '07:59'), false);
assert.equal(isDue('08:00', '08:00', '08:00'), true);
assert.equal(isDue(undefined, '19:00', '19:15'), true);
assert.equal(isDue('08:00', '08:00', '19:30', '19:00'), false);
assert.equal(businessCanDispatch({ subscription: { isPaused: true } }, today).ok, false);
assert.equal(businessCanDispatch({ subscription: { planTier: 'web' } }, today).ok, false);
assert.equal(businessCanDispatch({ subscription: { planTier: 'web', trialEndsAt: '2026-12-01' } }, today).ok, true);
assert.equal(businessCanDispatch({ subscription: { planTier: 'full' } }, today).ok, true);
// Hora AR: 11:00 UTC = 08:00 AR
assert.deepEqual(argentinaNow(new Date('2026-11-25T11:00:00Z')), { dateStr: '2026-11-25', timeStr: '08:00' });
assert.deepEqual(argentinaNow(new Date('2026-11-26T02:30:00Z')), { dateStr: '2026-11-25', timeStr: '23:30' });
});
