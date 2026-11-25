// Dashboard local de tareas: node tareas/server.mjs  →  http://localhost:3939
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIR, leerTareas, ordenar, agregar, editar, eliminar, ultimasLineasLog, log } from './lib.mjs';

const PORT = Number(process.env.PORT) || 3939;
const HOST = '127.0.0.1';
const HOSTS_OK = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

function json(res, status, cuerpo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(cuerpo));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = '';
    req.on('data', (c) => {
      datos += c;
      if (datos.length > 20_000) { reject(new Error('Cuerpo demasiado grande.')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(datos ? JSON.parse(datos) : {}); } catch { reject(new Error('JSON inválido.')); }
    });
  });
}

const server = createServer(async (req, res) => {
  // Defensa contra DNS rebinding y formularios de otros sitios.
  if (!HOSTS_OK.has(req.headers.host ?? '')) return json(res, 403, { error: 'Host no permitido.' });
  const url = new URL(req.url, `http://${req.headers.host}`);
  const mutante = req.method !== 'GET';
  if (mutante && !String(req.headers['content-type'] ?? '').startsWith('application/json')) {
    return json(res, 415, { error: 'Se requiere application/json.' });
  }

  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(readFileSync(join(DIR, 'public', 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/api/tasks') return json(res, 200, ordenar(leerTareas()));
    if (req.method === 'GET' && url.pathname === '/api/log') return json(res, 200, ultimasLineasLog(200));
    if (req.method === 'POST' && url.pathname === '/api/tasks') return json(res, 201, agregar(await leerCuerpo(req)));

    const m = url.pathname.match(/^\/api\/tasks\/([\w-]+)$/);
    if (m && req.method === 'PUT') return json(res, 200, editar(m[1], await leerCuerpo(req)));
    if (m && req.method === 'DELETE') { eliminar(m[1]); return json(res, 200, { ok: true }); }
    return json(res, 404, { error: 'No encontrado.' });
  } catch (e) {
    return json(res, e.message === 'Tarea no encontrada.' ? 404 : 400, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  log('SERVIDOR', `Dashboard en http://localhost:${PORT}`);
  console.log(`Dashboard de tareas: http://localhost:${PORT}`);
});
