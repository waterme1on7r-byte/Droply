const { test, after } = require('node:test'), assert = require('node:assert');
const { loadRenderer, tick, cleanupAll } = require('./helpers');
after(cleanupAll);
const req = (tid, files = [{ name: 'x', size: 1 }]) => ({ t: 'req', tid, from: 'Bob', files });
const fakeCh = (extra = {}) => { const sent = []; return Object.assign({ sent, send: m => sent.push(m), bufferedAmount: 0, readyState: 'open' }, extra); };

test('malformed signaling is ignored', () => {
  const r = loadRenderer(), { t } = r;
  for (const d of [null, 5, 'x', {}, { t: 'req' }, req('a', []), req('b', [{ name: 5, size: 1 }]), req('c', [{ name: 'x', size: -1 }]), req('d', [{ name: 'x', size: NaN }]),
    req('e', Array.from({ length: 1001 }, () => ({ name: 'x', size: 1 }))), { t: 'offer', tid: 'nope' }, { t: 'ice', tid: 'nope', c: {} }])
    t.onSig('bob', d);
  assert.strictEqual(t.asks.length, 0);
});
test('request limits: duplicate tid ignored, too many pending requests are declined', () => {
  const r = loadRenderer(), { t } = r;
  t.onSig('bob', req('dup')); t.onSig('bob', req('dup')); assert.strictEqual(t.asks.length, 1);
  for (let i = 0; i < 25; i++) t.onSig('bob', req('q' + i));
  assert.strictEqual(t.asks.length, 20);
  assert(r.sig.some(m => m.data.t === 'rej'));
});
test('sender cancels while waiting: peer is told, session removed', async () => {
  const r = loadRenderer(), { t } = r;
  await t.sendFiles([{ name: 'a.txt', size: 5 }]);
  const tid = Object.keys(t.sess)[0]; t.cancelTransfer(tid);
  assert(!t.sess[tid]); assert.strictEqual(r.state(tid), 'row cancelled');
  assert(r.sig.some(m => m.to === 'bob' && m.data.t === 'cancel' && m.data.tid === tid));
});
test('cannot send while disconnected', async () => {
  const r = loadRenderer(), { t } = r; t.setWs(false);
  await t.sendFiles([{ name: 'a.txt', size: 5 }]); assert.strictEqual(Object.keys(t.sess).length, 0);
});
test('sender cancels an unanswered request: the prompt disappears', () => {
  const r = loadRenderer(), { t } = r;
  t.onSig('bob', req('r1')); t.onSig('bob', { t: 'cancel', tid: 'r1' }); assert.strictEqual(t.asks.length, 0);
});
test('cancel only counts when it comes from the right peer', () => {
  const r = loadRenderer(), { t } = r;
  t.onSig('bob', req('r5')); t.answer(true);
  t.onSig('mallory', { t: 'cancel', tid: 'r5' }); assert(t.sess.r5);
  t.onSig('bob', { t: 'cancel', tid: 'r5' }); assert(!t.sess.r5); assert.strictEqual(r.state('r5'), 'row cancelled');
});
test('receiver cancel: partial file removed and sender told', () => {
  const r = loadRenderer(), { t } = r;
  t.onSig('bob', req('r4')); t.answer(true); r.sig.length = 0; t.cancelTransfer('r4');
  assert(r.aborts.includes('r4')); assert(r.sig.some(m => m.data.t === 'cancel' && m.data.tid === 'r4'));
});
test('not enough disk space: request is refused and the sender told why', async () => {
  const r = loadRenderer(), { t } = r; r.api.freeSpace = async () => 1e9;
  t.onSig('bob', req('big', [{ name: 'huge', size: 5e9 }])); t.answer(true); await tick();
  assert.strictEqual(r.state('big'), 'row error');
  assert(r.sig.some(m => m.data.t === 'cancel' && /disk space/.test(m.data.reason)));
  assert(!r.sig.some(m => m.data.t === 'acc'), 'must not accept');
});
test('enough disk space: request is accepted and advertises write-acks and folder paths (v3)', async () => {
  const r = loadRenderer(), { t } = r; r.api.freeSpace = async () => 500e9;
  t.onSig('bob', req('fit', [{ name: 'f', size: 5e6 }])); t.answer(true); await tick();
  assert(r.sig.some(m => m.data.t === 'acc' && m.data.v === 3));
});
test('cancelled while checking disk space: no accept is sent', async () => {
  const r = loadRenderer(), { t } = r; r.api.freeSpace = () => new Promise(res => setTimeout(() => res(500e9), 20));
  t.onSig('bob', req('race')); t.answer(true); t.onSig('bob', { t: 'cancel', tid: 'race' }); await tick(50);
  assert(!r.sig.some(m => m.data.t === 'acc'));
});
test('receiver: oversize data, unannounced files and incomplete files are rejected', () => {
  for (const evil of ['oversize', 'unannounced', 'incomplete', 'chunk-before-file']) {
    const r = loadRenderer(), { t } = r;
    t.onSig('bob', req('v', [{ name: 'ok.bin', size: 4 }])); t.answer(true);
    const ch = fakeCh(), s = t.sess.v; t.recv(s, ch);
    if (evil === 'oversize') { ch.onmessage({ data: JSON.stringify({ t: 'file', name: 'ok.bin', size: 4 }) }); ch.onmessage({ data: r.arrayBuffer(5) }); }
    if (evil === 'unannounced') ch.onmessage({ data: JSON.stringify({ t: 'file', name: 'other', size: 99 }) });
    if (evil === 'incomplete') { ch.onmessage({ data: JSON.stringify({ t: 'file', name: 'ok.bin', size: 4 }) }); ch.onmessage({ data: r.arrayBuffer(2) }); ch.onmessage({ data: JSON.stringify({ t: 'eof' }) }); }
    if (evil === 'chunk-before-file') ch.onmessage({ data: r.arrayBuffer(1) });
    assert.strictEqual(r.state('v'), 'row error', evil); assert(r.aborts.includes('v'), evil);
    assert(!r.saves.some(x => x[0] === 'close'), evil);
  }
});
test('receiver only confirms after the file is really on disk', () => {
  const r = loadRenderer(), { t } = r;
  t.onSig('bob', req('ok1', [{ name: 'a.bin', size: 3 }])); t.answer(true);
  const ch = fakeCh(), s = t.sess.ok1; t.recv(s, ch);
  ch.onmessage({ data: JSON.stringify({ t: 'file', name: 'a.bin', size: 3 }) }); ch.onmessage({ data: r.arrayBuffer(3) });
  ch.onmessage({ data: JSON.stringify({ t: 'eof' }) }); ch.onmessage({ data: JSON.stringify({ t: 'done' }) });
  assert(!ch.sent.includes('ok'), 'not yet: write may still be pending');
  r.handlers.saved({ tid: 'ok1', name: 'a.bin', path: '/x/a.bin' });
  assert(ch.sent.includes('ok')); assert.strictEqual(r.state('ok1'), 'row done');
  assert.strictEqual(t.transferCards.size, 1, 'saving must update the existing transfer, not create another card');
  assert.strictEqual(t.transferCards.get('ok1').path, '/x/a.bin');
});
test('terminal transfer cards clear after 30 seconds while active transfers stay', () => {
  const r = loadRenderer(), { t } = r, scheduled = [];
  r.ctx.setTimeout = (fn, delay) => { const timer = { fn, delay, unref() {} }; scheduled.push(timer); return timer; };
  for (const state of ['done', 'error', 'cancelled']) t.row(state, { state, label: state });
  t.row('active', { state: 'sending', label: 'still transferring' });
  assert.strictEqual(t.transferCards.size, 4);
  assert.strictEqual(scheduled.filter(timer => timer.delay === 30000).length, 3);
  for (const timer of scheduled) timer.fn();
  assert.strictEqual(t.transferCards.size, 1);
  assert(t.transferCards.has('active'));
});
test('new transfer cards are brought into view once, without scrolling on every progress update', () => {
  const r = loadRenderer(), scheduled = [], calls = [];
  r.ctx.window.requestAnimationFrame = callback => scheduled.push(callback);
  r.t.row('visible-receiver', { state: 'sending', label: 'received.bin' });
  const card = r.row('visible-receiver'); card.isConnected = true; card.scrollIntoView = options => calls.push(options);
  scheduled[0]();
  assert.strictEqual(calls.length, 1); assert.strictEqual(calls[0].block, 'nearest');
  r.t.row('visible-receiver', { state: 'sending', pct: 50 });
  r.t.row('visible-receiver', { state: 'done', msg: 'Received ✓', path: '/received.bin' });
  assert.strictEqual(scheduled.length, 1);
  assert.strictEqual(r.t.transferCards.size, 1);
});
test('disk error after "done" reaches the user instead of a fake success', () => {
  const r = loadRenderer(), { t } = r;
  t.onSig('bob', req('de', [{ name: 'a.bin', size: 1 }])); t.answer(true);
  const ch = fakeCh(), s = t.sess.de; t.recv(s, ch);
  ch.onmessage({ data: JSON.stringify({ t: 'file', name: 'a.bin', size: 1 }) }); ch.onmessage({ data: r.arrayBuffer(1) });
  ch.onmessage({ data: JSON.stringify({ t: 'eof' }) }); ch.onmessage({ data: JSON.stringify({ t: 'done' }) });
  r.handlers['save-error']({ tid: 'de', message: 'Disk is full' });
  assert(!ch.sent.includes('ok')); assert.strictEqual(r.state('de'), 'row error');
  assert(r.sig.some(m => m.data.t === 'cancel' && /Disk is full/.test(m.data.reason)));
});
test('interrupted transfer: sender fails cleanly and pump stops', async () => {
  const r = loadRenderer(), { t } = r;
  const s = { tid: 'ix', peerId: 'bob', peerName: 'Bob', dir: 'out', sent: 0, acked: 0, total: 1e6, files: [{ name: 'f', size: 1e6, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(65536) }) }] };
  t.sess.ix = s; const ch = fakeCh({ bufferedAmount: 5e6 });          // channel buffer is full -> pump waits
  const p = t.pump(s, ch); await tick(); t.fail(s, 'Connection lost'); await p;
  assert.strictEqual(r.state('ix'), 'row error'); assert(!t.sess.ix);
});
test('send window: sender pauses until the receiver acknowledges written data', async () => {
  const r = loadRenderer(), { t } = r;
  const size = 40 * 1024 * 1024;
  const s = { tid: 'win', peerId: 'bob', peerName: 'Bob', dir: 'out', win: true, sent: 0, acked: 0, total: size, files: [{ name: 'f', size, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(65536) }) }] };
  t.sess.win = s; const ch = fakeCh(); const p = t.pump(s, ch);
  await tick(200);
  assert(s.sent <= t.WIN + 65536 && s.sent >= t.WIN, 'paused at the window, sent=' + s.sent);
  const before = s.sent; s.acked = s.sent; s.wake(); await tick(200);   // receiver confirms -> sender continues
  assert(s.sent > before, 'resumed after ack');
  t.cancelTransfer('win'); await p;
});
test('old receivers (no write-acks) are not throttled by the window', async () => {
  const r = loadRenderer(), { t } = r;
  const size = 20 * 1024 * 1024;
  const s = { tid: 'old', peerId: 'bob', peerName: 'Bob', dir: 'out', win: false, sent: 0, acked: 0, total: size, files: [{ name: 'f', size, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(65536) }) }] };
  t.sess.old = s; await t.pump(s, fakeCh()); assert.strictEqual(s.sent, size);
});
test('accepted incoming transfer starts receiving without a second connection-code step', () => {
  const r = loadRenderer(), { t } = r;
  t.onSig('bob', req('plain', [{ name: 'a.bin', size: 1 }])); t.answer(true);
  const ch = fakeCh(), s = t.sess.plain; t.recv(s, ch);
  ch.onmessage({ data: JSON.stringify({ t: 'file', name: 'a.bin', size: 1 }) });
  assert(r.saves.some(x => x[0] === 'open' && x[1] === 'plain'));
  assert(!ch.sent.some(x => typeof x === 'string' && JSON.parse(x).t === 'verify'));
});
test('connected sender starts its transfer without fingerprint-code confirmation', async () => {
  const r = loadRenderer(), { t } = r;
  const ch = fakeCh(), file = { name: 'a.bin', size: 1, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(1) }) };
  const s = { tid: 'plain', peerId: 'bob', peerName: 'Bob', dir: 'out', open: true, ch, files: [file], sent: 0, acked: 0, total: 1 };
  t.sess.plain = s; t.maybeStartTransfer(s); await tick();
  assert.equal(s.pumping, true);
  assert(ch.sent.includes(JSON.stringify({ t: 'file', name: 'a.bin', size: 1 })));
  assert(ch.sent.includes(JSON.stringify({ t: 'done' })));
  assert(!ch.sent.some(x => typeof x === 'string' && JSON.parse(x).t === 'verify'));
});

test('a failed browser-to-Windows WebRTC connection reports relay configuration, not PNG rejection', () => {
  const r = loadRenderer();
  const vm = require('node:vm');
  const message = vm.runInContext('rtcConnectionError()', r.ctx);
  assert.match(message, /STUN only/);
  assert.match(message, /TURN relay/);
  assert.doesNotMatch(message, /PNG|invalid file format/i);
});
