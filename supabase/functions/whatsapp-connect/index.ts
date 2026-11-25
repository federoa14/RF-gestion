// Conecta el número de WhatsApp Business de CADA comercio (opción B).
// Acciones (requiere sesión de dueño, administrador o superadmin):
//   · { action: 'save', businessId, phoneNumberId, accessToken, templateLang? }
//       Valida contra Meta (GET /{phone-number-id}) y recién ahí guarda en business_secrets.
//   · { action: 'remove', businessId }   → borra las credenciales.
//   · { action: 'status', businessId }   → devuelve si está conectado (nunca el token).
// El token nunca vuelve al navegador.
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
  const businessId = String(body?.businessId || '');
  const { data: me } = await db.from('profiles').select('role, business_id, active').eq('id', who.user.id).maybeSingle();
  const canManage =
    me?.active !== false &&
    (me?.role === 'superadmin' || (me?.business_id === businessId && (me?.role === 'dueño' || me?.role === 'administrador')));
  if (!canManage) return jsonResponse({ ok: false, message: 'Solo el dueño o un administrador puede conectar WhatsApp.' }, 403);

  const setConfigFlags = async (flags: Record<string, unknown>) => {
    const { data } = await db.from('business_settings').select('config').eq('business_id', businessId).maybeSingle();
    const config = { ...(data?.config || {}), ...flags };
    await db.from('business_settings').upsert({ business_id: businessId, config }, { onConflict: 'business_id' });
  };

  if (body?.action === 'status') {
    const { data } = await db
      .from('business_secrets')
      .select('wa_phone_number_id, wa_display_phone, wa_connected_at, wa_access_token')
      .eq('business_id', businessId)
      .maybeSingle();
    return jsonResponse({
      ok: true,
      connected: Boolean(data?.wa_access_token && data?.wa_phone_number_id),
      displayPhone: data?.wa_display_phone || null,
      connectedAt: data?.wa_connected_at || null,
    });
  }

  if (body?.action === 'remove') {
    await db
      .from('business_secrets')
      .update({ wa_access_token: null, wa_phone_number_id: null, wa_display_phone: null, wa_connected_at: null })
      .eq('business_id', businessId);
    await setConfigFlags({ hasWhatsAppCredentials: false, whatsappDisplayPhone: null });
    return jsonResponse({ ok: true, message: 'WhatsApp desconectado.' });
  }

  if (body?.action === 'save') {
    const phoneNumberId = String(body?.phoneNumberId || '').trim();
    const accessToken = String(body?.accessToken || '').trim();
    const templateLang = String(body?.templateLang || 'es_AR').trim() || 'es_AR';
    if (!/^\d{6,25}$/.test(phoneNumberId)) {
      return jsonResponse({ ok: false, message: 'El "Identificador del número de teléfono" son solo números (lo ves en Meta → WhatsApp → Configuración de la API).' });
    }
    if (accessToken.length < 30) return jsonResponse({ ok: false, message: 'El token parece incompleto. Copiá el token permanente completo.' });

    const version = Deno.env.get('WHATSAPP_API_VERSION') || 'v21.0';
    try {
      const res = await fetch(
        `https://graph.facebook.com/${version}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = data?.error;
        return jsonResponse({
          ok: false,
          message: `Meta rechazó los datos${e?.message ? `: ${e.message}` : ''}. Revisá el token (que sea permanente y tenga el permiso whatsapp_business_messaging) y el ID del número.`,
        });
      }
      const displayPhone = String(data?.display_phone_number || '');
      await db.from('business_secrets').upsert(
        {
          business_id: businessId,
          wa_access_token: accessToken,
          wa_phone_number_id: phoneNumberId,
          wa_template_lang: templateLang,
          wa_display_phone: displayPhone,
          wa_connected_at: new Date().toISOString(),
        },
        { onConflict: 'business_id' }
      );
      await setConfigFlags({ hasWhatsAppCredentials: true, whatsappDisplayPhone: displayPhone, whatsappProvider: 'meta' });
      return jsonResponse({
        ok: true,
        message: `WhatsApp conectado: ${data?.verified_name || 'tu negocio'} (${displayPhone}).`,
        displayPhone,
        verifiedName: data?.verified_name || null,
        qualityRating: data?.quality_rating || null,
      });
    } catch (err) {
      return jsonResponse({ ok: false, message: `No se pudo conectar con Meta: ${(err as Error).message}` });
    }
  }

  return jsonResponse({ ok: false, message: 'Acción no reconocida.' }, 400);
});
