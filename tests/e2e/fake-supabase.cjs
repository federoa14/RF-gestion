// Supabase simulado en memoria para las pruebas en el navegador (PostgREST, Auth, RPC,
// Functions y Storage). No implementa RLS: sirve para probar la app (login, carga,
// guardado, reintentos). Los permisos reales se prueban con SQL contra Postgres.
const BASE = 'http://fake-supabase.test';

function makeFake(seed) {
  const db = JSON.parse(JSON.stringify(seed.tables));
  const log = [];
  let offline = false;
  const users = seed.users; // [{id,email,password}]

  const pk = {
    businesses: ['id'], profiles: ['id'], business_settings: ['business_id'], platform_settings: ['key'],
    announcements: ['id'], subscription_payments: ['business_id', 'month_key'], public_catalogs: ['business_id'],
    payment_links: ['token'], subscription_pay_orders: ['token'],
  };
  const keyOf = (t, row) => (pk[t] || ['business_id', 'id']).map((k) => row[k]).join('|');

  function applyFilters(rows, params) {
    let out = rows;
    for (const [k, v] of params.entries()) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
      const m = v.match(/^(eq|ilike|is)\.(.*)$/);
      if (!m) continue;
      const [, op, val] = m;
      out = out.filter((r) => {
        const cell = k.includes('->') ? undefined : r[k];
        if (op === 'eq') return String(cell) === val;
        if (op === 'ilike') return String(cell || '').toLowerCase() === val.toLowerCase();
        if (op === 'is') return val === 'null' ? cell == null : true;
        return true;
      });
    }
    return out;
  }

  function project(rows, select) {
    if (!select || select === '*') return rows;
    const cols = select.split(',').map((c) => c.trim()).filter((c) => !c.includes('('));
    return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] === undefined ? null : r[c]])));
  }

  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: cors(), body: '' });
    if (offline) return route.abort('internetdisconnected');
    const json = (status, body, extra = {}) =>
      route.fulfill({ status, headers: { ...cors(), 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });

    // ---- Auth
    if (url.pathname === '/auth/v1/token') {
      const body = JSON.parse(req.postData() || '{}');
      const u = users.find((x) => x.email === body.email && x.password === body.password);
      log.push({ kind: 'auth', email: body.email, ok: Boolean(u) });
      if (!u) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      return json(200, session(u));
    }
    if (url.pathname === '/auth/v1/user') {
      return json(200, { id: users[0].id, email: users[0].email, aud: 'authenticated', role: 'authenticated' });
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors(), body: '' });

    // ---- Storage (respaldos)
    if (url.pathname.startsWith('/storage/v1/object/list/')) {
      log.push({ kind: 'storage_list', path: url.pathname, body: req.postData() });
      return json(200, (db.storageFiles || []).map((n) => ({ name: n, created_at: new Date().toISOString(), metadata: { size: 1000 } })));
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      log.push({ kind: 'storage_sign', path: url.pathname });
      return json(200, { signedURL: '/object/sign/backups/x.json?token=t' });
    }
    // ---- Functions
    if (url.pathname.startsWith('/functions/v1/')) {
      const name = url.pathname.split('/').pop();
      const body = JSON.parse(req.postData() || '{}');
      log.push({ kind: 'function', name, body });
      if (name === 'weekly-backup') { (db.storageFiles = db.storageFiles || []).unshift(new Date().toISOString().slice(0, 10) + '.json'); return json(200, { ok: true, rows: 42, path: 'biz1/x.json' }); }
      if (name === 'admin-users') return json(200, { ok: true, userId: 'new-auth-id-1' });
      if (name === 'whatsapp-connect') {
        if (body.action === 'status') return json(200, { ok: true, connected: false });
        if (body.action === 'save') return json(200, { ok: true, message: 'WhatsApp conectado: Distribuidora Uno (+54 9 11 4444-5555).', displayPhone: '+54 9 11 4444-5555' });
        return json(200, { ok: true });
      }
      if (name === 'whatsapp-dispatch') return json(200, { ok: true, configured: true, result: { businessId: body.businessId, morning: [{ recipient: 'Juan', kind: 'vendor_route', status: 'enviado' }, { recipient: 'Dueño', kind: 'owner_alerts', status: 'enviado' }], invalidPhones: ['Ana (123)'] } });
      return json(200, { ok: false });
    }

    // ---- RPC
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop();
      const body = JSON.parse(req.postData() || '{}');
      log.push({ kind: 'rpc', fn, body });
      if (fn === 'run_retention_purge') return json(200, { purgedTotal: 0, businesses: [] });
      if (fn === 'public_catalog_get') return json(200, seed.catalog || null);
      if (fn === 'public_entity_put') { (db.publicPuts = db.publicPuts || []).push(body); return json(200, body.p_data); }
      if (fn === 'public_entity_find') return json(200, []);
      return json(200, null);
    }

    // ---- Tables
    const table = url.pathname.replace('/rest/v1/', '');
    db[table] = db[table] || [];
    const params = url.searchParams;
    if (method === 'GET' || method === 'HEAD') {
      let rows = applyFilters(db[table], params);
      const range = req.headers()['range'];
      if (range) {
        const [a, b] = range.split('-').map(Number);
        rows = rows.slice(a, b + 1);
      }
      const accept = req.headers()['accept'] || '';
      const projected = project(rows, params.get('select'));
      if (accept.includes('vnd.pgrst.object')) {
        if (projected.length === 0) return json(406, { code: 'PGRST116', message: 'no rows' });
        return json(200, projected[0]);
      }
      return json(200, projected, { 'content-range': `0-${Math.max(0, projected.length - 1)}/${projected.length}` });
    }
    if (method === 'POST') {
      const body = JSON.parse(req.postData() || '[]');
      const rows = Array.isArray(body) ? body : [body];
      const prefer = req.headers()['prefer'] || '';
      for (const row of rows) {
        const k = keyOf(table, row);
        const idx = db[table].findIndex((r) => keyOf(table, r) === k);
        if (idx >= 0) {
          if (!prefer.includes('ignore-duplicates')) db[table][idx] = { ...db[table][idx], ...row };
        } else db[table].push(row);
      }
      log.push({ kind: 'upsert', table, rows });
      return json(201, prefer.includes('return=representation') ? rows : []);
    }
    if (method === 'PATCH') {
      const body = JSON.parse(req.postData() || '{}');
      const targets = applyFilters(db[table], params);
      targets.forEach((t) => Object.assign(t, body));
      log.push({ kind: 'update', table, body });
      return json(200, []);
    }
    if (method === 'DELETE') {
      const targets = applyFilters(db[table], params);
      db[table] = db[table].filter((r) => !targets.includes(r));
      log.push({ kind: 'delete', table, count: targets.length, params: url.search });
      return json(200, []);
    }
    return json(404, {});
  }

  function session(u) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    return {
      access_token: `${header}.${payload}.sig`,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'refresh-' + u.id,
      user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
    };
  }

  function cors() {
    return {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS,HEAD',
      'access-control-expose-headers': 'content-range',
    };
  }

  return {
    db,
    log,
    setOffline: (v) => (offline = v),
    install: async (context) => {
      await context.route(`${BASE}/**`, handle);
      await context.route('ws://fake-supabase.test/**', (r) => r.abort());
    },
  };
}

module.exports = { makeFake };
