// Prueba la conexión con Mercado Pago desde el servidor.
// Si el comercio está cargando un token nuevo, se prueba ese y (si funciona) se guarda
// en business_secrets. Si no, se prueba el que ya está guardado. El token nunca vuelve al navegador.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    auth: { persistSession: false },
  });
  const { data: who } = await caller.auth.getUser();
  if (!who?.user) return jsonResponse({ ok: false, message: 'Tu sesión venció. Volvé a iniciar sesión.' }, 401);

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const businessId = String(body?.tenantId || '');
  const { data: me } = await db.from('profiles').select('role, business_id, active').eq('id', who.user.id).maybeSingle();
  const canManage =
    me?.active !== false &&
    (me?.role === 'superadmin' || (me?.business_id === businessId && (me?.role === 'dueño' || me?.role === 'administrador')));
  if (!canManage) return jsonResponse({ ok: false, message: 'Solo el dueño o un administrador puede probar Mercado Pago.' }, 403);

  const draft = String(body?.mpAccessToken || '').trim();
  let token = draft;
  if (!token) {
    const { data } = await db.from('business_secrets').select('mp_access_token').eq('business_id', businessId).maybeSingle();
    token = String(data?.mp_access_token || '');
  }
  if (!token) return jsonResponse({ ok: false, message: 'Todavía no cargaste el Access Token de Mercado Pago.' });

  try {
    const res = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return jsonResponse({ ok: false, message: 'Mercado Pago rechazó el token. Revisá que sea el Access Token de producción (APP_USR-…).' });
    }
    if (draft) {
      await db.from('business_secrets').upsert({ business_id: businessId, mp_access_token: draft }, { onConflict: 'business_id' });
    }
    return jsonResponse({
      ok: true,
      message: `Conexión correcta con la cuenta ${data?.nickname || data?.email || data?.id}.`,
      account: { id: data?.id, nickname: data?.nickname, email: data?.email, firstName: data?.first_name, lastName: data?.last_name, siteId: data?.site_id },
    });
  } catch (err) {
    return jsonResponse({ ok: false, message: `No se pudo conectar con Mercado Pago: ${(err as Error).message}` });
  }
});
