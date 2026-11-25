// CLI para el trabajo autónomo y para darle órdenes a la oficina desde el chat:
//   node tareas/cli.mjs <comando>
//   next                          la pendiente de mayor prioridad (JSON) o VACIA
//   count                         número de tareas pendientes
//   list                          lista todas las tareas ordenadas
//   add "título" [depto] [prio] ["descripción"] [entregaA] [apoyo,apoyo]
//                                 crea una orden (depto: marketing, ventas, diseno, gestion,
//                                 actualizacion, evolucion, soporte, legal; vacío = sin_asignar)
//   start <id>                    el departamento toma la tarea (pasa a «En curso»)
//   done <id> "resumen"           la marca como hecha (si tiene «entregaA», crea la tarea en ese depto)
//   block <id> "motivo"           la marca como bloqueada (no se pudo hacer sola / falta aprobación)
//   assign <id> <depto>           deriva una tarea a un departamento
//   rules [depto]                 imprime el reglamento general y el de un departamento
//   escalar "persona" "motivo" ["resumen"] ["sugerencia"]
//                                 Asistencia pasa un caso al Presidente: queda en «esperan al Presidente»
//   routines                      genera las tareas periódicas que ya tocan (idempotente; correr primero en cada ejecución autónoma)
//   redes [pausar|reanudar]       estado del interruptor de redes; con pausar/reanudar lo cambia
//   log "texto"                   añade una línea de actividad
import { pendientes, leerTareas, ordenar, agregar, editar, escalar, generarRutinas, leerRedes, ajustarRedes, iniciar, completar, bloquear, log, leerOficina } from './lib.mjs';

const [cmd, a, b, c, d, e, f] = process.argv.slice(2);
const USO = 'Uso: cli.mjs next | count | list | add "título" [depto] [prio] ["descripción"] [entregaA] [apoyo,apoyo] | start <id> | done <id> "resumen" | block <id> "motivo" | assign <id> <depto> | rules [depto] | escalar "persona" "motivo" ["resumen"] ["sugerencia"] | routines | redes [pausar|reanudar] | log "texto"';

try {
  if (cmd === 'next') {
    const t = pendientes()[0];
    console.log(t ? JSON.stringify(t, null, 2) : 'VACIA');
  } else if (cmd === 'count') {
    console.log(pendientes().length);
  } else if (cmd === 'list') {
    for (const t of ordenar(leerTareas())) {
      console.log(`${t.id}  ${t.prioridad.padEnd(5)}  ${t.estado.padEnd(10)}  ${t.departamento.padEnd(13)}  ${t.titulo}`);
    }
  } else if (cmd === 'add' && a) {
    const t = agregar({ titulo: a, departamento: b, prioridad: c || 'media', descripcion: d || '', entregaA: e, apoyo: f ? f.split(',') : [] }, 'claude');
    console.log(`Creada ${t.id} en ${t.departamento}.`);
  } else if (cmd === 'start' && a) {
    iniciar(a); console.log('En curso.');
  } else if (cmd === 'done' && a && b) {
    completar(a, b); console.log('Completada.');
  } else if (cmd === 'block' && a && b) {
    bloquear(a, b); console.log('Bloqueada.');
  } else if (cmd === 'assign' && a && b) {
    editar(a, { departamento: b }); console.log('Derivada.');
  } else if (cmd === 'rules') {
    const of = leerOficina();
    console.log(`REGLAMENTO GENERAL (${of.empresa}, presidente: ${of.presidente.nombre})\n- ${of.reglamento.join('\n- ')}`);
    const dep = of.departamentos.find((x) => x.id === a);
    if (a && !dep) throw new Error(`Departamento desconocido: ${a}`);
    if (dep) {
      const lista = (t, xs) => `${t}:\n- ${xs.join('\n- ')}`;
      console.log(`\nDEPARTAMENTO: ${dep.nombre} — ${dep.persona.nombre}, ${dep.persona.cargo}\nMisión: ${dep.mision}\n${lista('Funciones', dep.funciones)}\n${lista('Reglas', dep.reglas)}\n${lista('Prohibido', dep.prohibido)}\nEntrega a: ${dep.entregaA.join(', ') || '—'}`);
      if (dep.protocolo) {
        const p = dep.protocolo;
        console.log(`\nPROTOCOLO\n${lista('Resuelve solo', p.resuelveSola)}\n${lista('Deriva a Actualización', p.derivaAActualizacion)}\n${lista('Escala al Presidente', p.escalaAlPresidente)}\nFormato del aviso: ${p.formatoAviso}`);
      }
    }
  } else if (cmd === 'escalar' && a && b) {
    const t = escalar({ persona: a, motivo: b, resumen: c, sugerencia: d }); console.log(`Escalada ${t.id}: ${t.titulo}`);
  } else if (cmd === 'routines') {
    const n = generarRutinas(); console.log(n.length ? n.map((t) => `${t.id} [${t.departamento}] ${t.titulo}`).join('\n') : 'Sin rutinas nuevas.');
  } else if (cmd === 'redes') {
    console.log(JSON.stringify(a === 'pausar' || a === 'reanudar' ? ajustarRedes({ pausada: a === 'pausar' }) : leerRedes()));
  } else if (cmd === 'log' && a) {
    log('NOTA', a);
  } else {
    console.error(USO); process.exit(1);
  }
} catch (err) {
  console.error(err.message); process.exit(1);
}
