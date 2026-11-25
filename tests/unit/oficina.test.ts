import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Los datos de la pizarra van a una carpeta temporal antes de cargar la lógica.
process.env.TAREAS_DATA = mkdtempSync(join(tmpdir(), 'oficina-'));
const lib = await import('../../tareas/lib.mjs');

test('una tarea sin departamento queda sin asignar', () => {
  const t = lib.agregar({ titulo: 'Idea suelta' });
  assert.equal(t.departamento, 'sin_asignar');
});

test('departamento inexistente se rechaza', () => {
  assert.throws(() => lib.agregar({ titulo: 'x', departamento: 'cocina' }), /Departamento inválido/);
});

test('un departamento no puede entregarse a sí mismo', () => {
  assert.throws(() => lib.agregar({ titulo: 'x', departamento: 'diseno', entregaA: 'diseno' }), /sí mismo/);
});

test('el estado de la oficina refleja la pizarra real', () => {
  const t = lib.agregar({ titulo: 'Flyer', departamento: 'diseno' });
  assert.equal(lib.estadoOficina().departamentos.find((d: any) => d.id === 'diseno').situacion, 'con_pendientes');
  lib.iniciar(t.id);
  const d = lib.estadoOficina().departamentos.find((x: any) => x.id === 'diseno');
  assert.equal(d.situacion, 'trabajando');
  assert.equal(d.ahora.id, t.id);
});

test('lo que Diseño termina le llega a Marketing una sola vez', () => {
  const t = lib.agregar({ titulo: 'Flyer promo', departamento: 'diseno', entregaA: 'marketing' });
  lib.completar(t.id, 'listo');
  lib.completar(t.id, 'listo otra vez');
  const recibidas = lib.leerTareas().filter((x: any) => x.departamento === 'marketing' && x.desde === t.id);
  assert.equal(recibidas.length, 1);
  assert.match(recibidas[0].titulo, /Recibido de Diseño/);
});

test('las rutinas se generan solas, una vez, y respetan la cadencia', () => {
  const hoy = new Date('2026-12-01T10:00:00Z');
  const primera = lib.generarRutinas(hoy);
  assert.ok(primera.length > 0);
  assert.equal(lib.generarRutinas(hoy).length, 0, 'no se duplican mientras siguen abiertas');
  const t = primera[0];
  lib.completar(t.id, 'hecho');
  assert.equal(lib.generarRutinas(new Date('2026-12-02T10:00:00Z')).filter((x: any) => x.rutina === t.rutina).length, 0, 'todavía no toca');
  assert.equal(lib.generarRutinas(new Date('2027-01-15T10:00:00Z')).filter((x: any) => x.rutina === t.rutina).length, 1, 'ya toca de nuevo');
});

test('pedir apoyo crea una tarea compañera en el otro departamento', () => {
  const t = lib.agregar({ titulo: 'Lanzar promo', departamento: 'marketing', apoyo: ['diseno', 'ventas'] });
  const apoyos = lib.leerTareas().filter((x: any) => x.desde === t.id);
  assert.deepEqual(apoyos.map((x: any) => x.departamento).sort(), ['diseno', 'ventas']);
  assert.throws(() => lib.agregar({ titulo: 'x', departamento: 'marketing', apoyo: ['cocina'] }), /apoyo inválido/);
});

test('el interruptor de redes se pausa, se reanuda y valida el límite', () => {
  assert.equal(lib.ajustarRedes({ pausada: true }).pausada, true);
  assert.equal(lib.estadoOficina().redes.pausada, true);
  assert.equal(lib.ajustarRedes({ pausada: false }).pausada, false);
  assert.throws(() => lib.ajustarRedes({ limitePorDia: 500 }), /entre 0 y 20/);
});

test('escalar deja el caso esperando al Presidente con el aviso armado', () => {
  const t = lib.escalar({ persona: 'Distribuidora Norte', motivo: 'pide reembolso', resumen: 'Cobraron dos veces.', sugerencia: 'definir el reembolso' });
  assert.equal(t.estado, 'bloqueada');
  assert.equal(t.departamento, 'soporte');
  assert.match(t.descripcion, /Contactate con Distribuidora Norte para definir el reembolso/);
  assert.throws(() => lib.escalar({ persona: '', motivo: 'x' }), /persona/);
  assert.throws(() => lib.escalar({ persona: 'a', motivo: 'm'.repeat(200) }), /demasiado largo/);
});
