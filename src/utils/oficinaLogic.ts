// Lógica pura de la oficina virtual (sin red ni base de datos): se puede probar sola.
// Los datos de departamentos y rutinas vienen de tareas/departamentos.json y tareas/rutinas.json.

export type Estado = 'pendiente' | 'en_curso' | 'completada' | 'bloqueada';
export type Prioridad = 'alta' | 'media' | 'baja';
export const SIN_ASIGNAR = 'sin_asignar';
export const PRIORIDADES: Record<Prioridad, number> = { alta: 1, media: 2, baja: 3 };

export interface Escalada { persona: string; motivo: string; sugerencia: string }
export interface Tarea {
  id: string; titulo: string; descripcion: string; prioridad: Prioridad; estado: Estado;
  departamento: string; entregaA: string | null; origen: string; rutina: string | null; desde: string | null;
  entregado: boolean; resultado: string; escalada: Escalada | null;
  creada: string; iniciada: string | null; completada: string | null;
}
export interface Persona {
  nombre: string; cargo: string; bio: string; piel: string; pelo: string;
  estiloPelo: string; camisa: string; lentes: boolean;
}
export interface Protocolo {
  resuelveSola: string[]; derivaAActualizacion: string[]; escalaAlPresidente: string[]; formatoAviso: string;
}
export interface Depto {
  id: string; nombre: string; emoji: string; color: string; persona: Persona; mision: string;
  funciones: string[]; reglas: string[]; prohibido: string[]; recibeDe: string[]; entregaA: string[];
  protocolo?: Protocolo;
}
export interface Oficina {
  empresa: string; presidente: Persona; reglamento: string[]; departamentos: Depto[]; nombresReservados?: string[];
}
export interface Rutina {
  id: string; departamento: string; titulo: string; descripcion: string;
  cadenciaDias: number; prioridad: Prioridad; entregaA: string | null;
}
export interface Redes { pausada: boolean; limitePorDia: number; conectadas: string[] }
export interface DeptoVivo extends Depto {
  situacion: 'trabajando' | 'con_pendientes' | 'libre';
  ahora: Tarea | null; proxima: Tarea | null; ultimaHecha: Tarea | null;
  cuentas: Record<Estado, number>;
}
export interface OrdenEntrada {
  titulo?: string; descripcion?: string; prioridad?: string; departamento?: string | null; entregaA?: string | null;
}

export const nuevoId = (): string => globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8);
const nombreDepto = (o: Oficina, id: string) => o.departamentos.find((d) => d.id === id)?.nombre ?? 'Sin asignar';

export function ordenar(tareas: Tarea[]): Tarea[] {
  return [...tareas].sort((a, b) => PRIORIDADES[a.prioridad] - PRIORIDADES[b.prioridad] || a.creada.localeCompare(b.creada));
}

/** Valida y limpia una orden. Lanza Error con un mensaje en español si algo no está bien. */
export function validarOrden(o: Oficina, d: OrdenEntrada) {
  const titulo = String(d.titulo ?? '').trim();
  if (!titulo || titulo.length > 200) throw new Error('El título es obligatorio (máx. 200 caracteres).');
  const descripcion = String(d.descripcion ?? '').trim();
  if (descripcion.length > 5000) throw new Error('La descripción es demasiado larga (máx. 5000).');
  const prioridad = (d.prioridad ?? 'media') as Prioridad;
  if (!(prioridad in PRIORIDADES)) throw new Error('Prioridad inválida (alta, media o baja).');
  const ids = o.departamentos.map((x) => x.id);
  const departamento = d.departamento || SIN_ASIGNAR;
  if (departamento !== SIN_ASIGNAR && !ids.includes(departamento)) throw new Error('Departamento inválido.');
  const entregaA = d.entregaA || null;
  if (entregaA && !ids.includes(entregaA)) throw new Error('Departamento de entrega inválido.');
  if (entregaA && entregaA === departamento) throw new Error('No tiene sentido entregarse a sí mismo.');
  return { titulo, descripcion, prioridad, departamento, entregaA };
}

export function armarTarea(limpio: ReturnType<typeof validarOrden>, origen: string, extra: Partial<Tarea> = {}, ahora = new Date()): Tarea {
  return {
    id: nuevoId(), ...limpio, origen, rutina: null, desde: null, entregado: false, resultado: '', escalada: null,
    estado: 'pendiente', creada: ahora.toISOString(), iniciada: null, completada: null, ...extra,
  };
}

/** Trabajo en conjunto: una tarea compañera en cada departamento de apoyo. */
export function armarApoyos(o: Oficina, t: Tarea, apoyo: string[], ahora = new Date()): Tarea[] {
  const ids = o.departamentos.map((x) => x.id);
  const unicos = [...new Set(apoyo.filter(Boolean))];
  for (const a of unicos) if (!ids.includes(a)) throw new Error('Departamento de apoyo inválido.');
  return unicos.filter((a) => a !== t.departamento).map((a) => ({
    ...t, id: nuevoId(), departamento: a, entregaA: null, origen: 'apoyo', desde: t.id,
    titulo: `Apoyo a ${nombreDepto(o, t.departamento)}: ${t.titulo}`.slice(0, 200), creada: ahora.toISOString(),
  }));
}

/** Entrega entre departamentos: lo que Diseño termina le llega solo a Marketing (una sola vez). */
export function armarEntrega(o: Oficina, t: Tarea, ahora = new Date()): Tarea | null {
  if (!t.entregaA || t.entregado) return null;
  return {
    id: nuevoId(), titulo: `Recibido de ${nombreDepto(o, t.departamento)}: ${t.titulo}`.slice(0, 200),
    descripcion: `Entrega de ${nombreDepto(o, t.departamento)}.\nTarea original: ${t.titulo}\nResultado: ${t.resultado}`.slice(0, 5000),
    prioridad: t.prioridad, departamento: t.entregaA, entregaA: null, origen: 'entrega', rutina: null, desde: t.id,
    entregado: false, resultado: '', escalada: null, estado: 'pendiente', creada: ahora.toISOString(), iniciada: null, completada: null,
  };
}

/** Caso que Asistencia pasa al Presidente: queda bloqueado, esperándolo. No guarda teléfonos. */
export function armarEscalada(d: { persona?: string; motivo?: string; resumen?: string; sugerencia?: string }, ahora = new Date()): Tarea {
  const lim = (v: unknown, n: number, campo: string) => {
    const x = String(v ?? '').trim();
    if (x.length > n) throw new Error(`${campo} es demasiado largo (máx. ${n}).`);
    return x;
  };
  const persona = lim(d.persona, 80, 'La persona');
  const motivo = lim(d.motivo, 120, 'El motivo');
  if (!persona || !motivo) throw new Error('Hacen falta la persona (o comercio) y el motivo.');
  const resumen = lim(d.resumen, 2000, 'El resumen');
  const sugerencia = lim(d.sugerencia, 300, 'La sugerencia');
  const iso = ahora.toISOString();
  return {
    id: nuevoId(), titulo: `Para vos: ${persona} — ${motivo}`.slice(0, 200),
    descripcion: [resumen, `Contactate con ${persona}${sugerencia ? ` para ${sugerencia}` : ' para resolverlo'}.`].filter(Boolean).join('\n'),
    prioridad: 'alta', departamento: 'soporte', entregaA: null, origen: 'escalada', rutina: null, desde: null, entregado: false,
    escalada: { persona, motivo, sugerencia }, estado: 'bloqueada',
    resultado: `Esperando al Presidente: contactar a ${persona}${sugerencia ? ` para ${sugerencia}` : ''}.`,
    creada: iso, iniciada: null, completada: iso,
  };
}

/** Rutinas que ya tocan: una por rutina, sin duplicar mientras haya una abierta. */
export function rutinasDebidas(rutinas: Rutina[], tareas: Tarea[], ahora = new Date()): Tarea[] {
  const nuevas: Tarea[] = [];
  for (const r of rutinas) {
    const suyas = tareas.filter((t) => t.rutina === r.id);
    if (suyas.some((t) => t.estado === 'pendiente' || t.estado === 'en_curso')) continue;
    const ultima = suyas.map((t) => t.creada).sort().pop();
    if (ultima && ahora.getTime() - new Date(ultima).getTime() < r.cadenciaDias * 86_400_000) continue;
    nuevas.push({
      id: nuevoId(), titulo: r.titulo, descripcion: r.descripcion, prioridad: r.prioridad, departamento: r.departamento,
      entregaA: r.entregaA ?? null, origen: 'rutina', rutina: r.id, desde: null, entregado: false, resultado: '', escalada: null,
      estado: 'pendiente', creada: ahora.toISOString(), iniciada: null, completada: null,
    });
  }
  return nuevas;
}

/** Estado REAL de la oficina: «trabajando» solo si el departamento tiene una tarea en curso. */
export function estadoOficina(o: Oficina, tareas: Tarea[]): DeptoVivo[] {
  const porFecha = (c: 'iniciada' | 'completada') => (a: Tarea, b: Tarea) => (b[c] ?? '').localeCompare(a[c] ?? '');
  return o.departamentos.map((d) => {
    const mias = tareas.filter((t) => t.departamento === d.id);
    const enCurso = mias.filter((t) => t.estado === 'en_curso').sort(porFecha('iniciada'));
    const porHacer = ordenar(mias.filter((t) => t.estado === 'pendiente'));
    const hechas = mias.filter((t) => t.estado === 'completada').sort(porFecha('completada'));
    return {
      ...d,
      situacion: enCurso.length ? 'trabajando' : porHacer.length ? 'con_pendientes' : 'libre',
      ahora: enCurso[0] ?? null, proxima: porHacer[0] ?? null, ultimaHecha: hechas[0] ?? null,
      cuentas: {
        pendiente: porHacer.length, en_curso: enCurso.length, completada: hechas.length,
        bloqueada: mias.filter((t) => t.estado === 'bloqueada').length,
      },
    };
  });
}

/* ---------- avatar ---------- */
const hex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#888888');
export function shade(c: string, amt: number): string {
  const n = parseInt(hex(c).slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, v + amt));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}
export const colorSeguro = hex;

/** SVG de la persona. Todos los colores pasan por `hex()`, así que no se puede inyectar nada. */
export function avatarSvg(p: Persona): string {
  const sk = hex(p.piel), ha = hex(p.pelo), sh = hex(p.camisa), oscuro = shade(sk, -22);
  const pelos: Record<string, string> = {
    corto: `<path d="M35 55C32 30 48 24 61 24 76 24 88 32 85 55 80 44 74 38 60 38 48 38 40 44 35 55Z" fill="${ha}"/>`,
    largo: `<path d="M35 56C33 30 48 24 61 24 76 24 88 32 85 56 78 42 66 36 56 40 46 42 38 48 35 56Z" fill="${ha}"/>`,
    rapado: `<path d="M37 48C38 32 50 28 60 28 72 28 83 32 83 48 78 40 70 37 60 37 50 37 42 40 37 48Z" fill="${ha}" opacity=".55"/>`,
    rodete: `<circle cx="60" cy="17" r="9" fill="${ha}"/><path d="M35 55C32 30 48 24 61 24 76 24 88 32 85 55 80 44 74 38 60 38 48 38 40 44 35 55Z" fill="${ha}"/>`,
    rulos: [[40, 34], [52, 27], [66, 27], [80, 34], [36, 46], [84, 46], [60, 33]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="${ha}"/>`).join(''),
  };
  const atras = p.estiloPelo === 'largo' ? `<path d="M31 64C26 28 46 18 60 18 76 18 94 28 89 64L92 106 28 106Z" fill="${ha}"/>` : '';
  const lentes = p.lentes ? '<g fill="none" stroke="#1d1d1d" stroke-width="2"><circle cx="50" cy="58" r="7.5"/><circle cx="70" cy="58" r="7.5"/><path d="M57.5 58h5"/></g>' : '';
  return `<svg viewBox="0 0 120 120" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${atras}
    <path d="M14 122C14 96 34 90 60 90 86 90 106 96 106 122Z" fill="${sh}"/>
    <path d="M48 91 60 106 72 91Z" fill="${oscuro}"/>
    <rect x="51" y="76" width="18" height="18" rx="7" fill="${oscuro}"/>
    <circle cx="36" cy="60" r="5" fill="${sk}"/><circle cx="84" cy="60" r="5" fill="${sk}"/>
    <ellipse cx="60" cy="56" rx="24" ry="27" fill="${sk}"/>
    ${pelos[p.estiloPelo] || pelos.corto}
    <circle cx="50" cy="58" r="2.6" fill="#1b1b1b"/><circle cx="70" cy="58" r="2.6" fill="#1b1b1b"/>
    <path d="M44 49q6-3 11 0M65 49q6-3 11 0" stroke="${shade(ha, -10)}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    ${lentes}
    <path d="M52 70q8 7 16 0" stroke="#7a3b2e" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;
}
