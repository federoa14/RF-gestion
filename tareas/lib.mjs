// Lógica compartida por el servidor web y el CLI. Sin dependencias externas.
import { readFileSync, writeFileSync, renameSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export const DIR = dirname(fileURLToPath(import.meta.url));
export const TASKS_FILE = join(DIR, 'tasks.json');
export const LOG_FILE = join(DIR, 'tasks.log');

export const PRIORIDADES = { alta: 1, media: 2, baja: 3 };
export const ESTADOS = ['pendiente', 'completada', 'bloqueada'];

export function log(accion, mensaje) {
  const linea = `${new Date().toISOString()} [${accion}] ${String(mensaje).replace(/\s*\n\s*/g, ' ')}\n`;
  appendFileSync(LOG_FILE, linea);
}

export function leerTareas() {
  if (!existsSync(TASKS_FILE)) return [];
  return JSON.parse(readFileSync(TASKS_FILE, 'utf8'));
}

function guardar(tareas) {
  const tmp = TASKS_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(tareas, null, 2) + '\n');
  renameSync(tmp, TASKS_FILE);
}

export function ordenar(tareas) {
  return [...tareas].sort(
    (a, b) => PRIORIDADES[a.prioridad] - PRIORIDADES[b.prioridad] || a.creada.localeCompare(b.creada),
  );
}

export function pendientes() {
  return ordenar(leerTareas().filter((t) => t.estado === 'pendiente'));
}

function limpiar(datos, parcial = false) {
  const out = {};
  if (!parcial || datos.titulo !== undefined) {
    const titulo = String(datos.titulo ?? '').trim();
    if (!titulo || titulo.length > 200) throw new Error('El título es obligatorio (máx. 200 caracteres).');
    out.titulo = titulo;
  }
  if (!parcial || datos.descripcion !== undefined) {
    const d = String(datos.descripcion ?? '').trim();
    if (d.length > 5000) throw new Error('La descripción es demasiado larga (máx. 5000).');
    out.descripcion = d;
  }
  if (!parcial || datos.prioridad !== undefined) {
    const p = datos.prioridad ?? 'media';
    if (!(p in PRIORIDADES)) throw new Error('Prioridad inválida (alta, media o baja).');
    out.prioridad = p;
  }
  if (datos.estado !== undefined) {
    if (!ESTADOS.includes(datos.estado)) throw new Error('Estado inválido.');
    out.estado = datos.estado;
  }
  return out;
}

export function agregar(datos) {
  const t = {
    id: randomUUID().slice(0, 8),
    ...limpiar(datos),
    estado: 'pendiente',
    resultado: '',
    creada: new Date().toISOString(),
    completada: null,
  };
  guardar([...leerTareas(), t]);
  log('CREADA', `${t.id} (${t.prioridad}) ${t.titulo}`);
  return t;
}

export function editar(id, datos) {
  const tareas = leerTareas();
  const t = tareas.find((x) => x.id === id);
  if (!t) throw new Error('Tarea no encontrada.');
  Object.assign(t, limpiar(datos, true));
  if (t.estado === 'pendiente') {
    t.completada = null;
    t.resultado = '';
  }
  guardar(tareas);
  log('EDITADA', `${t.id} (${t.prioridad}, ${t.estado}) ${t.titulo}`);
  return t;
}

export function eliminar(id) {
  const tareas = leerTareas();
  const t = tareas.find((x) => x.id === id);
  if (!t) throw new Error('Tarea no encontrada.');
  guardar(tareas.filter((x) => x.id !== id));
  log('ELIMINADA', `${t.id} ${t.titulo}`);
}

function cerrar(id, estado, accion, texto) {
  const tareas = leerTareas();
  const t = tareas.find((x) => x.id === id);
  if (!t) throw new Error('Tarea no encontrada.');
  t.estado = estado;
  t.resultado = String(texto ?? '').trim();
  t.completada = new Date().toISOString();
  guardar(tareas);
  log(accion, `${t.id} ${t.titulo} — ${t.resultado}`);
  return t;
}

export const completar = (id, resumen) => cerrar(id, 'completada', 'COMPLETADA', resumen);
export const bloquear = (id, motivo) => cerrar(id, 'bloqueada', 'BLOQUEADA', motivo);

export function ultimasLineasLog(n = 200) {
  if (!existsSync(LOG_FILE)) return [];
  return readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).slice(-n);
}
