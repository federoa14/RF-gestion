import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  armarApoyos, armarEntrega, armarEscalada, armarTarea, avatarSvg, estadoOficina, rutinasDebidas, validarOrden,
  type Oficina, type Rutina, type Tarea,
} from '../../src/utils/oficinaLogic.ts';

const leer = (f: string) => JSON.parse(readFileSync(new URL(`../../tareas/${f}`, import.meta.url), 'utf8'));
const O = leer('departamentos.json') as Oficina;
const RUT = leer('rutinas.json') as Rutina[];
const orden = (d: object) => armarTarea(validarOrden(O, d), 'oficina');

test('el reglamento real tiene 9 departamentos con nombres de discípulos y sin Judas Iscariote', () => {
  assert.equal(O.departamentos.length, 9);
  assert.ok(O.departamentos.every((d) => d.persona.nombre && d.mision));
  assert.ok(![...O.departamentos.map((d) => d.persona.nombre), ...(O.nombresReservados ?? [])].some((n) => /iscariote/i.test(n)));
});

test('toda rutina apunta a departamentos que existen', () => {
  const ids = O.departamentos.map((d) => d.id);
  for (const r of RUT) {
    assert.ok(ids.includes(r.departamento), r.id);
    if (r.entregaA) assert.ok(ids.includes(r.entregaA), r.id);
  }
});

test('validarOrden rechaza datos inválidos y deja sin asignar si no hay departamento', () => {
  assert.equal(validarOrden(O, { titulo: 'x' }).departamento, 'sin_asignar');
  assert.throws(() => validarOrden(O, { titulo: '' }), /título/);
  assert.throws(() => validarOrden(O, { titulo: 'x', departamento: 'cocina' }), /Departamento inválido/);
  assert.throws(() => validarOrden(O, { titulo: 'x', prioridad: 'urgente' }), /Prioridad/);
  assert.throws(() => validarOrden(O, { titulo: 'x', departamento: 'diseno', entregaA: 'diseno' }), /sí mismo/);
});

test('la entrega de Diseño a Marketing se arma una sola vez', () => {
  const t: Tarea = { ...orden({ titulo: 'Flyer', departamento: 'diseno', entregaA: 'marketing' }), estado: 'completada', resultado: 'listo' };
  const e = armarEntrega(O, t);
  assert.equal(e?.departamento, 'marketing');
  assert.match(e!.titulo, /Recibido de Diseño/);
  assert.equal(armarEntrega(O, { ...t, entregado: true }), null);
});

test('pedir apoyo crea compañeras y rechaza departamentos inexistentes', () => {
  const t = orden({ titulo: 'Promo', departamento: 'marketing' });
  assert.deepEqual(armarApoyos(O, t, ['diseno', 'ventas', 'marketing']).map((x) => x.departamento).sort(), ['diseno', 'ventas']);
  assert.throws(() => armarApoyos(O, t, ['cocina']), /apoyo inválido/);
});

test('la escalada queda bloqueada, esperando al Presidente, y valida largos', () => {
  const e = armarEscalada({ persona: 'Distribuidora Norte', motivo: 'pide reembolso', sugerencia: 'definir el reembolso' });
  assert.equal(e.estado, 'bloqueada');
  assert.match(e.descripcion, /Contactate con Distribuidora Norte para definir el reembolso/);
  assert.throws(() => armarEscalada({ persona: '', motivo: 'x' }), /persona/);
  assert.throws(() => armarEscalada({ persona: 'a', motivo: 'm'.repeat(200) }), /demasiado largo/);
});

test('las rutinas respetan la cadencia y no se duplican', () => {
  const hoy = new Date('2026-12-01T10:00:00Z');
  const primera = rutinasDebidas(RUT, [], hoy);
  assert.equal(primera.length, RUT.length);
  assert.equal(rutinasDebidas(RUT, primera, hoy).length, 0);
  const hecha = primera.map((t) => ({ ...t, estado: 'completada' as const }));
  assert.equal(rutinasDebidas(RUT, hecha, new Date('2026-12-02T10:00:00Z')).filter((t) => t.rutina === 'diseno-piezas').length, 0);
  assert.equal(rutinasDebidas(RUT, hecha, new Date('2027-01-15T10:00:00Z')).filter((t) => t.rutina === 'diseno-piezas').length, 1);
});

test('el estado de la oficina refleja la pizarra real', () => {
  const t = orden({ titulo: 'Flyer', departamento: 'diseno' });
  const d = (ts: Tarea[]) => estadoOficina(O, ts).find((x) => x.id === 'diseno')!;
  assert.equal(d([]).situacion, 'libre');
  assert.equal(d([t]).situacion, 'con_pendientes');
  assert.equal(d([{ ...t, estado: 'en_curso', iniciada: new Date().toISOString() }]).situacion, 'trabajando');
});

test('el avatar solo usa colores válidos (no se puede inyectar código)', () => {
  const p = { ...O.presidente, piel: '"/><script>alert(1)</script>', pelo: 'red', camisa: '#12345' };
  const svg = avatarSvg(p);
  assert.ok(!svg.includes('<script'));
  assert.ok(svg.includes('#888888'));
});
