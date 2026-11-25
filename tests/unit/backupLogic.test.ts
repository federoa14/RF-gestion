import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKUP_TABLES, backupFileName, filesToPrune, stripSecrets } from '../../supabase/functions/_shared/backupLogic.ts';

test('respaldo: deja los 8 más nuevos e ignora otros archivos', () => {
  const names = Array.from({ length: 10 }, (_, i) => `2026-11-${String(i + 10).padStart(2, '0')}.json`).concat(['notas.txt']);
  assert.deepEqual(filesToPrune(names), ['2026-11-11.json', '2026-11-10.json']);
  assert.deepEqual(filesToPrune(names.slice(0, 3)), []);
});

test('respaldo: nunca incluye tokens ni la tabla de secretos', () => {
  const clean = stripSecrets({ distributorName: 'X', merchantMpAccessToken: 'APP', nested: [{ password: '1', ok: 2 }] });
  assert.deepEqual(clean, { distributorName: 'X', nested: [{ ok: 2 }] });
  assert.equal((BACKUP_TABLES as readonly string[]).includes('business_secrets'), false);
  assert.equal(backupFileName(new Date('2026-11-29T06:23:00Z')), '2026-11-29.json');
});
