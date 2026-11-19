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
