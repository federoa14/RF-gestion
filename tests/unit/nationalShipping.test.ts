import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_SHIPPING, formatShippingAddress, formatShippingBlock, validateShippingDetails } from '../../src/utils/nationalShipping';

const ok = {
  ...EMPTY_SHIPPING,
  fullName: 'Lucía Pérez',
  dni: '30.123.456',
  phone: '11 5555 1234',
  street: 'Av. Siempre Viva',
  streetNumber: '742',
  city: 'Rosario',
  province: 'Santa Fe',
  postalCode: 'S2000',
};

test('datos de envío completos son válidos', () => {
  assert.equal(validateShippingDetails(ok), null);
  assert.equal(validateShippingDetails({ ...ok, postalCode: '2000' }), null);
  assert.equal(validateShippingDetails({ ...ok, postalCode: 'S2000ABC' }), null);
});

test('detecta datos faltantes o inválidos', () => {
  assert.match(validateShippingDetails({ ...ok, fullName: 'Lucía' }) || '', /apellido/);
  assert.match(validateShippingDetails({ ...ok, dni: '12' }) || '', /DNI/);
  assert.match(validateShippingDetails({ ...ok, phone: '123' }) || '', /teléfono/i);
  assert.match(validateShippingDetails({ ...ok, email: 'mal' }) || '', /email/i);
  assert.match(validateShippingDetails({ ...ok, street: '' }) || '', /calle/);
  assert.match(validateShippingDetails({ ...ok, streetNumber: '' }) || '', /altura/);
  assert.match(validateShippingDetails({ ...ok, city: '' }) || '', /localidad/);
  assert.match(validateShippingDetails({ ...ok, province: '' }) || '', /provincia/i);
  assert.match(validateShippingDetails({ ...ok, postalCode: '12' }) || '', /postal/);
});

test('arma la dirección y el bloque para copiar', () => {
  assert.equal(formatShippingAddress({ ...ok, floorApt: 'Piso 2 B' }), 'Av. Siempre Viva 742, Piso 2 B, Rosario, Santa Fe (CP S2000)');
  const block = formatShippingBlock({ ...ok, betweenStreets: 'Mitre y Sarmiento' });
  assert.match(block, /Destinatario: Lucía Pérez/);
  assert.match(block, /DNI: 30123456/);
  assert.match(block, /Entre calles: Mitre y Sarmiento/);
});
