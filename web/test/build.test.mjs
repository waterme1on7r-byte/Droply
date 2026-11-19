import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
test('browser build shares the desktop renderer without changing it', async () => {
  const desktop = await readFile(root + '/index.html', 'utf8');
  const built = await readFile(root + '/docs/app/index.html', 'utf8');
  assert.match(desktop, /<script src="settings\.js"><\/script>/);
  for (const asset of ['config.js', 'storage.js', 'network.js', 'receive.js', 'bridge.js', 'web.css'])
    assert.ok(built.includes('"' + asset + '"'), 'Missing ' + asset);
  assert.match(built, /name="viewport"/);
  assert.match(built, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(built, /script-src 'self' 'unsafe-inline'/);
  assert.match(built, /Droply Web/);
  assert.match(built, /Download file/);
  assert.doesNotMatch(desktop, /<script src="bridge\.js"><\/script>/);
});
test('bundle includes only the public signaling configuration', async () => {
  const config = await readFile(root + '/docs/app/config.js', 'utf8');
  assert.equal(config, await readFile(root + '/config.js', 'utf8'));
  assert.doesNotMatch(config, /ADMIN_TOKEN|DATABASE_URL|secret/i);
});
