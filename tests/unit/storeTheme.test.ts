import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getStoreThemeRootProps, isTooLightForWhiteText, resolveStoreTheme } from '../../src/utils/storeTheme.ts';

test('diseño de tienda: sin diseño o fuera de Plan 3 no cambia nada', () => {
  assert.deepEqual(getStoreThemeRootProps(undefined, true), { className: 'rf-store' });
  assert.deepEqual(getStoreThemeRootProps({ palette: 'bordo' }, false), { className: 'rf-store' });
});

test('diseño de tienda: paletas, colores propios y valores inválidos', () => {
  assert.equal(resolveStoreTheme({ palette: 'bordo' }).primary, '#7F1D1D');
  assert.equal(resolveStoreTheme({ palette: 'personalizada', primaryColor: '#123456' }).primary, '#123456');
  assert.equal(resolveStoreTheme({ palette: 'personalizada', primaryColor: 'rojo' }).primary, '#0B1933');
  assert.equal(resolveStoreTheme({ fontSize: 'enorme' as never }).fontSize, 'normal');
  const props = getStoreThemeRootProps({ palette: 'violeta', cardStyle: 'sombra' }, true);
  assert.equal(props['data-card'], 'sombra');
  assert.equal((props.style as Record<string, string>)['--store-primary'], '#5B21B6');
});

test('diseño de tienda: detecta colores demasiado claros para texto blanco', () => {
  assert.equal(isTooLightForWhiteText('#FFFF00'), true);
  assert.equal(isTooLightForWhiteText('#0B1933'), false);
});
