import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFallbackIconSvg, buildStoreManifest, decodeImageDataUrl } from '../../api/_manifest';

test('manifiesto: nombre, inicio y color propios de la tienda', () => {
  const m = buildStoreManifest(
    { storeName: 'Librería Hay Vida en Jesús', tagline: 'Libros y regalos', canAccessFullFeatures: true, storeTheme: { palette: 'personalizada', primaryColor: '#004F3B' } },
    'lib hvj',
    'https://rf.test'
  );
  assert.equal(m.name, 'Librería Hay Vida en Jesús');
  assert.equal(m.short_name.length <= 12, true);
  assert.equal(m.start_url, '/?catalog=lib%20hvj');
  assert.equal(m.theme_color, '#004F3B');
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons[0].src.startsWith('https://rf.test/api/icon?catalog=lib%20hvj'));
});

test('manifiesto: sin diseño o sin Plan 3 usa el color estándar', () => {
  assert.equal(buildStoreManifest({ storeName: 'X' }, 'x', 'https://rf.test').theme_color, '#0B1933');
  const m = buildStoreManifest({ storeName: 'X', canAccessFullFeatures: false, storeTheme: { palette: 'bordo' } }, 'x', 'https://rf.test');
  assert.equal(m.theme_color, '#0B1933');
});

test('ícono de respaldo: inicial del comercio y escapa caracteres', () => {
  const svg = buildFallbackIconSvg('<Zeta>', '#123456');
  assert.match(svg, /fill="#123456"/);
  assert.match(svg, />&lt;</);
});

test('decodifica el logo cargado como imagen', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const d = decodeImageDataUrl(png);
  assert.equal(d?.mime, 'image/png');
  assert.equal(d?.bytes[0], 0x89);
  assert.equal(decodeImageDataUrl('data:text/html;base64,AAAA'), null);
});
