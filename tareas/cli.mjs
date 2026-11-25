// CLI para el trabajo autónomo: node tareas/cli.mjs <comando>
//   next                      muestra la pendiente de mayor prioridad (JSON) o VACIA
//   count                     número de tareas pendientes
//   list                      lista todas las tareas ordenadas
//   done <id> "resumen"       marca como completada y registra lo hecho
//   block <id> "motivo"       marca como bloqueada (no se pudo hacer sola)
//   log "texto"               añade una línea de actividad
import { pendientes, leerTareas, ordenar, completar, bloquear, log } from './lib.mjs';

const [cmd, a, b] = process.argv.slice(2);
const uso = () => { console.error(readUso()); process.exit(1); };
const readUso = () => 'Uso: cli.mjs next | count | list | done <id> "resumen" | block <id> "motivo" | log "texto"';

try {
  if (cmd === 'next') {
    const t = pendientes()[0];
    console.log(t ? JSON.stringify(t, null, 2) : 'VACIA');
  } else if (cmd === 'count') {
    console.log(pendientes().length);
  } else if (cmd === 'list') {
    for (const t of ordenar(leerTareas())) console.log(`${t.id}  ${t.prioridad.padEnd(5)}  ${t.estado.padEnd(10)}  ${t.titulo}`);
  } else if (cmd === 'done' && a && b) {
    completar(a, b); console.log('Completada.');
  } else if (cmd === 'block' && a && b) {
    bloquear(a, b); console.log('Bloqueada.');
  } else if (cmd === 'log' && a) {
    log('NOTA', a);
  } else uso();
} catch (e) {
  console.error(e.message); process.exit(1);
}
