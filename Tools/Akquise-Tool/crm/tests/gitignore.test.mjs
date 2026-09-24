import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gitignoreUrl = new URL('../.gitignore', import.meta.url);

test('lokale Service-Account-Schluessel bleiben ausserhalb der Versionshistorie', async () => {
  const patterns = (await readFile(gitignoreUrl, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  assert.ok(patterns.includes('secrets/'));
  assert.ok(patterns.includes('*service-account*.json'));
  assert.ok(patterns.includes('*service_account*.json'));
  assert.ok(!patterns.includes('*.json'), 'legitime JSON-Dateien duerfen nicht pauschal ignoriert werden');
});
