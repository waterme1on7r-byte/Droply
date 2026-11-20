'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');

test('browser CORS is restricted to configured origins, without changing native API access', async t => {
  const app = createServer({ env: { WEB_ALLOWED_ORIGINS: 'https://droply.example,http://localhost:4173' } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const ok = await fetch(origin + '/auth/status', { headers: { Origin: 'https://droply.example' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://droply.example');
  const preflight = await fetch(origin + '/auth/register', {
    method: 'OPTIONS', headers: { Origin: 'https://droply.example',
      'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Content-Type/i);
  const blocked = await fetch(origin + '/auth/register', {
    method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'no', token: 'no' })
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  const native = await fetch(origin + '/auth/status');
  assert.equal(native.status, 200);
  assert.equal(native.headers.get('access-control-allow-origin'), null);
});

test('invalid or insecure production web origins fail closed', () => {
  assert.throws(() => createServer({ env: { WEB_ALLOWED_ORIGINS: 'https://evil.example/path' } }), /Invalid WEB_ALLOWED_ORIGINS/);
  assert.throws(() => createServer({ env: { WEB_ALLOWED_ORIGINS: 'http://evil.example' } }), /Invalid WEB_ALLOWED_ORIGINS/);
});
