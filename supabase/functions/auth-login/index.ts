// Inicio de sesión con "usuario + código de empresa" (para quienes no tienen email).
// Busca el usuario en el servidor y valida la contraseña con Supabase Auth.
// Nunca devuelve emails: solo la sesión si las credenciales son correctas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

const GENERIC_ERROR = 'Usuario o contraseña incorrectos.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    if (!url || !serviceKey || !anonKey) return jsonResponse({ error: 'Servidor sin configurar.' }, 500);

    const body = await req.json().catch(() => ({}));
    const username = String(body?.username || '').trim().toLowerCase();
    const tenantCode = String(body?.tenantCode || '').trim().toUpperCase();
    const password = String(body?.password || '');
    if (!username || !password) return jsonResponse({ error: GENERIC_ERROR }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    let query = admin
      .from('profiles')
      .select('id, business_id, active, email, businesses(code)')
      .ilike('username', username);
    const { data: candidates, error } = await query;
    if (error) return jsonResponse({ error: 'No se pudo verificar el usuario.' }, 500);

    let matches = (candidates || []).filter((p: any) => p.active !== false);
    if (tenantCode) {
      matches = matches.filter((p: any) => (p.businesses?.code || '').toUpperCase() === tenantCode);
    }
    if (matches.length === 0) return jsonResponse({ error: GENERIC_ERROR }, 401);
    if (matches.length > 1) {
      return jsonResponse({ error: 'Hay más de un usuario con ese nombre: completá el código de tu empresa.' }, 409);
    }

    // El email está guardado en el perfil: se evita una consulta extra a Auth (más rápido).
    // Si faltara, se busca en Auth como antes.
    let email: string | undefined = matches[0].email || undefined;
    if (!email) {
      const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(matches[0].id);
      email = authUser?.user?.email;
      if (userErr || !email) return jsonResponse({ error: GENERIC_ERROR }, 401);
    }

    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: session, error: signErr } = await anon.auth.signInWithPassword({ email, password });
    if (signErr || !session?.session) return jsonResponse({ error: GENERIC_ERROR }, 401);

    return jsonResponse({
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
    });
  } catch {
    return jsonResponse({ error: 'No se pudo iniciar sesión. Intentá nuevamente.' }, 500);
  }
});
