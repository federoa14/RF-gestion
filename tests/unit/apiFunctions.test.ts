import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { buildSync } from 'esbuild';

// Las funciones de /api se publican como módulos ESM: un import sin ".js" rompe en Vercel
// (error ERR_MODULE_NOT_FOUND, FUNCTION_INVOCATION_FAILED). Se compilan como las compila Vercel
// (sin empaquetar) y se llaman de verdad.
test('las funciones de /api cargan como ESM y responden', async () => {
  const out = mkdtempSync(join(tmpdir(), 'rf-api-'));
  buildSync({
    entryPoints: [...readdirSync('api').filter((f) => f.endsWith('.ts')).map((f) => `api/${f}`), 'src/utils/storeTheme.ts'],
    outdir: out,
    outbase: '.',
    format: 'esm',
    platform: 'node',
  });
  writeFileSync(join(out, 'package.json'), '{"type":"module"}');
  const cases: Array<[string, string]> = [
    ['tienda-preview', 'text/html'],
    ['icon', 'image/svg+xml'],
    ['store-manifest', 'application/manifest+json'],
  ];
  for (const [name, type] of cases) {
    const mod = await import(pathToFileURL(join(out, 'api', `${name}.js`)).href);
    const res: Response = await mod.GET(new Request(`https://x.test/api/${name}?catalog=abc`));
    assert.equal(res.status, 200, name + ' status ' + res.status);
    assert.ok((res.headers.get('content-type') || '').startsWith(type), `${name}: tipo ${res.headers.get('content-type')}`);
  }
});
