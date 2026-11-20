'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');
const { WebSocketServer } = WebSocket;
const { createPreviewServer } = require('../../web/preview-server.cjs');

const password = 'G5-g8-BQj2wY0eL7skMb9Y6k79e83BX4KvV4';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const stop = server => new Promise(resolve => server.close(resolve));

test('private preview protects assets and proxies authenticated API and WebSockets', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'droply-test-'));
  t.after(() => fs.rm(root, { force: true, recursive: true }));
  await fs.writeFile(path.join(root, 'index.html'), '<h1>Droply Browser Test</h1>');
  await fs.writeFile(path.join(root, 'network.js'), 'console.log("test asset")');
  const upstreamHttp = http.createServer(async (req, res) => {
    if (req.url === '/auth/register' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = JSON.parse(Buffer.concat(chunks).toString());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: request.id }));
    } else { res.writeHead(404); res.end(); }
  });
  const upstreamWs = new WebSocketServer({ server: upstreamHttp, path: '/device' });
  let upstreamAppHeartbeats = 0;
  upstreamWs.on('connection', socket => socket.on('message', data => {
    if (data.toString() === '{"t":"heartbeat"}') { upstreamAppHeartbeats++; return; }
    socket.send(data.toString());
  }));
  await listen(upstreamHttp);
  t.after(async () => { await new Promise(resolve => upstreamWs.close(resolve)); await stop(upstreamHttp); });
  const proxy = createPreviewServer({
    root, allowLocalUpstream: true,
    env: { WEB_PREVIEW_PASSWORD: password,
      SIGNALING_UPSTREAM_URL: 'ws://127.0.0.1:' + upstreamHttp.address().port,
      PREVIEW_LOCAL_HTTP: '1' }
  });
  await listen(proxy.server);
  t.after(() => proxy.close());
  const base = 'http://127.0.0.1:' + proxy.server.address().port;
  const preview = base + '/internal/preview/';
  const unauth = await fetch(preview);
  assert.equal(unauth.status, 200);
  const loginHtml = await unauth.text();
  assert.match(loginHtml, /Test access password/);
  assert.equal(unauth.headers.get('referrer-policy'), 'no-referrer');
  const csrf = loginHtml.match(/name="csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrf, 'Login form must have a signed CSRF token');
  assert.equal(unauth.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(unauth.headers.get('cache-control'), 'private, no-store, max-age=0');
  const blockedAsset = await fetch(preview + 'network.js');
  assert.equal(blockedAsset.status, 401);
  assert.match(blockedAsset.headers.get('content-type'), /text\/plain/);
  assert.doesNotMatch(await blockedAsset.text(), /test asset|<html/);
  const noLogin = await fetch(preview + 'login', { method: 'POST', redirect: 'manual',
    headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: 'incorrect', csrf }) });
  assert.equal(noLogin.status, 401);
  const badOrigin = await fetch(preview + 'login', { method: 'POST', redirect: 'manual',
    headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password, csrf }) });
  assert.equal(badOrigin.status, 403);
  const login = await fetch(preview + 'login', { method: 'POST', redirect: 'manual',
    headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password, csrf }) });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('content-type'), /text\/html/);
  assert.match(await login.text(), /Access granted/);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^droply_preview_session=/);
  const headers = { Cookie: cookie };
  const app = await fetch(preview, { headers });
  assert.equal(app.status, 200);
  assert.match(await app.text(), /Droply Browser Test/);
  const asset = await fetch(preview + 'network.js', { headers });
  assert.equal(asset.status, 200);
  assert.match(await asset.text(), /test asset/);
  const cfg = await fetch(preview + 'config.js', { headers });
  assert.equal(cfg.status, 200);
  assert.match(await cfg.text(), /location\.origin\.replace/);
  const secret = await fetch(preview + '.env', { headers });
  assert.equal(secret.status, 404);
  const authDenied = await fetch(base + '/auth/register', {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test' })
  });
  assert.equal(authDenied.status, 403);
  const register = await fetch(base + '/auth/register', {
    method: 'POST', headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'tester', token: 'fake-test' })
  });
  assert.equal(register.status, 200);
  assert.deepEqual(await register.json(), { id: 'tester' });
  const originDenied = await fetch(base + '/auth/register', {
    method: 'POST', headers: { Origin: 'https://attacker.example', Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test' })
  });
  assert.equal(originDenied.status, 403);
  const echo = await new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/device', {
      headers: { Cookie: cookie, Origin: base }
    });
    ws.on('open', () => ws.send('test-hello'));
    ws.on('message', msg => { resolve(msg.toString()); ws.close(); });
    ws.on('error', reject);
    setTimeout(() => { ws.terminate(); reject(Error('Timed out')); }, 3000).unref();
  });
  assert.equal(echo, 'test-hello');

  // The private gateway verifies its *upstream* connection with a native WS
  // ping/pong before acknowledging the browser's liveness probe. No production
  // signaling change is required.
  const pong = await new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/device', {
      headers: { Cookie: cookie, Origin: base }
    });
    const deadline = setTimeout(() => { ws.terminate(); reject(Error('Gateway health probe timed out')); }, 3500);
    ws.on('open', () => ws.send('probe-ready'));
    ws.on('message', raw => {
      const value = raw.toString();
      if (value === 'probe-ready') return ws.send(JSON.stringify({ t: 'gateway-ping', id: 42 }));
      try {
        const result = JSON.parse(value);
        clearTimeout(deadline);
        ws.close();
        resolve(result);
      } catch (error) { clearTimeout(deadline); ws.terminate(); reject(error); }
    });
    ws.on('error', error => { clearTimeout(deadline); reject(error); });
  });
  assert.equal(pong.t, 'gateway-pong');
  assert.equal(pong.id, 42);
  assert.equal(upstreamAppHeartbeats, 1,
    'The gateway must send a lightweight application data frame to the upstream service');

  // Safari may send neither Origin nor Referer, especially when the page
  // explicitly sets Referrer-Policy: no-referrer.
  const safariLogin = await fetch(preview + 'login', { method: 'POST',
    headers: { 'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password, csrf }) });
  assert.equal(safariLogin.status, 200);
  assert.match(await safariLogin.text(), /Access granted/);
  const safariNullOrigin = await fetch(preview + 'login', { method: 'POST',
    headers: { Origin: 'null', 'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password, csrf }) });
  assert.equal(safariNullOrigin.status, 200);
  const missingToken = await fetch(preview + 'login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password }) });
  assert.equal(missingToken.status, 403);
  const tamperedToken = await fetch(preview + 'login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password, csrf: csrf.slice(0, -1) + (csrf.endsWith('A') ? 'B' : 'A') }) });
  assert.equal(tamperedToken.status, 403);
  const rejectedReferer = await fetch(preview + 'login', { method: 'POST',
    headers: { Referer: 'https://attacker.example/page', 'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password, csrf }) });
  assert.equal(rejectedReferer.status, 403);
  const rejectedCrossSite = await fetch(preview + 'login', { method: 'POST',
    headers: { 'Sec-Fetch-Site': 'cross-site',
      'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password, csrf }) });
  assert.equal(rejectedCrossSite.status, 403);
});

test('private preview refuses weak credentials and insecure remote signaling', () => {
  assert.throws(() => createPreviewServer({
    env: { WEB_PREVIEW_PASSWORD: 'weak', SIGNALING_UPSTREAM_URL: 'wss://good.example' }
  }), /WEB_PREVIEW_PASSWORD/);
  assert.throws(() => createPreviewServer({
    env: { WEB_PREVIEW_PASSWORD: password, SIGNALING_UPSTREAM_URL: 'ws://evil.example' }
  }), /SIGNALING_UPSTREAM_URL/);
});
