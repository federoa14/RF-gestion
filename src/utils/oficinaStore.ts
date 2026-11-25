// Acceso a la base (Supabase) de la oficina virtual. Solo el superadmin puede leer y escribir:
// lo garantiza la política de seguridad por filas de supabase/oficina.sql.
import { getSupabaseClient } from './supabaseClient';
import {
  armarApoyos, armarEntrega, armarTarea, rutinasDebidas, validarOrden, ordenar,
  type Estado, type Oficina, type OrdenEntrada, type Redes, type Rutina, type Tarea,
} from './oficinaLogic';

export interface OficinaDatos { tareas: Tarea[]; redes: Redes; log: string[] }

/** Lo que usa la pantalla. Se puede reemplazar por una versión en memoria (pruebas y demostración). */
export interface OficinaStore {
  cargar(): Promise<OficinaDatos>;
  darOrden(o: OficinaOrden): Promise<void>;
  iniciar(id: string): Promise<void>;
  completar(id: string, resumen: string): Promise<void>;
  bloquear(id: string, motivo: string): Promise<void>;
  reabrir(id: string): Promise<void>;
  derivar(id: string, departamento: string): Promise<void>;
  eliminar(id: string): Promise<void>;
  ajustarRedes(cambios: { pausada?: boolean; limitePorDia?: number }): Promise<void>;
  generarRutinas(): Promise<number>;
}
export type OficinaOrden = OrdenEntrada & { apoyo?: string[] };

const fromRow = (r: any): Tarea => ({
  id: r.id, titulo: r.titulo, descripcion: r.descripcion ?? '', prioridad: r.prioridad, estado: r.estado,
  departamento: r.departamento, entregaA: r.entrega_a, origen: r.origen, rutina: r.rutina, desde: r.desde,
  entregado: Boolean(r.entregado), resultado: r.resultado ?? '', escalada: r.escalada ?? null,
  creada: r.creada, iniciada: r.iniciada, completada: r.completada,
});
const toRow = (t: Tarea) => ({
  id: t.id, titulo: t.titulo, descripcion: t.descripcion, prioridad: t.prioridad, estado: t.estado,
  departamento: t.departamento, entrega_a: t.entregaA, origen: t.origen, rutina: t.rutina, desde: t.desde,
  entregado: t.entregado, resultado: t.resultado, escalada: t.escalada, creada: t.creada,
  iniciada: t.iniciada, completada: t.completada,
});

export function crearStoreSupabase(oficina: Oficina, rutinas: Rutina[]): OficinaStore {
  const db = () => {
    const c = getSupabaseClient();
    if (!c) throw new Error('No hay conexión con la base de datos.');
    return c;
  };
  const check = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
  const nota = async (accion: string, mensaje: string) => {
    await db().from('oficina_log').insert({ accion, mensaje: mensaje.replace(/\s*\n\s*/g, ' ').slice(0, 1000) });
  };
  const una = async (id: string): Promise<Tarea> => {
    const { data, error } = await db().from('oficina_tareas').select('*').eq('id', id).single();
    check(error);
    return fromRow(data);
  };
  const nombre = (id: string) => oficina.departamentos.find((d) => d.id === id)?.nombre ?? 'Sin asignar';
  const cambiar = async (id: string, campos: Record<string, unknown>) => {
    const { error } = await db().from('oficina_tareas').update(campos).eq('id', id);
    check(error);
  };

  return {
    async cargar() {
      const [t, r, l] = await Promise.all([
        db().from('oficina_tareas').select('*').order('creada', { ascending: true }),
        db().from('oficina_redes').select('*').eq('id', 1).maybeSingle(),
        db().from('oficina_log').select('ts,accion,mensaje').order('id', { ascending: false }).limit(200),
      ]);
      check(t.error); check(r.error); check(l.error);
      return {
        tareas: ordenar((t.data ?? []).map(fromRow)),
        redes: {
          pausada: Boolean(r.data?.pausada), limitePorDia: r.data?.limite_por_dia ?? 2,
          conectadas: Array.isArray(r.data?.conectadas) ? r.data.conectadas : [],
        },
        log: (l.data ?? []).reverse().map((x: any) => `${x.ts} [${x.accion}] ${x.mensaje}`),
      };
    },
    async darOrden(orden) {
      const t = armarTarea(validarOrden(oficina, orden), 'oficina');
      const apoyos = armarApoyos(oficina, t, orden.apoyo ?? []);
      const { error } = await db().from('oficina_tareas').insert([t, ...apoyos].map(toRow));
      check(error);
      await nota('CREADA', `${t.id} [${t.departamento}] (${t.prioridad}) ${t.titulo}`);
      for (const a of apoyos) await nota('APOYO', `${nombre(a.departamento)} apoya a ${nombre(t.departamento)}: ${a.id}`);
    },
    async iniciar(id) {
      const t = await una(id);
      if (t.estado === 'completada') throw new Error('La tarea ya está hecha; reabrila primero.');
      await cambiar(id, { estado: 'en_curso', iniciada: new Date().toISOString(), completada: null, resultado: '' });
      await nota('INICIADA', `${id} [${t.departamento}] ${t.titulo}`);
    },
    async completar(id, resumen) {
      const t = await una(id);
      const resultado = resumen.trim() || 'Marcada como hecha por Federico Roa.';
      const cerrada = { ...t, estado: 'completada' as Estado, resultado, completada: new Date().toISOString() };
      const entrega = armarEntrega(oficina, cerrada);
      await cambiar(id, { estado: 'completada', resultado, completada: cerrada.completada, entregado: entrega ? true : t.entregado });
      if (entrega) {
        const { error } = await db().from('oficina_tareas').insert(toRow(entrega));
        check(error);
      }
      await nota('COMPLETADA', `${id} [${t.departamento}] ${t.titulo} — ${resultado}`);
      if (entrega) await nota('ENTREGA', `${nombre(t.departamento)} → ${nombre(entrega.departamento)}: ${entrega.id} ${t.titulo}`);
    },
    async bloquear(id, motivo) {
      const t = await una(id);
      const resultado = motivo.trim() || 'Bloqueada por Federico Roa.';
      await cambiar(id, { estado: 'bloqueada', resultado, completada: new Date().toISOString() });
      await nota('BLOQUEADA', `${id} [${t.departamento}] ${t.titulo} — ${resultado}`);
    },
    async reabrir(id) {
      const t = await una(id);
      await cambiar(id, { estado: 'pendiente', iniciada: null, completada: null, resultado: '' });
      await nota('EDITADA', `${id} [${t.departamento}] (${t.prioridad}, pendiente) ${t.titulo}`);
    },
    async derivar(id, departamento) {
      const t = await una(id);
      const limpio = validarOrden(oficina, { ...t, departamento, entregaA: t.entregaA === departamento ? null : t.entregaA });
      await cambiar(id, { departamento: limpio.departamento, entrega_a: limpio.entregaA });
      await nota('EDITADA', `${id} [${limpio.departamento}] ${t.titulo}`);
    },
    async eliminar(id) {
      const t = await una(id);
      const { error } = await db().from('oficina_tareas').delete().eq('id', id);
      check(error);
      await nota('ELIMINADA', `${id} ${t.titulo}`);
    },
    async ajustarRedes(cambios) {
      const campos: Record<string, unknown> = {};
      if (cambios.pausada !== undefined) campos.pausada = Boolean(cambios.pausada);
      if (cambios.limitePorDia !== undefined) {
        const n = Number(cambios.limitePorDia);
        if (!Number.isInteger(n) || n < 0 || n > 20) throw new Error('El límite diario debe ser un entero entre 0 y 20.');
        campos.limite_por_dia = n;
      }
      const { error } = await db().from('oficina_redes').update(campos).eq('id', 1);
      check(error);
      await nota('REDES', JSON.stringify(campos));
    },
    async generarRutinas() {
      const { data, error } = await db().from('oficina_tareas').select('*').not('rutina', 'is', null);
      check(error);
      const nuevas = rutinasDebidas(rutinas, (data ?? []).map(fromRow));
      if (!nuevas.length) return 0;
      const { error: e2 } = await db().from('oficina_tareas').insert(nuevas.map(toRow));
      check(e2);
      for (const t of nuevas) await nota('RUTINA', `${t.id} [${t.departamento}] ${t.titulo}`);
      return nuevas.length;
    },
  };
}
