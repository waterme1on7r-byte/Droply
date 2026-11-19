import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('CSP script hash matches the HTML parser-normalized inline script', async () => {
  const built = await readFile(root + '/docs/app/index.html', 'utf8');
  const source = await readFile(root + '/index.html', 'utf8');
  const match = built.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'Expected the browser renderer inline script');
  assert.doesNotMatch(match[1], /\r/, 'HTML should use parser-normalized line endings');
  const sha = createHash('sha256').update(match[1], 'utf8').digest('base64');
  assert.ok(built.includes("script-src 'self' 'sha256-" + sha + "'"),
    'CSP must hash the exact JavaScript that the browser executes');
  // The desktop HTML is CRLF. Hashing that raw text would silently block
  // every onclick handler, leaving a visually rendered but inert UI.
  assert.match(source, /\r\n/);
  assert.notEqual(createHash('sha256')
    .update(source.match(/<script>([\s\S]*?)<\/script>/)[1]).digest('base64'), sha);
});
