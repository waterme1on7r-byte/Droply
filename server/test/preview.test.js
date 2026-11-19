'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');
const { validatePreview } = require('../preview');

const password = 'eWc8sZ8tgK9eNB2rpB7U4FvE9RxQ5Lh3';
const origin = 'https://droply-preview.example';
const auth = { Authorization: 'Basic ' + Buffer.from('droply:' + password).toString('base64') };
function withServer(env, root, callback) {
  return async t => {
    const app = createServer({ env, previewRoot: root });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => app.close());
    await callback('http://127.0.0.1:' + app.server.address().port);
  };
}

test('preview is disabled and does not reveal files without secrets', withServer({}, os.tmpdir(), async base => {
  const response = await fetch(base + '/internal/preview/');
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('www-authenticate'), null);
}));

test('preview protects HTML and all browser files with a strong server-side password', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'droply-preview-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'index.html'), '<h1>Droply preview</h1>');
  await fs.writeFile(path.join(dir, 'config.js'), 'window.CONFIG={};');
  const fn = withServer({ WEB_PREVIEW_PASSWORD: password, WEB_PREVIEW_ORIGIN: origin }, dir, async base => {
    for (const asset of ['', 'config.js']) {
      const unauth = await fetch(base + '/internal/preview/' + asset);
      assert.equal(unauth.status, 401);
      assert.match(unauth.headers.get('www-authenticate'), /^Basic /);
      assert.equal(unauth.headers.get('cache-control'), 'private, no-store, max-age=0');
      assert.equal(unauth.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
    }
    const incorrect = await fetch(base + '/internal/preview/', {
      headers: { Authorization: 'Basic ' + Buffer.from('droply:wrong').toString('base64') }
    });
    assert.equal(incorrect.status, 401);
    const page = await fetch(base + '/internal/preview/', { headers: auth });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Droply preview/);
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    const config = await fetch(base + '/internal/preview/config.js', { headers: auth });
    assert.equal(config.status, 200);
    assert.equal(config.headers.get('content-type'), 'text/javascript; charset=utf-8');
    const guessed = await fetch(base + '/internal/preview/.env', { headers: auth });
    assert.equal(guessed.status, 404);
    const traversal = await fetch(base + '/internal/preview/%2e%2e/.env', { headers: auth });
    assert.equal(traversal.status, 404);
    const cors = await fetch(base + '/auth/status', { headers: { Origin: origin } });
    assert.equal(cors.status, 200);
    assert.equal(cors.headers.get('access-control-allow-origin'), origin);
    const thirdParty = await fetch(base + '/auth/status', { headers: { Origin: 'https://attacker.example' } });
    assert.equal(thirdParty.status, 403);
  });
  await fn(t);
});

test('preview requires complete, strongly protected configuration', () => {
  assert.equal(validatePreview({}), null);
  assert.throws(() => validatePreview({ WEB_PREVIEW_PASSWORD: 'weak' }));
  assert.throws(() => validatePreview({ WEB_PREVIEW_ORIGIN: origin }));
  assert.throws(() => validatePreview({ WEB_PREVIEW_PASSWORD: password, WEB_PREVIEW_ORIGIN: origin + '/internal/preview' }));
  assert.throws(() => validatePreview({ WEB_PREVIEW_PASSWORD: password, WEB_PREVIEW_ORIGIN: 'http://public.example' }));
  assert.deepEqual(validatePreview({ WEB_PREVIEW_PASSWORD: password, WEB_PREVIEW_ORIGIN: origin }),
    { password, origin });
});
