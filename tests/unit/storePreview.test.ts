import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildStorePreviewHtml } from '../../api/_storePreview.ts';

test('vista previa del link: escapa textos y elige una imagen pública', () => {
  const html = buildStorePreviewHtml(
    { storeName: 'Kiosco "El Sol" <b>', tagline: 'Golosinas & bebidas', logoUrl: 'data:image/png;base64,xx', products: [{ imageUrl: 'https://img.test/a.jpg' }] },
    'https://tienda.test/?catalog=el-sol',
    'https://tienda.test'
  );
  assert.match(html, /og:title" content="Kiosco &quot;El Sol&quot; &lt;b&gt; · Tienda online"/);
  assert.match(html, /og:description" content="Golosinas &amp; bebidas"/);
  assert.match(html, /og:image" content="https:\/\/img\.test\/a\.jpg"/);
  assert.doesNotMatch(html, /<b>/);
});

test('vista previa del link: sin datos muestra una genérica', () => {
  const html = buildStorePreviewHtml(null, 'https://t.test/?catalog=x', 'https://t.test');
  assert.match(html, /<title>Tienda online<\/title>/);
  assert.match(html, /og:image" content="https:\/\/t\.test\/assets\//);
});
