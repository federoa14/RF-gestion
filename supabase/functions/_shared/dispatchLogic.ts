// Lógica pura del despacho de WhatsApp (sin dependencias de Deno ni de red),
// para poder probarla aparte. La usa la Edge Function whatsapp-dispatch.

export type DispatchKind = 'vendor_route' | 'owner_alerts' | 'daily_closing' | 'client_overdue';

export interface PlannedMessage {
  kind: DispatchKind;
  recipientRole: 'vendedor' | 'dueño' | 'cliente';
  recipientName: string;
  recipientPhone: string; // ya normalizado (549…)
  template: string;
  variables: string[];
  preview: string;
  dedupeKey: string;
}

export interface BusinessSnapshot {
  businessId: string;
  businessName: string;
  config: Record<string, any>;
  boletas: any[]; // pendientes (archived = false)
  paidBoletas: any[]; // pagadas (archived = true)
  salespeople: any[];
  administrators: any[];
  clients: any[];
}

export const TEMPLATE_NAMES = {
  vendor_route: 'hoja_ruta_vendedor',
  owner_alerts: 'alerta_cobranza_duenio',
  daily_closing: 'cierre_del_dia',
  client_overdue: 'boleta_vencida_cliente',
} as const;

// ---------------------------------------------------------------------------
// Fechas en hora de Argentina
// ---------------------------------------------------------------------------

export const AR_TZ = 'America/Argentina/Buenos_Aires';

export function argentinaNow(date = new Date()): { dateStr: string; timeStr: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { dateStr: `${get('year')}-${get('month')}-${get('day')}`, timeStr: `${hour}:${get('minute')}` };
}

function daysBetween(fromStr?: string, toStr?: string): number {
  if (!fromStr || !toStr) return 0;
  const a = Date.parse(`${fromStr.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${toStr.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

function formatDateEs(dateStr?: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------------------
// Teléfonos (Argentina): la Cloud API espera 549 + característica + número
// ---------------------------------------------------------------------------

export function normalizeWhatsAppPhone(raw?: string | null): string | null {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('549')) return d.length >= 12 && d.length <= 13 ? d : null;
  if (d.startsWith('54')) {
    const rest = d.slice(2);
    return rest.length === 10 ? `549${rest}` : null;
  }
  if (d.startsWith('0')) d = d.slice(1);
  // Característica + 15 + número (ej. 11 15 1234-5678): se quita el 15
  if (d.length === 12) {
    for (const areaLen of [2, 3, 4]) {
      if (d.slice(areaLen, areaLen + 2) === '15') {
        const candidate = d.slice(0, areaLen) + d.slice(areaLen + 2);
        if (candidate.length === 10) return `549${candidate}`;
      }
    }
  }
  if (d.length === 10) return `549${d}`;
  return null;
}

// ---------------------------------------------------------------------------
// Montos y umbrales (misma regla que src/utils/alertThresholds.ts)
// ---------------------------------------------------------------------------

export function formatMoney(amount: number, symbol = '$'): string {
  const n = Math.round(Number(amount) || 0);
  return `${symbol} ${n.toLocaleString('es-AR')}`;
}

export function balanceDue(b: any): number {
  const amount = Number(b?.amount || 0);
  const paid = (b?.partialPayments || []).reduce((a: number, p: any) => a + Number(p?.amount || 0), 0);
  const credit = (b?.creditNotes || []).reduce((a: number, c: any) => a + Number(c?.amount || 0), 0);
  const surcharge = Number(b?.lateSurchargeApplied || 0) - Number(b?.earlyPaymentDiscountApplied || 0);
  return Math.max(0, amount - credit + surcharge - paid);
}

const RUBRO_ESCALATION: Record<string, { alertModeDays: number; criticalSaleDays: number }> = {
  distribuidora: { alertModeDays: 10, criticalSaleDays: 15 },
  indumentaria: { alertModeDays: 20, criticalSaleDays: 30 },
  ecommerce_kiosco: { alertModeDays: 10, criticalSaleDays: 15 },
  comercio_fiado: { alertModeDays: 15, criticalSaleDays: 20 },
  cuenta_corriente: { alertModeDays: 25, criticalSaleDays: 35 },
};

function posInt(v: unknown, fallback: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function thresholdsFor(config: Record<string, any>) {
  const esc = RUBRO_ESCALATION[config?.businessRubro] || RUBRO_ESCALATION.distribuidora;
  const vendedorReminderDays = posInt(config?.vendedorReminderDays, 2);
  const adminAlertDays = Math.max(vendedorReminderDays, posInt(config?.adminAlertDays, 6));
  const alertModeDays = Math.max(adminAlertDays, posInt(config?.saleAlertModeDays, esc.alertModeDays));
  const criticalSaleDays = Math.max(alertModeDays, posInt(config?.saleCriticalDays, esc.criticalSaleDays));
  const overdueGraceDays = posInt(config?.overdueGraceDays, 5);
  return { vendedorReminderDays, adminAlertDays, alertModeDays, criticalSaleDays, overdueGraceDays };
}

// Meta no permite saltos de línea ni tabulaciones en las variables
export function cleanVar(text: string, max = 600): string {
  const one = String(text ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim();
  const v = one.length > max ? `${one.slice(0, max - 1)}…` : one;
  return v || '-';
}

function fillPreview(template: string, vars: string[]): string {
  return template.replace(/\{\{(\d+)\}\}/g, (_, i) => vars[Number(i) - 1] ?? '');
}

/** Textos de las plantillas tal cual se cargan en Meta (ver docs/WHATSAPP-META.md) */
export const TEMPLATE_BODIES: Record<DispatchKind, string> = {
  vendor_route:
    'Hola {{1}}, esta es tu hoja de ruta de cobranzas de hoy para {{2}}: {{3}} boleta(s) por un total de {{4}}. Detalle: {{5}}. Ingresá a la app para ver direcciones y registrar los cobros.',
  owner_alerts:
    'Hola {{1}}, resumen de cobranzas pendientes de {{2}} al {{3}}: {{4}}. Total en riesgo: {{5}}. Revisá el detalle en la app.',
  daily_closing:
    'Hola {{1}}, cierre del día {{2}} de {{3}}: cobrado en efectivo {{4}}, por transferencia {{5}}, total {{6}}. Quedan {{7}} boleta(s) impagas por {{8}}.',
  client_overdue:
    'Hola {{1}}, te escribimos de {{2}}. La boleta N.º {{3}} por {{4}} venció el {{5}}. Podés abonarla a nuestro vendedor o por transferencia. ¡Gracias!',
};

function message(
  base: BusinessSnapshot,
  dateStr: string,
  kind: DispatchKind,
  role: PlannedMessage['recipientRole'],
  name: string,
  phone: string,
  vars: string[],
  dedupeSuffix = ''
): PlannedMessage {
  const variables = vars.map((v) => cleanVar(v));
  return {
    kind,
    recipientRole: role,
    recipientName: name,
    recipientPhone: phone,
    template: TEMPLATE_NAMES[kind],
    variables,
    preview: fillPreview(TEMPLATE_BODIES[kind], variables),
    dedupeKey: `${base.businessId}|${dateStr}|${kind}|${phone}${dedupeSuffix}`,
  };
}

// ---------------------------------------------------------------------------
// Planificación de los mensajes
// ---------------------------------------------------------------------------

/** Destinatarios "dueño": administradores que reciben alertas y tienen teléfono */
function ownerRecipients(snap: BusinessSnapshot): Array<{ name: string; phone: string }> {
  const out = new Map<string, string>();
  for (const a of snap.administrators || []) {
    if (a?.receiveAdminAlerts === false) continue;
    const phone = normalizeWhatsAppPhone(a?.phone);
    if (phone && !out.has(phone)) out.set(phone, a?.name || 'Dueño');
  }
  return Array.from(out, ([phone, name]) => ({ name, phone }));
}

/** Envío matutino: hoja de ruta a cada vendedor + resumen de alertas a los dueños */
export function planMorning(snap: BusinessSnapshot, dateStr: string): { messages: PlannedMessage[]; invalidPhones: string[] } {
  const cfg = snap.config || {};
  const t = thresholdsFor(cfg);
  const symbol = cfg.currencySymbol || '$';
  const messages: PlannedMessage[] = [];
  const invalidPhones: string[] = [];
  const pending = (snap.boletas || []).filter((b) => b?.status === 'pending');

  // 1. Hoja de ruta por vendedor: lo vencido, lo que vence hoy, promesas de pago y recordatorios
  const bySeller = new Map<string, any[]>();
  for (const b of pending) {
    const elapsed = daysBetween(b.saleDate, dateStr);
    const dueOrPromised = (b.dueDate && b.dueDate <= dateStr) || (b.promisedPaymentDate && b.promisedPaymentDate <= dateStr);
    if (!dueOrPromised && elapsed < t.vendedorReminderDays) continue;
    const key = String(b.salespersonId || '');
    if (!bySeller.has(key)) bySeller.set(key, []);
    bySeller.get(key)!.push(b);
  }
  for (const seller of snap.salespeople || []) {
    if (seller?.active === false) continue;
    const list = bySeller.get(String(seller.id)) || [];
    if (list.length === 0) continue;
    const phone = normalizeWhatsAppPhone(seller.phone);
    if (!phone) {
      invalidPhones.push(`${seller.name || 'Vendedor'} (${seller.phone || 'sin teléfono'})`);
      continue;
    }
    list.sort((a, b) => daysBetween(b.saleDate, dateStr) - daysBetween(a.saleDate, dateStr));
    const total = list.reduce((a, b) => a + balanceDue(b), 0);
    const detail = list
      .slice(0, 12)
      .map((b) => `${b.clientName} ${formatMoney(balanceDue(b), symbol)} (${daysBetween(b.saleDate, dateStr)}d)`)
      .join(' · ');
    const more = list.length > 12 ? ` · y ${list.length - 12} más` : '';
    messages.push(
      message(snap, dateStr, 'vendor_route', 'vendedor', seller.name || 'Vendedor', phone, [
        seller.name || 'vendedor',
        snap.businessName,
        String(list.length),
        formatMoney(total, symbol),
        detail + more,
      ])
    );
  }

  // 2. Alertas al dueño (solo si hay algo pertinente)
  let ownerCount = 0;
  let alertCount = 0;
  let criticalCount = 0;
  let graceCount = 0;
  let atRisk = 0;
  for (const b of pending) {
    const elapsed = daysBetween(b.saleDate, dateStr);
    const pastDue = Math.max(0, daysBetween(b.dueDate, dateStr));
    const bal = balanceDue(b);
    let counted = false;
    if (elapsed >= t.criticalSaleDays) {
      criticalCount++;
      counted = true;
    } else if (elapsed >= t.alertModeDays) {
      alertCount++;
      counted = true;
    } else if (elapsed >= t.adminAlertDays) {
      ownerCount++;
      counted = true;
    }
    if (pastDue >= t.overdueGraceDays) {
      graceCount++;
      counted = true;
    }
    if (counted) atRisk += bal;
  }
  const parts: string[] = [];
  if (ownerCount) parts.push(`${ownerCount} con ${t.adminAlertDays}+ días desde la venta`);
  if (alertCount) parts.push(`${alertCount} en modo alerta (${t.alertModeDays}+ días)`);
  if (criticalCount) parts.push(`${criticalCount} en alerta crítica (${t.criticalSaleDays}+ días)`);
  if (graceCount) parts.push(`${graceCount} con ${t.overdueGraceDays}+ días de mora`);
  const pertinent = parts.length > 0;
  if (pertinent || cfg.notifyOwnerOnlyIfPertinent === false) {
    for (const owner of ownerRecipients(snap)) {
      messages.push(
        message(snap, dateStr, 'owner_alerts', 'dueño', owner.name, owner.phone, [
          owner.name,
          snap.businessName,
          formatDateEs(dateStr),
          pertinent ? parts.join(' · ') : 'sin boletas en alerta',
          formatMoney(atRisk, symbol),
        ])
      );
    }
  }

  // 3. Recordatorio a clientes con boletas vencidas: DESACTIVADO por defecto
  if (cfg.enableClientWhatsAppReminders === true && cfg.includeClientsInAutoDispatch === true) {
    const clientsById = new Map((snap.clients || []).map((c: any) => [String(c.id), c]));
    for (const b of pending) {
      if (!b.dueDate || b.dueDate >= dateStr) continue;
      const client: any = clientsById.get(String(b.clientId));
      const phone = normalizeWhatsAppPhone(client?.phone || b.clientPhone);
      if (!phone) continue;
      messages.push(
        message(
          snap,
          dateStr,
          'client_overdue',
          'cliente',
          b.clientName || client?.name || 'Cliente',
          phone,
          [b.clientName || 'cliente', snap.businessName, b.boletaNumber || '-', formatMoney(balanceDue(b), symbol), formatDateEs(b.dueDate)],
          `|${b.id}`
        )
      );
    }
  }

  return { messages, invalidPhones };
}

/** Cierre del día para los dueños */
export function planClosing(snap: BusinessSnapshot, dateStr: string): { messages: PlannedMessage[]; totals: Record<string, number> } {
  const cfg = snap.config || {};
  const symbol = cfg.currencySymbol || '$';
  let efectivo = 0;
  let transferencia = 0;
  let otros = 0;
  const add = (method: string, amount: number) => {
    if (method === 'efectivo') efectivo += amount;
    else if (method === 'transferencia') transferencia += amount;
    else otros += amount;
  };
  for (const b of snap.boletas || []) {
    if (b?.status !== 'pending') continue;
    for (const p of b.partialPayments || []) {
      if (p?.date === dateStr && Number(p.amount) > 0) add(p.paymentMethod || 'efectivo', Number(p.amount));
    }
  }
  for (const b of snap.paidBoletas || []) {
    const partials = b?.partialPayments || [];
    const totalPartials = partials.reduce((a: number, p: any) => a + Number(p?.amount || 0), 0);
    for (const p of partials) {
      if (p?.date === dateStr && Number(p.amount) > 0) add(p.paymentMethod || 'efectivo', Number(p.amount));
    }
    if (b?.paidAt?.slice(0, 10) === dateStr) {
      const credit = (b.creditNotes || []).reduce((a: number, c: any) => a + Number(c?.amount || 0), 0);
      const remainder = Math.max(0, Math.max(0, Number(b.amount || 0) - credit) - totalPartials);
      if (remainder > 0) add(b.paymentMethod || 'efectivo', remainder);
    }
  }
  const pending = (snap.boletas || []).filter((b) => b?.status === 'pending');
  const unpaidTotal = pending.reduce((a, b) => a + balanceDue(b), 0);
  const total = efectivo + transferencia + otros;
  const messages = ownerRecipients(snap).map((owner) =>
    message(snap, dateStr, 'daily_closing', 'dueño', owner.name, owner.phone, [
      owner.name,
      formatDateEs(dateStr),
      snap.businessName,
      formatMoney(efectivo, symbol),
      formatMoney(transferencia + otros, symbol),
      formatMoney(total, symbol),
      String(pending.length),
      formatMoney(unpaidTotal, symbol),
    ])
  );
  return { messages, totals: { efectivo, transferencia, otros, total, unpaidTotal, unpaidCount: pending.length } };
}

/** ¿Este comercio está en horario y habilitado para recibir el envío? */
export function isDue(configTime: string | undefined, fallback: string, nowTime: string, untilTime = '23:59'): boolean {
  const target = /^\d{2}:\d{2}$/.test(configTime || '') ? (configTime as string) : fallback;
  return nowTime >= target && nowTime <= untilTime;
}

/** El servicio de WhatsApp automático es del Plan 3 (o prueba gratis vigente) y no corre si la cuenta está pausada */
export function businessCanDispatch(business: Record<string, any>, todayStr: string): { ok: boolean; reason?: string } {
  const sub = business?.subscription || {};
  if (business?.status === 'suspended') return { ok: false, reason: 'Empresa suspendida' };
  if (sub.isPaused) return { ok: false, reason: 'Cuenta pausada' };
  const inTrial = Boolean(sub.trialEndsAt && sub.trialEndsAt >= todayStr);
  const tier = sub.planTier;
  if (tier && tier !== 'full' && !inTrial) return { ok: false, reason: 'WhatsApp automático es del Plan 3' };
  return { ok: true };
}
