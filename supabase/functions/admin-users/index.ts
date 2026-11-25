// Alta, edición y baja de usuarios (Supabase Auth + tabla profiles).
// Permisos:
//   · superadmin: todo.
//   · dueño / administrador: usuarios de SU comercio (nunca superadmins).
//   · cualquier usuario: su propio nombre, teléfono, email de contacto y contraseña.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, syntheticEmailFor, isSyntheticEmail } from '../_shared/http.ts';

type Role = 'superadmin' | 'dueño' | 'administrador' | 'vendedor';
const ROLES: Role[] = ['superadmin', 'dueño', 'administrador', 'vendedor'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!url || !serviceKey || !anonKey) return jsonResponse({ error: 'Servidor sin configurar.' }, 500);

  // Quién llama
  const authHeader = req.headers.get('Authorization') || '';
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: who } = await caller.auth.getUser();
  if (!who?.user) return jsonResponse({ error: 'Tu sesión venció. Volvé a iniciar sesión.' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: me } = await admin.from('profiles').select('id, role, business_id, active').eq('id', who.user.id).maybeSingle();
  if (!me || me.active === false) return jsonResponse({ error: 'Tu usuario no está habilitado.' }, 403);

  const isSuper = me.role === 'superadmin';
  const isManager = me.role === 'dueño' || me.role === 'administrador';

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Pedido inválido.' }, 400);
  }
  const action = String(body?.action || '');

  try {
    if (action === 'create') {
      const role = (ROLES.includes(body.role) ? body.role : 'vendedor') as Role;
      const businessId: string | null = role === 'superadmin' ? null : body.businessId || null;
      if (!isSuper) {
        if (!isManager || businessId !== me.business_id || role === 'superadmin') {
          return jsonResponse({ error: 'No tenés permiso para crear este usuario.' }, 403);
        }
      }
      if (role !== 'superadmin' && !businessId) return jsonResponse({ error: 'Elegí la empresa del usuario.' }, 400);
      const username = String(body.username || '').trim().toLowerCase();
      if (username.length < 3) return jsonResponse({ error: 'El usuario debe tener al menos 3 caracteres.' }, 400);
      const password = String(body.password || '');
      if (password.length < 6) return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);

      // Usuario único dentro de la empresa
      const dupQuery = admin.from('profiles').select('id').ilike('username', username);
      const { data: dups } = businessId ? await dupQuery.eq('business_id', businessId) : await dupQuery.is('business_id', null);
      if (dups && dups.length > 0) return jsonResponse({ error: `El usuario "${username}" ya existe en esa empresa.` }, 409);

      let code: string | null = null;
      if (businessId) {
        const { data: biz } = await admin.from('businesses').select('code').eq('id', businessId).maybeSingle();
        code = biz?.code || null;
      }
      const contactEmail = String(body.contactEmail || '').trim().toLowerCase();
      const email = contactEmail && contactEmail.includes('@') ? contactEmail : syntheticEmailFor(username, code);

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, full_name: body.fullName || '' },
      });
      if (createErr || !created?.user) {
        const msg = String(createErr?.message || '');
        return jsonResponse(
          { error: msg.toLowerCase().includes('already') ? 'Ya existe una cuenta con ese email.' : `No se pudo crear el usuario: ${msg}` },
          400
        );
      }
      const { error: profErr } = await admin.from('profiles').insert({
        id: created.user.id,
        business_id: businessId,
        role,
        username,
        full_name: String(body.fullName || username),
        email,
        phone: body.phone || null,
        active: body.active !== false,
        legacy_user_id: body.legacyUserId || null,
      });
      if (profErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return jsonResponse({ error: `No se pudo crear el perfil: ${profErr.message}` }, 400);
      }
      return jsonResponse({ ok: true, userId: created.user.id });
    }

    if (action === 'update' || action === 'delete') {
      const userId = String(body.userId || '');
      const { data: target } = await admin
        .from('profiles')
        .select('id, role, business_id, username, email')
        .eq('id', userId)
        .maybeSingle();
      if (!target) return jsonResponse({ error: 'Usuario no encontrado.' }, 404);

      const isSelf = target.id === me.id;
      const canManageTarget =
        isSuper || (isManager && target.business_id === me.business_id && target.role !== 'superadmin');
      if (!canManageTarget && !(isSelf && action === 'update')) {
        return jsonResponse({ error: 'No tenés permiso para modificar este usuario.' }, 403);
      }

      if (action === 'delete') {
        if (isSelf) return jsonResponse({ error: 'No podés eliminar tu propio usuario.' }, 400);
        if (target.role === 'superadmin') {
          const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'superadmin');
          if ((count || 0) <= 1) return jsonResponse({ error: 'No podés eliminar al único superadmin.' }, 400);
        }
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) return jsonResponse({ error: `No se pudo eliminar: ${error.message}` }, 400);
        return jsonResponse({ ok: true });
      }

      // update
      const patch: Record<string, unknown> = {};
      if (typeof body.fullName === 'string') patch.full_name = body.fullName;
      if (typeof body.phone === 'string') patch.phone = body.phone;
      if (typeof body.username === 'string' && body.username.trim().length >= 3) patch.username = body.username.trim().toLowerCase();
      if (canManageTarget && !isSelf) {
        if (ROLES.includes(body.role) && (isSuper || body.role !== 'superadmin')) patch.role = body.role;
        if (typeof body.active === 'boolean') patch.active = body.active;
        if (isSuper && 'businessId' in body) patch.business_id = patch.role === 'superadmin' ? null : body.businessId || null;
      }

      const authPatch: Record<string, unknown> = {};
      if (body.password) {
        if (String(body.password).length < 6) return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
        authPatch.password = String(body.password);
      }
      const contactEmail = String(body.contactEmail || '').trim().toLowerCase();
      if (contactEmail && contactEmail.includes('@') && contactEmail !== String(target.email || '').toLowerCase()) {
        authPatch.email = contactEmail;
        authPatch.email_confirm = true;
        patch.email = contactEmail;
      } else if (!contactEmail && !isSyntheticEmail(target.email) && body.contactEmail === null) {
        // Se dejó el email vacío: se mantiene el actual para no perder el acceso
      }
      if (Object.keys(authPatch).length > 0) {
        const { error } = await admin.auth.admin.updateUserById(userId, authPatch);
        if (error) return jsonResponse({ error: `No se pudo actualizar el acceso: ${error.message}` }, 400);
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await admin.from('profiles').update(patch).eq('id', userId);
        if (error) return jsonResponse({ error: `No se pudo actualizar el perfil: ${error.message}` }, 400);
      }
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Acción no reconocida.' }, 400);
  } catch (err) {
    return jsonResponse({ error: `Error inesperado: ${(err as Error).message}` }, 500);
  }
});
