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
