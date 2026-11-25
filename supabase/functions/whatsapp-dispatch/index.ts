// Envíos de WhatsApp desde el servidor con la WhatsApp Business Cloud API (Meta).
//
// Modos:
//   · { mode: 'cron' }                         → lo llama pg_cron cada 15 min (header x-cron-secret).
//                                                 Envía a cada comercio cuando llega su horario
//                                                 (por defecto 08:00 matutino y 19:00 cierre, hora AR).
//   · { mode: 'manual', businessId, kind }     → botones "Probar envío ahora" / "Enviar cierre ahora"
//                                                 (requiere sesión de dueño, administrador o superadmin).
//     kind: 'morning' | 'closing'
//
// Cada mensaje queda en public.whatsapp_messages con una clave única por día y
// destinatario: nunca se manda dos veces lo mismo, y queda el historial con errores.
//
// Credenciales: cada comercio conecta SU número desde la app (whatsapp-connect → business_secrets).
// Variables de entorno (Supabase → Edge Functions → Secrets):
//   CRON_SECRET               Opcional: por defecto se usa la clave guardada en Vault (rf_cron_secret)
//   WHATSAPP_API_VERSION      Versión de la Graph API (opcional, por defecto v21.0)
//   WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TEMPLATE_LANG
//                             Opcionales: número general de la plataforma, solo como respaldo
//                             para comercios que no conectaron el suyo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import { isCronRequest } from '../_shared/cronAuth.ts';
import {
  argentinaNow,
  businessCanDispatch,
  isDue,
  planClosing,
  planMorning,
  type BusinessSnapshot,
  type PlannedMessage,
} from '../_shared/dispatchLogic.ts';

const MAX_ATTEMPTS = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function loadSnapshot(db: Db, businessId: string): Promise<BusinessSnapshot | null> {
  const [biz, settings, boletas, salespeople, admins, clients] = await Promise.all([
    db.from('businesses').select('id, data').eq('id', businessId).maybeSingle(),
    db.from('business_settings').select('config').eq('business_id', businessId).maybeSingle(),
    db.from('boletas').select('data, archived').eq('business_id', businessId),
    db.from('salespeople').select('data').eq('business_id', businessId),
    db.from('administrators').select('data').eq('business_id', businessId),
    db.from('clients').select('data').eq('business_id', businessId),
  ]);
  if (!biz.data) return null;
  const config = { ...(biz.data.data?.config || {}), ...(settings.data?.config || {}) };
  const rows = boletas.data || [];
  return {
    businessId,
    businessName: config.distributorName || biz.data.data?.name || 'tu comercio',
    config,
    boletas: rows.filter((r: any) => !r.archived).map((r: any) => r.data),
    paidBoletas: rows.filter((r: any) => r.archived).map((r: any) => r.data),
    salespeople: (salespeople.data || []).map((r: any) => r.data),
    administrators: (admins.data || []).map((r: any) => r.data),
    clients: (clients.data || []).map((r: any) => r.data),
  };
}

interface WaCredentials {
  token: string;
  phoneId: string;
  lang: string;
}

/**
 * Credenciales de WhatsApp del comercio (opción B: cada comercio su número).
 * Si el comercio no conectó el suyo y la plataforma cargó un número general
 * (WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID), se usa ese como respaldo.
 */
async function loadCredentials(db: Db, businessId: string): Promise<WaCredentials | null> {
  const { data } = await db
    .from('business_secrets')
    .select('wa_access_token, wa_phone_number_id, wa_template_lang')
    .eq('business_id', businessId)
    .maybeSingle();
  if (data?.wa_access_token && data?.wa_phone_number_id) {
    return { token: data.wa_access_token, phoneId: data.wa_phone_number_id, lang: data.wa_template_lang || 'es_AR' };
  }
  const token = Deno.env.get('WHATSAPP_TOKEN') || '';
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  if (token && phoneId) return { token, phoneId, lang: Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'es_AR' };
  return null;
}

const NOT_CONFIGURED = 'WhatsApp no está configurado: el comercio todavía no conectó su número de WhatsApp Business.';

async function sendTemplate(msg: PlannedMessage, creds: WaCredentials | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!creds) return { ok: false, error: NOT_CONFIGURED };
  const { token, phoneId, lang } = creds;
  const version = Deno.env.get('WHATSAPP_API_VERSION') || 'v21.0';
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: msg.recipientPhone,
        type: 'template',
        template: {
          name: msg.template,
          language: { code: lang },
          components: [{ type: 'body', parameters: msg.variables.map((text) => ({ type: 'text', text })) }],
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = body?.error;
      return { ok: false, error: e ? `Meta ${e.code || res.status}: ${e.error_user_msg || e.message}` : `Meta HTTP ${res.status}` };
    }
    return { ok: true, id: body?.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: `No se pudo conectar con Meta: ${(err as Error).message}` };
  }
}

/** Registra (sin duplicar) y envía. Devuelve el resultado de cada mensaje. */
async function deliver(db: Db, businessId: string, runDate: string, msgs: PlannedMessage[], trigger: 'cron' | 'manual') {
  const creds = msgs.length > 0 ? await loadCredentials(db, businessId) : null;
  const results: Array<{ recipient: string; kind: string; status: string; error?: string }> = [];
  for (const msg of msgs) {
    await db.from('whatsapp_messages').upsert(
      {
        business_id: businessId,
        run_date: runDate,
        kind: msg.kind,
        recipient_role: msg.recipientRole,
        recipient_name: msg.recipientName,
        recipient_phone: msg.recipientPhone,
        template: msg.template,
        variables: msg.variables,
        preview: msg.preview,
        dedupe_key: msg.dedupeKey,
        trigger,
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true }
    );
    const { data: row } = await db.from('whatsapp_messages').select('id, status, attempts').eq('dedupe_key', msg.dedupeKey).maybeSingle();
    if (!row) continue;
    // 'skipped' (WhatsApp sin configurar) se reintenta: apenas se carga el token, sale.
    if (row.status === 'sent' || (row.status === 'failed' && row.attempts >= MAX_ATTEMPTS)) {
      results.push({ recipient: msg.recipientName, kind: msg.kind, status: row.status === 'sent' ? 'ya enviado hoy' : row.status });
      continue;
    }
    const sent = await sendTemplate(msg, creds);
    const notConfigured = !sent.ok && sent.error === NOT_CONFIGURED;
    await db
      .from('whatsapp_messages')
      .update({
        status: sent.ok ? 'sent' : notConfigured ? 'skipped' : 'failed',
        attempts: row.attempts + 1,
        wa_message_id: sent.id || null,
        error: sent.ok ? null : sent.error,
        sent_at: sent.ok ? new Date().toISOString() : null,
      })
      .eq('id', row.id);
    results.push({ recipient: msg.recipientName, kind: msg.kind, status: sent.ok ? 'enviado' : 'error', error: sent.error });

    // También al registro que ya muestra la app (WhatsApp Automático → historial)
    if (sent.ok) {
      const milestone = msg.kind === 'daily_closing' ? 'daily_closing' : msg.kind === 'client_overdue' ? 'overdue_client' : msg.kind === 'vendor_route' ? 'overdue' : 'owner_alert';
      const logId = `wa-${row.id}`;
      await db.from('dispatch_logs').upsert(
        {
          business_id: businessId,
          id: logId,
          data: {
            id: logId,
            timestamp: new Date().toISOString(),
            channel: 'whatsapp',
            recipientName: msg.recipientName,
            recipientRole: msg.recipientRole,
            recipientContact: msg.recipientPhone,
            recipientPhone: msg.recipientPhone,
            boletasCount: 0,
            totalAmount: 0,
            messageSnippet: msg.preview.slice(0, 180),
            fullMessage: msg.preview,
            ruleMilestone: milestone,
            status: 'sent',
            deliveryStatus: 'gateway_api',
            gatewayResponse: `WhatsApp Business Cloud API (${sent.id || 'ok'})`,
          },
        },
        { onConflict: 'business_id,id' }
      );
    }
  }
  return results;
}

async function runForBusiness(db: Db, businessId: string, which: Array<'morning' | 'closing'>, trigger: 'cron' | 'manual') {
  const { dateStr } = argentinaNow();
  const snap = await loadSnapshot(db, businessId);
  if (!snap) return { businessId, error: 'Empresa no encontrada.' };
  const { data: biz } = await db.from('businesses').select('data').eq('id', businessId).maybeSingle();
  const allowed = businessCanDispatch(biz?.data || {}, dateStr);
  if (!allowed.ok) return { businessId, skipped: allowed.reason };

  const out: Record<string, unknown> = { businessId };
  if (which.includes('morning')) {
    const plan = planMorning(snap, dateStr);
    out.morning = await deliver(db, businessId, dateStr, plan.messages, trigger);
    out.invalidPhones = plan.invalidPhones;
    if (plan.messages.length === 0) out.morningInfo = 'No había boletas para avisar hoy.';
  }
  if (which.includes('closing')) {
    const plan = planClosing(snap, dateStr);
    out.closing = await deliver(db, businessId, dateStr, plan.messages, trigger);
    out.closingTotals = plan.totals;
    if (plan.messages.length === 0) out.closingInfo = 'No hay dueños con teléfono para recibir el cierre.';
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));

  // ---- Cron programado
  if (body?.mode === 'cron') {
    if (!(await isCronRequest(req, db))) return jsonResponse({ error: 'No autorizado.' }, 401);
    const { timeStr } = argentinaNow();
    const { data: settings } = await db.from('business_settings').select('business_id, config');
    const summary = [];
    for (const s of settings || []) {
      const cfg = s.config || {};
      const which: Array<'morning' | 'closing'> = [];
      const closingTime = /^\d{2}:\d{2}$/.test(cfg.dailyClosingTime || '') ? cfg.dailyClosingTime : '19:00';
      // El matutino se manda desde su horario hasta el cierre (si el cron estuvo caído, sale igual ese día)
      if (cfg.autoDispatchEnabled !== false && isDue(cfg.autoDispatchTime, '08:00', timeStr, closingTime)) which.push('morning');
      if (cfg.dailyClosingEnabled !== false && isDue(cfg.dailyClosingTime, '19:00', timeStr)) which.push('closing');
      if (which.length === 0) continue;
      try {
        summary.push(await runForBusiness(db, s.business_id, which, 'cron'));
      } catch (err) {
        summary.push({ businessId: s.business_id, error: (err as Error).message });
      }
    }
    return jsonResponse({ ok: true, at: timeStr, summary });
  }

  // ---- Botones manuales desde la app
  if (body?.mode === 'manual') {
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      auth: { persistSession: false },
    });
    const { data: who } = await caller.auth.getUser();
    if (!who?.user) return jsonResponse({ error: 'Tu sesión venció. Volvé a iniciar sesión.' }, 401);
    const { data: me } = await db.from('profiles').select('role, business_id, active').eq('id', who.user.id).maybeSingle();
    const businessId = String(body.businessId || '');
    const canManage =
      me?.active !== false &&
      (me?.role === 'superadmin' || (me?.business_id === businessId && (me?.role === 'dueño' || me?.role === 'administrador')));
    if (!canManage) return jsonResponse({ error: 'Solo el dueño o un administrador puede hacer envíos.' }, 403);
    const which: Array<'morning' | 'closing'> = body.kind === 'closing' ? ['closing'] : ['morning'];
    try {
      const result = await runForBusiness(db, businessId, which, 'manual');
      const configured = Boolean(await loadCredentials(db, businessId));
      return jsonResponse({ ok: true, configured, result });
    } catch (err) {
      return jsonResponse({ error: `No se pudo hacer el envío: ${(err as Error).message}` }, 500);
    }
  }

  return jsonResponse({ error: 'Modo no reconocido.' }, 400);
});
