import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import oficinaJson from '../../tareas/departamentos.json';
import rutinasJson from '../../tareas/rutinas.json';
import './oficina.css';
import {
  SIN_ASIGNAR, avatarSvg, colorSeguro, estadoOficina,
  type DeptoVivo, type Estado, type Oficina, type Persona, type Rutina, type Tarea,
} from '../utils/oficinaLogic';
import { crearStoreSupabase, type OficinaDatos, type OficinaOrden, type OficinaStore } from '../utils/oficinaStore';

const OFICINA = oficinaJson as unknown as Oficina;
const RUTINAS = rutinasJson as unknown as Rutina[];

const COLUMNAS: [Estado, string][] = [
  ['pendiente', 'Por hacer'], ['en_curso', 'En curso'], ['completada', 'Hecho'], ['bloqueada', 'Bloqueadas / esperan al Presidente'],
];
const PRIO_ETQ: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };
type Abierto = { tipo: 'depto'; id: string } | { tipo: 'presidente' } | null;

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.');
const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
function hace(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

const Persona_: React.FC<{ p: Persona; style?: React.CSSProperties }> = ({ p, style }) => (
  <div className="persona" style={style} dangerouslySetInnerHTML={{ __html: avatarSvg(p) }} />
);

const burbuja = (d: DeptoVivo) =>
  d.ahora ? `🛠 ${d.ahora.titulo}` : d.proxima ? `⏳ Por empezar: ${d.proxima.titulo}` : '💤 Libre, esperando órdenes';

/* ---------- formulario de orden ---------- */
const FormOrden: React.FC<{
  oficina: Oficina; deptoFijo?: string; entregas: string[]; onEnviar: (o: OficinaOrden) => Promise<void>;
}> = ({ oficina, deptoFijo, entregas, onEnviar }) => {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState('media');
  const [depto, setDepto] = useState('');
  const [entrega, setEntrega] = useState('');
  const [apoyo, setApoyo] = useState('');
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const destino = deptoFijo ?? depto;
  const dest = oficina.departamentos.find((d) => d.id === destino);
  const posiblesEntregas = deptoFijo ? entregas : (dest ? dest.entregaA : oficina.departamentos.map((d) => d.id));
  return (
    <form
      className="orden"
      onSubmit={async (e) => {
        e.preventDefault(); setErr(''); setOk('');
        try {
          await onEnviar({ titulo, descripcion, prioridad, departamento: destino, entregaA: entrega, apoyo: apoyo ? [apoyo] : [] });
          setTitulo(''); setDescripcion(''); setOk('✔ Orden dada. Aparece en la pizarra.');
        } catch (x) { setErr(msg(x)); }
      }}
    >
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} required
        placeholder={deptoFijo ? '¿Qué querés que haga?' : 'Orden general…'} />
      <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalles o instrucciones (opcional)" />
      <div className="fila">
        {!deptoFijo && (
          <select value={depto} onChange={(e) => { setDepto(e.target.value); setEntrega(''); }} aria-label="Departamento">
            <option value="">Sin asignar (que lo derive Claude)</option>
            {oficina.departamentos.map((d) => <option key={d.id} value={d.id}>{d.emoji} {d.nombre}</option>)}
          </select>
        )}
        <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} aria-label="Prioridad">
          {Object.entries(PRIO_ETQ).map(([v, n]) => <option key={v} value={v}>Prioridad {n.toLowerCase()}</option>)}
        </select>
        <select value={entrega} onChange={(e) => setEntrega(e.target.value)} aria-label="Entregar el resultado a">
          <option value="">No entregar a nadie</option>
          {oficina.departamentos.filter((d) => posiblesEntregas.includes(d.id) && d.id !== destino).map((d) => (
            <option key={d.id} value={d.id}>Entregar a {d.nombre}</option>
          ))}
        </select>
        <select value={apoyo} onChange={(e) => setApoyo(e.target.value)} aria-label="Pedir apoyo a otro departamento">
          <option value="">Sin apoyo de otros</option>
          {oficina.departamentos.filter((d) => d.id !== destino).map((d) => (
            <option key={d.id} value={d.id}>Pedir apoyo a {d.nombre}</option>
          ))}
        </select>
      </div>
      <button className="btn primario" type="submit">Dar la orden</button>
      <div className="ok" role="status">{ok}</div>
      <div className="error" role="alert">{err}</div>
    </form>
  );
};

const Lista: React.FC<{ items: string[]; no?: boolean }> = ({ items, no }) => (
  <ul className={`lista${no ? ' no' : ''}`}>{items.map((x) => <li key={x}>{x}</li>)}</ul>
);

/* ---------- componente principal ---------- */
export const OficinaVirtual: React.FC<{ store?: OficinaStore; oficina?: Oficina; rutinas?: Rutina[] }> = ({
  oficina = OFICINA, rutinas = RUTINAS, store: storeProp,
}) => {
  const store = useMemo(() => storeProp ?? crearStoreSupabase(oficina, rutinas), [storeProp, oficina, rutinas]);
  const [datos, setDatos] = useState<OficinaDatos | null>(null);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [rapida, setRapida] = useState({ titulo: '', depto: '', prio: 'media' });
  const [sobre, setSobre] = useState<Estado | null>(null);
  const arrastrando = useRef(false);

  const cargar = useCallback(async () => {
    try { setDatos(await store.cargar()); setError(''); } catch (e) { setError(msg(e)); }
  }, [store]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try { await store.generarRutinas(); } catch { /* si falla, igual se carga lo que hay */ }
      if (vivo) await cargar();
    })();
    const t = setInterval(() => { if (!arrastrando.current && !document.hidden) void cargar(); }, 8000);
    return () => { vivo = false; clearInterval(t); };
  }, [store, cargar]);

  const actuar = useCallback(async (fn: () => Promise<unknown>) => {
    try { await fn(); setError(''); await cargar(); } catch (e) { setError(msg(e)); }
  }, [cargar]);

  const vivos = useMemo(() => (datos ? estadoOficina(oficina, datos.tareas) : []), [datos, oficina]);
  const deptoDe = (id: string) => oficina.departamentos.find((d) => d.id === id);

  useEffect(() => {
    if (!abierto) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(null); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [abierto]);

  if (!datos) {
    return (
      <div className="oficina-root">
        <div className="vacio" role="status">{error || 'Abriendo la oficina…'}</div>
      </div>
    );
  }

  const tareas = datos.tareas;
  const bloqueadas = tareas.filter((t) => t.estado === 'bloqueada');
  const sinAsignar = tareas.filter((t) => t.departamento === SIN_ASIGNAR && t.estado === 'pendiente').length;
  const cuenta = (e: Estado) => tareas.filter((t) => t.estado === e).length;

  const cerrarTarea = async (t: Tarea, tipo: 'completar' | 'bloquear') => {
    const txt = window.prompt(tipo === 'completar' ? 'Resumen de lo que se hizo (opcional):' : 'Motivo del bloqueo:', '');
    if (txt === null) return;
    await actuar(() => (tipo === 'completar' ? store.completar(t.id, txt) : store.bloquear(t.id, txt)));
  };

  const darOrden = async (o: OficinaOrden) => { await store.darOrden(o); await cargar(); };

  /* ----- tarjeta de la pizarra ----- */
  const tarjeta = (t: Tarea) => {
    const d = deptoDe(t.departamento);
    return (
      <li key={t.id} className={`tarjeta ${t.estado}`} draggable style={{ '--c': d ? colorSeguro(d.color) : '#8a93a5' } as React.CSSProperties}
        onDragStart={(e) => { arrastrando.current = true; e.dataTransfer.setData('text/plain', t.id); }}
        onDragEnd={() => { arrastrando.current = false; }}>
        <div className="pill">{d ? `${d.emoji} ${d.nombre}` : '❔ Sin asignar'}</div>
        <div className="tit"><i className={`prio ${t.prioridad}`} title={`Prioridad ${PRIO_ETQ[t.prioridad]}`} />{t.titulo}</div>
        {t.descripcion && <p>{recortar(t.descripcion, 220)}</p>}
        {t.entregaA && <div className="entrega">{t.entregado ? '↪ entregado a' : '↪ al terminar se entrega a'} {deptoDe(t.entregaA)?.nombre}</div>}
        {t.resultado && <p className="res">{t.estado === 'bloqueada' ? 'Motivo' : 'Resultado'}: {t.resultado}</p>}
        <div className="acc">
          {t.estado === 'pendiente' && <button type="button" className="btn mini" onClick={() => actuar(() => store.iniciar(t.id))}>▶ Tomar</button>}
          {(t.estado === 'pendiente' || t.estado === 'en_curso') && <button type="button" className="btn mini" onClick={() => cerrarTarea(t, 'completar')}>✔ Hecha</button>}
          {t.estado === 'en_curso' && <button type="button" className="btn mini" onClick={() => cerrarTarea(t, 'bloquear')}>✋ Bloquear</button>}
          {t.estado === 'en_curso' && <button type="button" className="btn mini" onClick={() => actuar(() => store.reabrir(t.id))}>↩ A por hacer</button>}
          {(t.estado === 'completada' || t.estado === 'bloqueada') && <button type="button" className="btn mini" onClick={() => actuar(() => store.reabrir(t.id))}>↩ Reabrir</button>}
          {t.estado !== 'completada' && (
            <select value="" aria-label="Derivar a otro departamento" onChange={(e) => e.target.value && actuar(() => store.derivar(t.id, e.target.value))}>
              <option value="">Derivar a…</option>
              {oficina.departamentos.filter((x) => x.id !== t.departamento).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          )}
          <button type="button" className="btn mini peligro" aria-label="Eliminar tarea"
            onClick={() => { if (window.confirm(`¿Eliminar "${t.titulo}"?`)) void actuar(() => store.eliminar(t.id)); }}>🗑</button>
        </div>
      </li>
    );
  };

  const soltar = (e: React.DragEvent, estado: Estado) => {
    e.preventDefault(); setSobre(null); arrastrando.current = false;
    const t = tareas.find((x) => x.id === e.dataTransfer.getData('text/plain'));
    if (!t || t.estado === estado) return;
    void actuar(() => (estado === 'en_curso' ? store.iniciar(t.id) : estado === 'completada' ? store.completar(t.id, '')
      : estado === 'bloqueada' ? store.bloquear(t.id, '') : store.reabrir(t.id)));
  };

  /* ----- panel lateral ----- */
  const bloqueRedes = () => (
    <div className="dialogo">
      <p><b>{datos.redes.pausada ? '⏸ Redes en pausa: nadie publica.' : '✅ Marketing tiene libertad para publicar (dentro de las barreras).'}</b></p>
      <p className="aviso">
        Límite: {datos.redes.limitePorDia} posteos por día. Cuentas conectadas:{' '}
        {datos.redes.conectadas.length ? datos.redes.conectadas.join(', ') : 'ninguna todavía (hay que conectarlas para poder publicar de verdad)'}.
      </p>
      <button type="button" className={`btn mini ${datos.redes.pausada ? 'primario' : 'peligro'}`}
        onClick={() => actuar(() => store.ajustarRedes({ pausada: !datos.redes.pausada }))}>
        {datos.redes.pausada ? '▶ Reanudar redes' : '⏸ Pausar todas las redes'}
      </button>
    </div>
  );

  const listaTareasPanel = (items: Tarea[]) => items.length === 0
    ? <div className="vacio">Sin tareas todavía.</div>
    : (
      <ul className="lista" style={{ gap: 8 }}>
        {items.map((t) => (
          <li key={t.id} style={{ paddingLeft: 0 }}>
            <div style={t.estado === 'completada' ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>
              {{ pendiente: '⏳', en_curso: '🛠', completada: '✔', bloqueada: '✋' }[t.estado]} <b>{t.titulo}</b>
            </div>
            {t.resultado && <div className="aviso">{t.resultado}</div>}
          </li>
        ))}
      </ul>
    );

  const renderPanel = () => {
    if (!abierto) return null;
    if (abierto.tipo === 'presidente') {
      const p = oficina.presidente;
      return (
        <>
          <div className="cab" style={{ '--c': '#d4af37' } as React.CSSProperties}>
            <Persona_ p={p} />
            <div><h2 id="panel-titulo">{p.nombre}</h2><small>{p.cargo} de {oficina.empresa}</small></div>
            <button type="button" className="cerrar" onClick={() => setAbierto(null)} aria-label="Cerrar">✕</button>
          </div>
          <div className="cuerpo">
            <section><h3>Interruptor de redes</h3>{bloqueRedes()}</section>
            <section>
              <h3>Orden general</h3>
              <FormOrden oficina={oficina} entregas={[]} onEnviar={darOrden} />
              <p className="aviso">Si no elegís departamento, la orden queda «sin asignar» y Claude la deriva al que corresponda. También podés pedírselo a Claude en el chat: la pizarra es la misma.</p>
            </section>
            <section>
              <h3>Esperan tu decisión</h3>
              {bloqueadas.length === 0 ? <div className="vacio">Nada espera tu decisión. 👌</div> : (
                <ul className="lista" style={{ gap: 10 }}>
                  {bloqueadas.map((t) => (
                    <li key={t.id} style={{ paddingLeft: 0 }}>
                      <div>✋ <b>{t.titulo}</b></div>
                      {t.descripcion && <div className="aviso" style={{ whiteSpace: 'pre-wrap' }}>{t.descripcion}</div>}
                      {t.resultado && <div className="aviso">{t.resultado}</div>}
                      <div className="acc">
                        <button type="button" className="btn mini primario" onClick={() => actuar(() => store.completar(t.id, 'Resuelto por Federico Roa.'))}>✔ Lo resolví</button>
                        <button type="button" className="btn mini" onClick={() => actuar(() => store.reabrir(t.id))}>↩ Devolver al departamento</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section><h3>Reglamento de la oficina</h3><Lista items={oficina.reglamento} /></section>
          </div>
        </>
      );
    }
    const id = abierto.id;
    const d = vivos.find((x) => x.id === id);
    if (!d) return null;
    const suyas = tareas.filter((t) => t.departamento === id);
    const items = [...suyas.filter((t) => t.estado !== 'completada'), ...suyas.filter((t) => t.estado === 'completada').slice(-8)];
    const nombres = (ids: string[]) => ids.map((x) => deptoDe(x)?.nombre).filter(Boolean).join(', ') || '—';
    return (
      <>
        <div className="cab" style={{ '--c': colorSeguro(d.color) } as React.CSSProperties}>
          <Persona_ p={d.persona} />
          <div><h2 id="panel-titulo">{d.persona.nombre}</h2><small>{d.persona.cargo} · {d.nombre}</small></div>
          <button type="button" className="cerrar" onClick={() => setAbierto(null)} aria-label="Cerrar">✕</button>
        </div>
        <div className="cuerpo">
          <section>
            <h3>Qué está haciendo</h3>
            <div className="dialogo" aria-live="polite">
              {d.ahora
                ? <p>Ahora estoy con: <q>{d.ahora.titulo}</q> (desde {hace(d.ahora.iniciada ?? d.ahora.creada)}).</p>
                : d.proxima
                  ? <p>Todavía no arranqué. Lo próximo que tengo es: <q>{d.proxima.titulo}</q>.</p>
                  : <p>No tengo nada pendiente. ¿Qué necesitás, Federico?</p>}
              {d.ahora && d.cuentas.pendiente > 0 && <p>Después me quedan {d.cuentas.pendiente} por hacer.</p>}
              {d.ultimaHecha && <p>Lo último que terminé: <q>{d.ultimaHecha.titulo}</q>{d.ultimaHecha.resultado ? ` — ${d.ultimaHecha.resultado}` : ''} ({hace(d.ultimaHecha.completada ?? d.ultimaHecha.creada)}).</p>}
            </div>
          </section>
          {id === 'marketing' && <section><h3>Redes sociales</h3>{bloqueRedes()}</section>}
          <section><h3>Darle una orden</h3><FormOrden oficina={oficina} deptoFijo={id} entregas={d.entregaA} onEnviar={darOrden} /></section>
          <section><h3>Sus tareas</h3>{listaTareasPanel(items)}</section>
          <section><h3>Quién es</h3><p className="aviso" style={{ margin: 0 }}>{d.persona.bio}</p></section>
          <section><h3>Misión</h3><p style={{ margin: 0 }}>{d.mision}</p></section>
          <section><h3>Sus funciones</h3><Lista items={d.funciones} /></section>
          <section><h3>Reglas que cumple</h3><Lista items={d.reglas} /></section>
          <section><h3>Lo que tiene prohibido</h3><Lista items={d.prohibido} no /></section>
          {d.protocolo && (
            <section>
              <h3>Protocolo de filtro</h3>
              <p className="aviso" style={{ margin: '0 0 4px' }}>Resuelve solo:</p><Lista items={d.protocolo.resuelveSola} />
              <p className="aviso" style={{ margin: '8px 0 4px' }}>Pasa a Actualización:</p><Lista items={d.protocolo.derivaAActualizacion} />
              <p className="aviso" style={{ margin: '8px 0 4px' }}>Te escala a vos:</p><Lista items={d.protocolo.escalaAlPresidente} />
              <p className="aviso" style={{ margin: '8px 0 0' }}>Cómo te avisa: {d.protocolo.formatoAviso}</p>
            </section>
          )}
          {id === 'soporte' && (
            <section>
              <h3>WhatsApp de asistencia</h3>
              <div className="dialogo"><p className="aviso">
                {datos.redes.conectadas.includes('whatsapp-asistencia')
                  ? '✅ Conectado: recibe y responde mensajes de clientes.'
                  : 'Sin conectar todavía. Hoy el sistema solo envía WhatsApp (alertas); falta que reciba mensajes de clientes. Mientras tanto, los casos que le pasen se cargan acá y se filtran igual.'}
              </p></div>
            </section>
          )}
          <section>
            <h3>Trabaja con</h3>
            <p className="aviso" style={{ margin: 0 }}>Recibe pedidos de: {nombres(d.recibeDe)}. Entrega a: {nombres(d.entregaA)}.</p>
          </section>
        </div>
      </>
    );
  };

  const visibles = tareas.filter((t) => filtro === 'todos' || t.departamento === filtro);
  const filtros: [string, string][] = [['todos', 'Todos'], ...oficina.departamentos.map((d): [string, string] => [d.id, `${d.emoji} ${d.nombre}`]), [SIN_ASIGNAR, 'Sin asignar']];

  return (
    <div className="oficina-root">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>🏢 {oficina.empresa} · Oficina virtual</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 13 }}>Presidente: <b>{oficina.presidente.nombre}</b> · tocá un escritorio para hablar con el departamento</p>
        </div>
        <div className="resumen" aria-live="polite">
          <span className="chip"><b>{cuenta('pendiente')}</b> por hacer</span>
          <span className="chip"><b>{cuenta('en_curso')}</b> en curso</span>
          <span className="chip"><b>{cuenta('completada')}</b> hechas</span>
          {sinAsignar > 0 && <span className="chip">⚠ {sinAsignar} sin asignar</span>}
          {bloqueadas.length > 0 && <span className="chip">✋ {bloqueadas.length} te esperan</span>}
        </div>
      </header>

      <section className="oficina" aria-label="Oficina">
        <div className="piso">
          <button className="presidencia" type="button" onClick={() => setAbierto({ tipo: 'presidente' })} aria-label="Despacho del presidente">
            <span className="rotulo">Presidencia</span>
            <Persona_ p={oficina.presidente} style={{ width: 96, height: 96 }} />
            <div>
              <h3>{oficina.presidente.nombre}</h3>
              <div className="cargo">{oficina.presidente.cargo} de {oficina.empresa}</div>
              <div className="hint">Tocá para dar una orden general o revisar lo que espera tu decisión →</div>
            </div>
          </button>
          <div className="escritorios">
            {vivos.map((d) => (
              <button key={d.id} type="button" className={`desk ${d.situacion}`} data-id={d.id} style={{ '--c': colorSeguro(d.color) } as React.CSSProperties}
                onClick={() => setAbierto({ tipo: 'depto', id: d.id })} aria-label={`${d.nombre}: ${d.persona.nombre}. ${burbuja(d)}`}>
                <div className="burbuja"><span>{burbuja(d)}</span></div>
                <div className="escena">
                  <Persona_ p={d.persona} />
                  <div className="mesa" />
                  <div className="monitor">{d.emoji}</div>
                  <div className="planta">{['🪴', '🌵', '🍀'][d.nombre.length % 3]}</div>
                  <div className="teclado" /><div className="taza" />
                </div>
                <div className="placa">
                  <b>{d.persona.nombre}</b><small>{d.persona.cargo}</small>
                  <span className="depto"><i className="punto" />{d.nombre}</span>
                </div>
                <div className="cuentas">
                  <span>por hacer <b>{d.cuentas.pendiente}</b></span><span>en curso <b>{d.cuentas.en_curso}</b></span><span>hechas <b>{d.cuentas.completada}</b></span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <h2 className="sec">Pizarra de tareas</h2>
      <section className="pizarra">
        <form className="rapida" onSubmit={(e) => {
          e.preventDefault();
          void actuar(async () => {
            await store.darOrden({ titulo: rapida.titulo, prioridad: rapida.prio, departamento: rapida.depto });
            setRapida((r) => ({ ...r, titulo: '' }));
          });
        }}>
          <input value={rapida.titulo} onChange={(e) => setRapida({ ...rapida, titulo: e.target.value })} placeholder="Nueva orden rápida…" maxLength={200} required aria-label="Título de la orden" />
          <select value={rapida.depto} onChange={(e) => setRapida({ ...rapida, depto: e.target.value })} aria-label="Departamento">
            <option value="">Sin asignar (que lo derive Claude)</option>
            {oficina.departamentos.map((d) => <option key={d.id} value={d.id}>{d.emoji} {d.nombre}</option>)}
          </select>
          <select value={rapida.prio} onChange={(e) => setRapida({ ...rapida, prio: e.target.value })} aria-label="Prioridad">
            {Object.entries(PRIO_ETQ).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
          <button className="btn primario" type="submit">Dar la orden</button>
        </form>
        <div className="error" role="alert">{error}</div>
        <div className="filtros">
          {filtros.map(([id, nombre]) => (
            <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
              {nombre} ({tareas.filter((t) => id === 'todos' || t.departamento === id).length})
            </button>
          ))}
        </div>
        <div className="cols">
          {COLUMNAS.map(([estado, nombre]) => {
            const items = visibles.filter((t) => t.estado === estado);
            return (
              <div key={estado} className={`col${sobre === estado ? ' sobre' : ''}`} data-estado={estado}
                onDragOver={(e) => { e.preventDefault(); setSobre(estado); }} onDragLeave={() => setSobre(null)} onDrop={(e) => soltar(e, estado)}>
                <h3>{nombre}<span>{items.length}</span></h3>
                <ul>
                  {items.length ? items.map(tarjeta) : <li className="vacio">{estado === 'completada' ? 'Todavía no hay nada hecho.' : 'Vacío.'}</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <details className="actividad">
        <summary>Registro de actividad</summary>
        <pre id="log">{datos.log.join('\n') || 'Sin actividad todavía.'}</pre>
      </details>

      <div className={`velo${abierto ? ' abierto' : ''}`} onClick={() => setAbierto(null)} />
      <aside className={`panel${abierto ? ' abierto' : ''}`} role="dialog" aria-modal="true" aria-labelledby="panel-titulo" aria-hidden={!abierto}>
        {renderPanel()}
      </aside>
    </div>
  );
};

export default OficinaVirtual;
