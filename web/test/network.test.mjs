import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../network.js', import.meta.url)), 'utf8');

test('authentication sends the latest profile even if it changed while connecting', async () => {
  const id = '8b9962de-d9e4-4459-aefa-b3ba960f1234';
  let profile = { id, name: '', avatar: '' };
  let socket;
  class Socket {
    static OPEN = 1;
    constructor() { socket = this; this.readyState = 1; this.sent = []; }
    send(message) { this.sent.push(JSON.parse(message)); }
    close() { this.readyState = 3; }
  }
  const sandbox = {
    window: { CONFIG: { SERVER_URL: 'wss://signal.example' }, DroplyWebStore: {
      profile: async () => ({ ...profile }),
      credential: async () => ({ token: 'A'.repeat(43), registered: true })
    } },
    WebSocket: Socket, URL, console, setTimeout, clearTimeout, Math
  };
  runInNewContext(source, sandbox, { timeout: 1000 });
  const net = sandbox.window.DroplyWebNetwork;
  await net.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(socket);
  profile = { id, name: 'Alice', avatar: '' };
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ t: 'authenticated', id }) });
  await new Promise(resolve => setImmediate(resolve));
  const hello = socket.sent.find(message => message.t === 'hello');
  assert.equal(hello?.name, 'Alice');
  net.close();
});


test('friend subscriptions and lookup are delivered after hello, not dropped during authentication', async () => {
  const id = 'a23af3d2-29f1-4aa1-89a1-0c1e21d1d928';
  const code = 'DRP-1234-5678-9ABC';
  const watch = { t: 'watch', friends: [], codes: [code], notify: [] };
  const profile = { id, name: 'Ava', avatar: '' };
  let socket;
  class Socket {
    static OPEN = 1;
    static CLOSED = 3;
    constructor() { socket = this; this.readyState = 1; this.sent = []; this.bufferedAmount = 0; }
    send(message) { this.sent.push(JSON.parse(message)); }
    close() { this.readyState = 3; }
  }
  const sandbox = {
    window: { CONFIG: { SERVER_URL: 'wss://signal.example' }, DroplyWebStore: {
      profile: async () => ({ ...profile }),
      credential: async () => ({ token: 'A'.repeat(43), registered: true })
    } },
    WebSocket: Socket, URL, console, setTimeout, clearTimeout, Math
  };
  runInNewContext(source, sandbox, { timeout: 1000 });
  const net = sandbox.window.DroplyWebNetwork;
  const states = [];
  net.on('server-event', event => {
    if (event.t === 'state' && event.state === 'connected') {
      states.push('connected');
      net.sendSignal(watch);
    }
  });
  await net.start();
  await new Promise(resolve => setImmediate(resolve));
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ t: 'authenticated', id }) });
  // Reproduce the initial registration race: the user adds a friend just as
  // authentication completes, before the asynchronous hello has been sent.
  net.sendSignal(watch);
  net.sendSignal({ t: 'lookup', code });
  assert.deepEqual(socket.sent.map(x => x.t), ['auth'], 'Do not send watches before the device is announced');
  await new Promise(resolve => setImmediate(resolve));
  const kinds = socket.sent.map(x => x.t);
  assert.deepEqual(kinds.slice(0, 4), ['auth', 'hello', 'watch', 'lookup']);
  assert.deepEqual(states, ['connected']);
  assert.equal(socket.sent[2].codes[0], code);
  net.close();
});

test('first-run profile setup flushes pending friend lookups once a name exists', async () => {
  const id = 'bf0db7bd-5244-4a34-ae5d-43ec45c7f51c';
  const code = 'DRP-9876-5432-1ABC';
  let profile = { id, name: '', avatar: '' }, socket;
  class Socket {
    static OPEN = 1;
    static CLOSED = 3;
    constructor() { socket = this; this.readyState = 1; this.sent = []; this.bufferedAmount = 0; }
    send(m) { this.sent.push(JSON.parse(m)); }
    close() { this.readyState = 3; }
  }
  const sandbox = {
    window: { CONFIG: { SERVER_URL: 'wss://signal.example' }, DroplyWebStore: {
      profile: async () => ({ ...profile }),
      credential: async () => ({ token: 'A'.repeat(43), registered: true })
    } },
    WebSocket: Socket, URL, console, setTimeout, clearTimeout, Math
  };
  runInNewContext(source, sandbox, { timeout: 1000 });
  const net = sandbox.window.DroplyWebNetwork;
  await net.start();
  await new Promise(resolve => setImmediate(resolve));
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ t: 'authenticated', id }) });
  await new Promise(resolve => setImmediate(resolve));
  net.sendSignal({ t: 'watch', friends: [], codes: [code], notify: [] });
  net.sendSignal({ t: 'lookup', code });
  assert.deepEqual(socket.sent.map(x => x.t), ['auth']);
  profile = { ...profile, name: 'Ava' };
  net.sendSignal({ t: 'hello' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(socket.sent.map(x => x.t).slice(0, 4), ['auth', 'hello', 'watch', 'lookup']);
  assert.equal(socket.sent[1].name, 'Ava');
  net.close();
});

test('returning to a backgrounded tab refreshes the friend-code subscription immediately', async () => {
  const id = '96025c2c-bafd-4656-a1ea-a491b92232bc';
  const code = 'DRP-1234-5678-9ABC';
  let socket;
  const listeners = {};
  const doc = {
    visibilityState: 'visible',
    addEventListener: (name, fn) => { listeners[name] = fn; }
  };
  class Socket {
    static OPEN = 1;
    static CLOSED = 3;
    constructor() { socket = this; this.readyState = 1; this.sent = []; this.bufferedAmount = 0; }
    send(m) { this.sent.push(JSON.parse(m)); }
    close() { this.readyState = 3; }
  }
  const sandbox = {
    window: { CONFIG: { SERVER_URL: 'wss://signal.example' },
      addEventListener: (name, fn) => { listeners[name] = fn; },
      DroplyWebStore: {
        profile: async () => ({ id, name: 'Ava', avatar: '' }),
        credential: async () => ({ token: 'A'.repeat(43), registered: true })
      } },
    document: doc, WebSocket: Socket, URL, console, setTimeout, clearTimeout, Math
  };
  runInNewContext(source, sandbox, { timeout: 1000 });
  const net = sandbox.window.DroplyWebNetwork;
  net.on('server-event', event => {
    if (event.t === 'state' && event.state === 'connected')
      net.sendSignal({ t: 'watch', friends: [], codes: [code], notify: [] });
  });
  await net.start();
  await new Promise(resolve => setImmediate(resolve));
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ t: 'authenticated', id }) });
  await new Promise(resolve => setImmediate(resolve));
  const before = socket.sent.filter(x => x.t === 'watch').length;
  assert.ok(before >= 1);
  doc.visibilityState = 'hidden';
  listeners.visibilitychange();
  assert.equal(socket.sent.filter(x => x.t === 'watch').length, before);
  doc.visibilityState = 'visible';
  listeners.visibilitychange();
  assert.equal(socket.sent.filter(x => x.t === 'watch').length, before + 1);
  net.close();
});
