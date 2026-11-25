// Lógica compartida por el servidor web y el CLI. Sin dependencias externas.
import { readFileSync, writeFileSync, renameSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export const DIR = dirname(fileURLToPath(import.meta.url));
// TAREAS_DATA permite apuntar los datos a otra carpeta (pruebas).
const DATA = process.env.TAREAS_DATA || DIR;
export const TASKS_FILE = join(DATA, 'tasks.json');
export const LOG_FILE = join(DATA, 'tasks.log');
export const OFICINA_FILE = join(DIR, 'departamentos.json');

export const PRIORIDADES = { alta: 1, media: 2, baja: 3 };
export const ESTADOS = ['pendiente', 'en_curso', 'completada', 'bloqueada'];
export const SIN_ASIGNAR = 'sin_asignar';

export function leerOficina() {
  return JSON.parse(readFileSync(OFICINA_FILE, 'utf8'));
}
const idsDepartamento = () => leerOficina().departamentos.map((d) => d.id);
const nombreDepto = (id) => leerOficina().departamentos.find((d) => d.id === id)?.nombre ?? 'Sin asignar';

export function log(accion, mensaje) {
  const linea = `${new Date().toISOString()} [${accion}] ${String(mensaje).replace(/\s*\n\s*/g, ' ')}\n`;
  appendFileSync(LOG_FILE, linea);
}

export function leerTareas() {
  if (!existsSync(TASKS_FILE)) return [];
  // Las tareas viejas (sin departamento) quedan «sin asignar».
  return JSON.parse(readFileSync(TASKS_FILE, 'utf8')).map((t) => ({
    departamento: SIN_ASIGNAR, entregaA: null, origen: 'presidente', iniciada: null, ...t,
  }));
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
  if (!parcial || datos.departamento !== undefined) {
    const dep = datos.departamento || SIN_ASIGNAR;
    if (dep !== SIN_ASIGNAR && !idsDepartamento().includes(dep)) throw new Error('Departamento inválido.');
    out.departamento = dep;
  }
  if (datos.entregaA !== undefined) {
    const e = datos.entregaA || null;
    if (e && !idsDepartamento().includes(e)) throw new Error('Departamento de entrega inválido.');
    out.entregaA = e;
  }
  return out;
}

export function agregar(datos, origen = 'presidente') {
  const limpio = limpiar(datos);
  if (limpio.entregaA && limpio.entregaA === limpio.departamento) throw new Error('No tiene sentido entregarse a sí mismo.');
  const t = {
    id: randomUUID().slice(0, 8),
    ...limpio,
    entregaA: limpio.entregaA ?? null,
    origen,
    estado: 'pendiente',
    resultado: '',
    creada: new Date().toISOString(),
    iniciada: null,
    completada: null,
  };
  guardar([...leerTareas(), t]);
  log('CREADA', `${t.id} [${t.departamento}] (${t.prioridad}) ${t.titulo}`);
  return t;
}

export function editar(id, datos) {
  const tareas = leerTareas();
  const t = tareas.find((x) => x.id === id);
  if (!t) throw new Error('Tarea no encontrada.');
  Object.assign(t, limpiar(datos, true));
  if (t.entregaA && t.entregaA === t.departamento) t.entregaA = null;
  if (t.estado === 'pendiente') {
    t.iniciada = null;
    t.completada = null;
    t.resultado = '';
  } else if (t.estado === 'en_curso') {
    t.iniciada = t.iniciada ?? new Date().toISOString();
    t.completada = null;
    t.resultado = '';
  }
  guardar(tareas);
  log('EDITADA', `${t.id} [${t.departamento}] (${t.prioridad}, ${t.estado}) ${t.titulo}`);
  return t;
}

export function eliminar(id) {
  const tareas = leerTareas();
  const t = tareas.find((x) => x.id === id);
  if (!t) throw new Error('Tarea no encontrada.');
  guardar(tareas.filter((x) => x.id !== id));
  log('ELIMINADA', `${t.id} ${t.titulo}`);
}

/** Un departamento toma la tarea: pasa a «En curso». */
export function iniciar(id) {
  const tareas = leerTareas();
  const t = tareas.find((x) => x.id === id);
  if (!t) throw new Error('Tarea no encontrada.');
  if (t.estado === 'completada') throw new Error('La tarea ya está hecha; reabrila primero.');
  t.estado = 'en_curso';
  t.iniciada = new Date().toISOString();
  t.completada = null;
  t.resultado = '';
  guardar(tareas);
  log('INICIADA', `${t.id} [${t.departamento}] ${t.titulo}`);
  return t;
}

function cerrar(id, estado, accion, texto) {
  const tareas = leerTareas();
  const t = tareas.find((x) => x.id === id);
  if (!t) throw new Error('Tarea no encontrada.');
  t.estado = estado;
  t.resultado = String(texto ?? '').trim();
  t.completada = new Date().toISOString();
  let entrega = null;
  // Entrega entre departamentos: lo que Diseño termina le llega solo a Marketing.
  if (estado === 'completada' && t.entregaA && !t.entregado) {
    t.entregado = true;
    entrega = {
      id: randomUUID().slice(0, 8),
      titulo: `Recibido de ${nombreDepto(t.departamento)}: ${t.titulo}`.slice(0, 200),
      descripcion: `Entrega de ${nombreDepto(t.departamento)}.\nTarea original: ${t.titulo}\nResultado: ${t.resultado}`.slice(0, 5000),
      prioridad: t.prioridad,
      departamento: t.entregaA,
      entregaA: null,
      origen: 'entrega',
      desde: t.id,
      estado: 'pendiente',
      resultado: '',
      creada: new Date().toISOString(),
      iniciada: null,
      completada: null,
    };
    tareas.push(entrega);
  }
  guardar(tareas);
  log(accion, `${t.id} [${t.departamento}] ${t.titulo} — ${t.resultado}`);
  if (entrega) log('ENTREGA', `${nombreDepto(t.departamento)} → ${nombreDepto(entrega.departamento)}: ${entrega.id} ${t.titulo}`);
  return t;
}

export const completar = (id, resumen) => cerrar(id, 'completada', 'COMPLETADA', resumen);
export const bloquear = (id, motivo) => cerrar(id, 'bloqueada', 'BLOQUEADA', motivo);

export function ultimasLineasLog(n = 200) {
  if (!existsSync(LOG_FILE)) return [];
  return readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).slice(-n);
}

/**
 * Lo que se ve en la oficina. Es el estado REAL de la pizarra:
 * «trabajando» solo si el departamento tiene una tarea en curso.
 */
export function estadoOficina() {
  const oficina = leerOficina();
  const tareas = leerTareas();
  const porFecha = (campo) => (a, b) => (b[campo] ?? '').localeCompare(a[campo] ?? '');
  const departamentos = oficina.departamentos.map((d) => {
    const mias = tareas.filter((t) => t.departamento === d.id);
    const enCurso = mias.filter((t) => t.estado === 'en_curso').sort(porFecha('iniciada'));
    const porHacer = ordenar(mias.filter((t) => t.estado === 'pendiente'));
    const hechas = mias.filter((t) => t.estado === 'completada').sort(porFecha('completada'));
    return {
      ...d,
      situacion: enCurso.length ? 'trabajando' : porHacer.length ? 'con_pendientes' : 'libre',
      ahora: enCurso[0] ?? null,
      proxima: porHacer[0] ?? null,
      ultimaHecha: hechas[0] ?? null,
      cuentas: {
        pendiente: porHacer.length,
        en_curso: enCurso.length,
        completada: hechas.length,
        bloqueada: mias.filter((t) => t.estado === 'bloqueada').length,
      },
    };
  });
  return {
    empresa: oficina.empresa,
    presidente: oficina.presidente,
    reglamento: oficina.reglamento,
    departamentos,
    sinAsignar: tareas.filter((t) => t.departamento === SIN_ASIGNAR && t.estado === 'pendiente').length,
    tareas: ordenar(tareas),
  };
}
