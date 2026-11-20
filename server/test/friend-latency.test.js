'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const WebSocket = require('ws');
const { createServer } = require('../server');
const { codeFor } = require('../auth-store');
const { createPreviewServer } = require('../../web/preview-server.cjs');

const password = 'integration-test-only-Kb3p4Hjex6uY5Z9w';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
function inbox(socket) {
  const queued = [], waiting = [];
  socket.on('message', data => {
    let message;
    try { message = JSON.parse(data.toString()); } catch { return; }
    const index = waiting.findIndex(w => w.predicate(message));
    if (index >= 0) {
      const [w] = waiting.splice(index, 1);
      clearTimeout(w.timer);
      w.resolve(message);
    } else queued.push(message);
  });
  return {
    next(predicate, ms = 4000) {
      const index = queued.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const record = { predicate, resolve, timer: null };
        record.timer = setTimeout(() => {
          const i = waiting.indexOf(record);
          if (i >= 0) waiting.splice(i, 1);
          reject(Error('Timed out waiting for signaling frame'));
        }, ms);
        waiting.push(record);
      });
    },
    send(data) { socket.send(JSON.stringify(data)); }
  };
}
const matching = type => m => m.t === type;
async function connect(url, headers = {}) {
  const ws = new WebSocket(url, { headers, handshakeTimeout: 4000 });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { ws, box: inbox(ws) };
}
async function runScenario(t, { webRecipient, lateRecipient }) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'droply-latency-'));
  const backend = createServer({ env: { AUTH_STORE_FILE: path.join(temp, 'registry.json') } });
  await listen(backend.server);
  const serverBase = 'http://127.0.0.1:' + backend.server.address().port;
  const preview = createPreviewServer({ allowLocalUpstream: true, root: temp,
    env: {
      WEB_PREVIEW_PASSWORD: password,
      SIGNALING_UPSTREAM_URL: serverBase.replace(/^http/, 'ws'),
      PREVIEW_LOCAL_HTTP: '1'
    }
  });
  await listen(preview.server);
  const previewBase = 'http://127.0.0.1:' + preview.server.address().port;
  const clients = [];
  t.after(async () => {
    for (const ws of clients) ws.terminate();
    await preview.close();
    await backend.close();
    await fs.rm(temp, { recursive: true, force: true });
  });
  const form = await (await fetch(previewBase + '/internal/preview/')).text();
  const csrf = form.match(/name="csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrf);
  const login = await fetch(previewBase + '/internal/preview/login', {
    method: 'POST', redirect: 'manual',
    headers: { Origin: previewBase, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password, csrf })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const alice = { id: crypto.randomUUID(), token: crypto.randomBytes(32).toString('base64url') };
  const bob = { id: crypto.randomUUID(), token: crypto.randomBytes(32).toString('base64url') };
  for (const person of [alice, bob]) {
    const response = await fetch(serverBase + '/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(person)
    });
    assert.equal(response.status, 200);
  }
  const gatewayHeaders = { Origin: previewBase, Cookie: cookie };
  const upstreamUrl = serverBase.replace(/^http/, 'ws') + '/device';
  const previewUrl = previewBase.replace(/^http/, 'ws') + '/device';
  async function join(person, name, throughGateway) {
    const { ws, box } = await connect(throughGateway ? previewUrl : upstreamUrl,
      throughGateway ? gatewayHeaders : {});
    clients.push(ws);
    box.send({ t: 'auth', token: person.token });
    assert.equal((await box.next(matching('authenticated'))).id, person.id);
    box.send({ t: 'hello', id: person.id, name, av: '' });
    await box.next(matching('peers'));
    return box;
  }
  let recipient;
  if (!lateRecipient) recipient = await join(bob, 'Bob', webRecipient);
  const sender = await join(alice, 'Alice', true);
  const code = codeFor(bob.id);
  sender.send({ t: 'watch', codes: [code], friends: [], notify: [] });
  if (lateRecipient) recipient = await join(bob, 'Bob', webRecipient);
  const started = Date.now();
  const resolved = await sender.next(m => m.t === 'resolved' && m.code === code);
  assert.equal(resolved.id, bob.id, 'Server resolves the exact device code');
  sender.send({ t: 'sig', to: bob.id, data: { t: 'fr', name: 'Alice', av: '' } });
  const received = await recipient.next(m => m.t === 'sig' && m.data?.t === 'fr');
  assert.equal(received.from, alice.id);
  assert.equal(received.data.name, 'Alice');
  const deliveryMs = Date.now() - started;
  assert.ok(deliveryMs < 2500,
    'A warm, online browser-to-device friend request should take much less than 10s, observed ' + deliveryMs + 'ms');
}
test('warm server: private Web sender reaches online native recipient promptly', t =>
  runScenario(t, { webRecipient: false, lateRecipient: false }));
test('warm server: private Web sender reaches online Web recipient promptly', t =>
  runScenario(t, { webRecipient: true, lateRecipient: false }));
test('warm server: pending friend-code watch resolves promptly when recipient reconnects', t =>
  runScenario(t, { webRecipient: false, lateRecipient: true }));
