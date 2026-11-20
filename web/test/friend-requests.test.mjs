import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
const start = html.indexOf('const sentFr = new Map();');
const end = html.indexOf('async function deviceCode(id)', start);
if (start < 0 || end < 0) throw Error('Friend delivery functions are missing from renderer');
const friendDelivery = html.slice(start, end);

test('pending friend requests retry quickly, but never flood an already-online recipient', () => {
  const code = 'DRP-1234-5678-9ABC', target = '6b8306e2-bfec-43af-ae20-bf8bd80d3655';
  let now = 50000, n = 0;
  const signals = [], timers = new Map();
  const sandbox = {
    Date: { now: () => now }, me: { name: 'Alice', avatar: '' }, pendOut: [{ code }],
    ws: { readyState: 1 },
    sig: (to, data) => signals.push({ to, data }),
    setTimeout(fn, ms) { const id = ++n; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  runInNewContext(friendDelivery + '\nthis.delivery = { sentFr, sendPendingFriendRequest, dropFinishedFriendRetries, resetFriendRetries };',
    sandbox, { timeout: 1000 });
  const api = sandbox.delivery;
  api.sendPendingFriendRequest(target, code);
  assert.equal(signals.length, 1);
  assert.deepEqual(signals[0].data.t, 'fr');
  assert.equal(signals[0].to, target);
  assert.equal(timers.size, 1);

  // Repeated presence announcements within two seconds must not spam.
  now += 200;
  api.sendPendingFriendRequest(target, code);
  assert.equal(signals.length, 1);

  const first = [...timers.entries()][0];
  assert.equal(first[1].ms, 3500);
  timers.delete(first[0]); now += 3600; first[1].fn();
  assert.equal(signals.length, 2);
  assert.equal(timers.size, 1);

  const second = [...timers.entries()][0];
  assert.equal(second[1].ms, 8000);
  timers.delete(second[0]); now += 8100; second[1].fn();
  assert.equal(signals.length, 3, 'Two bounded retries after the initial send');
  assert.equal(timers.size, 0, 'No unbounded background polling or retries');

  // A recipient that reconnects much later causes a new resolution event.
  now += 45000;
  api.sendPendingFriendRequest(target, code);
  assert.equal(signals.length, 4, 'A fresh resolution must resend even after the retry budget');

  sandbox.pendOut.length = 0; // Request has been accepted or cancelled.
  api.dropFinishedFriendRetries();
  assert.equal(api.sentFr.size, 0);
  now += 10000;
  api.sendPendingFriendRequest(target, code);
  assert.equal(signals.length, 4, 'No sends after the request is no longer pending');
  api.resetFriendRetries();
});

test('queued friend retries are cancelled on disconnect', () => {
  const code = 'DRP-9876-5432-1ABC';
  let id = 0;
  const timers = new Map(), signals = [];
  const sandbox = {
    Date: { now: () => 50000 }, me: { name: 'Alice', avatar: '' },
    pendOut: [{ code }], ws: { readyState: 1 },
    sig: (to, data) => signals.push({ to, data }),
    setTimeout(fn) { const value = ++id; timers.set(value, fn); return value; },
    clearTimeout(key) { timers.delete(key); }
  };
  runInNewContext(friendDelivery + '\nthis.delivery = { sentFr, sendPendingFriendRequest, resetFriendRetries };',
    sandbox, { timeout: 1000 });
  sandbox.delivery.sendPendingFriendRequest('target', code);
  assert.equal(timers.size, 1);
  sandbox.delivery.resetFriendRetries();
  assert.equal(timers.size, 0);
  assert.equal(sandbox.delivery.sentFr.size, 0);
});
