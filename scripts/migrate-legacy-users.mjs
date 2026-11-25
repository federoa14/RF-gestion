#!/usr/bin/env node
/**
 * Migración única de usuarios viejos → Supabase Auth.
 * ---------------------------------------------------------------------------
 * Requisitos: haber corrido supabase/schema_v2.sql y supabase/migrate_legacy.sql.
 *
 * Se corre UNA vez desde tu computadora (nunca en el navegador):
 *
 *   SUPABASE_URL="https://TU-PROYECTO.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="..." \
 *   node scripts/migrate-legacy-users.mjs
 *
 * Qué hace:
 *   · Lee public.legacy_users (copiados de la tabla vieja por migrate_legacy.sql).
 *   · Crea cada usuario en Supabase Auth con su email real, o con un email interno
 *     (usuario.codigo@usuarios.rf-gestion.invalid) si no tenía email.
 *   · Si su contraseña vieja tiene 6 o más caracteres, la conserva. Si es más corta
 *     (Supabase exige 6), le genera una temporal y la anota en el reporte.
 *   · No migra los superadmin escritos en el código viejo: tu superadmin lo creás
 *     vos (ver el final de supabase/schema_v2.sql).
 *   · Es seguro correrlo de nuevo: saltea los que ya se migraron.
 *
 * Al final escribe usuarios-migrados.csv con las contraseñas temporales.
 * Pasáselas a cada usuario y BORRÁ el archivo.
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Faltan las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const SYNTHETIC_EMAIL_DOMAIN = 'usuarios.rf-gestion.invalid';
const slug = (v) =>
  (v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
const syntheticEmailFor = (username, code) => {
  const u = slug(username) || 'usuario';
  const c = slug(code || '');
  return c ? `${u}.${c}@${SYNTHETIC_EMAIL_DOMAIN}` : `${u}@${SYNTHETIC_EMAIL_DOMAIN}`;
};
const tempPassword = () => randomBytes(9).toString('base64url');
const LEGACY_HARDCODED_SUPERADMINS = new Set(['usr-superadmin', 'usr-federoa']);

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: pending, error } = await supabase.from('legacy_users').select('legacy_id, data').is('migrated_at', null);
if (error) {
  console.error('No se pudo leer legacy_users:', error.message);
  process.exit(1);
}
const { data: businesses } = await supabase.from('businesses').select('id, code');
const codeById = new Map((businesses || []).map((b) => [b.id, b.code]));

const report = [['usuario', 'empresa', 'email de acceso', 'contraseña temporal', 'estado']];
let ok = 0;
let skipped = 0;
let failed = 0;

for (const row of pending || []) {
  const u = row.data || {};
  const username = String(u.username || '').trim().toLowerCase();
  const role = ['dueño', 'administrador', 'vendedor', 'superadmin'].includes(u.role) ? u.role : 'vendedor';
  const businessId = role === 'superadmin' ? null : u.tenantId && u.tenantId !== 'all' ? u.tenantId : null;

  if (role === 'superadmin' && (LEGACY_HARDCODED_SUPERADMINS.has(row.legacy_id) || !u.email)) {
    await supabase.from('legacy_users').update({ note: 'Superadmin viejo: no se migra (crealo a mano).' }).eq('legacy_id', row.legacy_id);
    report.push([username, '-', '-', '-', 'omitido (superadmin del código viejo)']);
    skipped++;
    continue;
  }
  if (role !== 'superadmin' && (!businessId || !codeById.has(businessId))) {
    await supabase.from('legacy_users').update({ note: 'Empresa inexistente.' }).eq('legacy_id', row.legacy_id);
    report.push([username, businessId || '-', '-', '-', 'omitido (empresa inexistente)']);
    skipped++;
    continue;
  }

  const code = businessId ? codeById.get(businessId) : null;
  const realEmail = String(u.email || '').trim().toLowerCase();
  const email = realEmail.includes('@') ? realEmail : syntheticEmailFor(username, code);
  const oldPassword = String(u.password || '');
  const password = oldPassword.length >= 6 ? oldPassword : tempPassword();

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: u.fullName || '' },
  });
  if (createErr || !created?.user) {
    failed++;
    report.push([username, code || '-', email, '-', `error: ${createErr?.message}`]);
    await supabase.from('legacy_users').update({ note: `Error: ${createErr?.message}` }).eq('legacy_id', row.legacy_id);
    continue;
  }

  const { error: profErr } = await supabase.from('profiles').insert({
    id: created.user.id,
    business_id: businessId,
    role,
    username,
    full_name: u.fullName || username,
    email,
    phone: u.phone || null,
    active: u.active !== false,
    legacy_user_id: row.legacy_id,
  });
  if (profErr) {
    await supabase.auth.admin.deleteUser(created.user.id);
    failed++;
    report.push([username, code || '-', email, '-', `error de perfil: ${profErr.message}`]);
    continue;
  }

  await supabase
    .from('legacy_users')
    .update({ migrated_at: new Date().toISOString(), auth_user_id: created.user.id, note: null })
    .eq('legacy_id', row.legacy_id);
  ok++;
  report.push([username, code || '-', email, password === oldPassword ? '(conserva su clave)' : password, 'migrado']);
}

const csv = report.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
writeFileSync('usuarios-migrados.csv', '﻿' + csv);
console.log(`Migrados: ${ok} · Omitidos: ${skipped} · Con error: ${failed}`);
console.log('Reporte en usuarios-migrados.csv (tiene contraseñas temporales: compartilas y borralo).');
console.log('Cuando todos estén migrados podés borrar las contraseñas viejas con:');
console.log("  update public.legacy_users set data = data - 'password';");
