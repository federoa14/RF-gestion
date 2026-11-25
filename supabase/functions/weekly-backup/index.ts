// Respaldo automático semanal de los datos de cada comercio.
//
// Modos:
//   · { mode: 'cron' }  → lo llama pg_cron una vez por semana (header x-cron-secret).
//                         Guarda un JSON por comercio en Storage: backups/<business_id>/<AAAA-MM-DD>.json
//                         y deja solo los 8 más nuevos (unos 2 meses).
//   · { mode: 'now', businessId } → botón "Hacer un respaldo ahora" (dueño, administrador o superadmin).
//
// Los tokens (business_secrets) nunca se incluyen.
// La clave del cron se lee de Vault (rf_cron_secret); no hace falta cargar variables.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import { isCronRequest } from '../_shared/cronAuth.ts';
import { BACKUP_TABLES, backupFileName, filesToPrune, stripSecrets } from '../_shared/backupLogic.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const BUCKET = 'backups';
const PAGE = 1000;

async function readAll(db: Db, table: string, businessId: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select('*').eq('business_id', businessId).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function backupBusiness(db: Db, businessId: string) {
  const { data: business, error } = await db.from('businesses').select('*').eq('id', businessId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!business) throw new Error('Comercio inexistente');
  const tables: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) tables[t] = await readAll(db, t, businessId);
  // Por las dudas, se limpian campos con aspecto de clave en la configuración del comercio
  tables.business_settings = stripSecrets(tables.business_settings);
  const payload = {
    format: 'rf-gestion-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    businessId,
    business: stripSecrets(business),
    tables,
  };
  const name = backupFileName(new Date());
  const path = `${businessId}/${name}`;
  const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const up = await db.storage.from(BUCKET).upload(path, body, { upsert: true, contentType: 'application/json' });
  if (up.error) throw new Error(`Storage: ${up.error.message}`);
  const { data: files } = await db.storage.from(BUCKET).list(businessId, { limit: 100 });
  const prune = filesToPrune((files || []).map((f: { name: string }) => f.name));
  if (prune.length) await db.storage.from(BUCKET).remove(prune.map((n) => `${businessId}/${n}`));
  const rowCount = Object.values(tables).reduce((acc, r) => acc + r.length, 0);
  return { businessId, path, rows: rowCount, pruned: prune.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));

  if (body?.mode === 'cron') {
    if (!(await isCronRequest(req, db))) return jsonResponse({ error: 'No autorizado.' }, 401);
    const { data: businesses, error } = await db.from('businesses').select('id');
    if (error) return jsonResponse({ error: error.message }, 500);
    const results = [];
    for (const b of businesses || []) {
      try {
        results.push({ ok: true, ...(await backupBusiness(db, b.id)) });
      } catch (e) {
        results.push({ ok: false, businessId: b.id, error: String((e as Error).message || e) });
      }
    }
    return jsonResponse({ results });
  }

  if (body?.mode === 'now') {
    const businessId = String(body.businessId || '');
    const authHeader = req.headers.get('Authorization') || '';
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: allowed, error } = await asUser.rpc('can_manage_business', { p_business_id: businessId });
    if (error || allowed !== true) return jsonResponse({ error: 'No autorizado.' }, 403);
    try {
      return jsonResponse({ ok: true, ...(await backupBusiness(db, businessId)) });
    } catch (e) {
      return jsonResponse({ error: String((e as Error).message || e) }, 500);
    }
  }

  return jsonResponse({ error: 'Modo inválido.' }, 400);
});
