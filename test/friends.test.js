const { test, after } = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const { loadRenderer, loadMain, tick, cleanupAll } = require('./helpers');
const plain = x => JSON.parse(JSON.stringify(x));   // arrays from the renderer's vm context aren't reference-equal to ours
after(cleanupAll);

// A renderer instance with a given identity and no friends yet
const user = (id, name) => { const r = loadRenderer(); r.t.setMe(id, name); r.t.setPeers([{ id: 'x', name: 'x' }]); r.t.friends.length = 0; r.t.setRaw([]); r.sig.length = 0; return r; };
// Deliver what `from` sent to `to` (the signaling server just relays by id)
const relay = (from, fromId, to) => { const msgs = from.sig.splice(0).filter(m => m.t === 'sig' && m.to === to.t.me_id); msgs.forEach(m => to.t.onSig(fromId, m.data)); return msgs.map(m => m.data); };
const withId = (r, id) => { r.t.me_id = id; return r; };

test('device code: stable, well-formed, different per device, never reveals the id', async () => {
  const r = loadRenderer(), { t } = r;
  const a = await t.deviceCode('11111111-aaaa'), b = await t.deviceCode('22222222-bbbb');
  assert.match(a, /^DRP(-[0-9A-HJKMNP-TV-Z]{4}){3}$/); assert.notStrictEqual(a, b);
  assert.strictEqual(a, await t.deviceCode('11111111-aaaa'));
  assert(!a.replace(/-/g, '').toLowerCase().includes('1111'));
});
test('device code: typed variants are understood, junk is rejected', async () => {
  const { t } = loadRenderer(); const c = await t.deviceCode('abc');
  for (const v of [c, c.toLowerCase(), c.replace(/-/g, ''), '  ' + c + ' ', c.replace(/0/g, 'O')]) assert.strictEqual(t.normCode(v), c, v);
  for (const v of ['', 'hello', 'DRP-1234', c + 'X', 'DRP-UUUU-UUUU-UUUU', null]) assert.strictEqual(t.normCode(v), null, String(v));
});
test('adding by code: rejects invalid, own and duplicate codes', async () => {
  const a = user('alice', 'Alice'), t = a.t, mine = await t.deviceCode('alice');
  assert.strictEqual((await t.addByCode('nope')).ok, false);
  assert.match((await t.addByCode(mine)).msg, /own code/);
  const other = await t.deviceCode('bob');
  assert.strictEqual((await t.addByCode(other)).ok, true);
  assert.match((await t.addByCode(other)).msg, /already sent/);
  assert.deepStrictEqual(plain(t.pendOut), [{ code: other }]);
});
test('full handshake: request, accept, both sides become friends and can transfer', async () => {
  const A = withId(user('alice', 'Alice'), 'alice'), B = withId(user('bob', 'Bob'), 'bob');
  const codeB = await B.t.deviceCode('bob');
  A.t.setRaw([{ id: 'bob', name: 'Bob' }]);
  const res = await A.t.addByCode(codeB);
  assert.match(res.msg, /Request sent/);
  const msgs = relay(A, 'alice', B); assert(msgs.some(m => m.t === 'fr' && m.name === 'Alice'));
  await tick(20);
  assert.strictEqual(B.t.pendIn.length, 1); assert.strictEqual(B.t.friends.length, 0, 'not friends before accepting');
  B.t.setRaw([{ id: 'alice', name: 'Alice' }]);
  B.t.acceptReq('alice');
  assert.strictEqual(B.t.friends[0].name, 'Alice'); assert.strictEqual(B.t.pendIn.length, 0);
  A.t.setRaw([{ id: 'bob', name: 'Bob' }]);
  relay(B, 'bob', A); await tick(20);
  assert.strictEqual(A.t.friends.length, 1); assert.strictEqual(A.t.friends[0].id, 'bob'); assert.strictEqual(A.t.pendOut.length, 0);
  assert.strictEqual(A.t.friends[0].code, codeB);
  // both are connected the whole time: the new friend must show as online straight away, with no further server update
  assert.deepStrictEqual(plain(A.t.peers).map(p => p.id), ['bob'], 'requester sees friend online');
  assert.deepStrictEqual(plain(B.t.peers).map(p => p.id), ['alice'], 'accepter sees friend online');
  });
test('a request to someone offline is kept and delivered when they show up', async () => {
  const A = withId(user('alice', 'Alice'), 'alice'), code = await A.t.deviceCode('carol');
  A.t.setRaw([]); assert.match((await A.t.addByCode(code)).msg, /delivered as soon as/);
  assert(!A.sig.some(m => m.data.t === 'fr'));
  await A.t.setOnline([{ id: 'carol', name: 'Carol' }]);
  assert.strictEqual(A.sig.filter(m => m.to === 'carol' && m.data.t === 'fr').length, 1);
  await A.t.setOnline([{ id: 'carol', name: 'Carol' }]);   // list refreshed while she stays online: no duplicate
  assert.strictEqual(A.sig.filter(m => m.data.t === 'fr').length, 1);
});
test('both people add each other: matched without extra clicks', async () => {
  const A = withId(user('alice', 'Alice'), 'alice'), B = withId(user('bob', 'Bob'), 'bob');
  A.t.setRaw([{ id: 'bob', name: 'Bob' }]); B.t.setRaw([{ id: 'alice', name: 'Alice' }]);
  await A.t.addByCode(await B.t.deviceCode('bob'));          // A asks B
  await B.t.addByCode(await A.t.deviceCode('alice'));        // B asks A before seeing A's request
  relay(B, 'bob', A); await tick(20);                         // A receives B's request while A is waiting for B
  assert.strictEqual(A.t.friends.length, 1);
  relay(A, 'alice', B); await tick(20);
  assert.strictEqual(B.t.friends.length, 1);
});
test('declining: nothing is added and the requester is told', async () => {
  const A = withId(user('alice', 'Alice'), 'alice'), B = withId(user('bob', 'Bob'), 'bob');
  A.t.setRaw([{ id: 'bob', name: 'Bob' }]); await A.t.addByCode(await B.t.deviceCode('bob'));
  relay(A, 'alice', B); await tick(20); B.t.declineReq('alice'); relay(B, 'bob', A); await tick(20);
  assert.strictEqual(A.t.friends.length + B.t.friends.length, 0); assert.strictEqual(A.t.pendOut.length, 0);
});
test('a forged acceptance from someone we never asked is ignored', async () => {
  const { t } = user('alice', 'Alice');
  await t.friendSig('mallory', { t: 'fa' }); assert.strictEqual(t.friends.length, 0);
  await t.friendSig('mallory', { t: 'fx' }); await t.friendSig('mallory', { t: 'fd' }); assert.strictEqual(t.friends.length, 0);
});
test('only accepted friends are listed for transfers and can send files', async () => {
  const A = user('alice', 'Alice'), t = A.t;
  await t.friendSig('stranger', { t: 'fr', name: 'Stranger' });
  await t.setOnline([{ id: 'stranger', name: 'Stranger' }, { id: 'bob', name: 'Bob' }]);
  assert.deepStrictEqual(plain(t.peers), [], 'strangers are never shown or selectable');
  t.onSig('stranger', { t: 'req', tid: 'r1', from: 'Stranger', files: [{ name: 'a', size: 1 }] });
  assert.strictEqual(t.asks.length, 0); assert(A.sig.some(m => m.to === 'stranger' && m.data.t === 'rej'));
  t.acceptReq('stranger'); await t.setOnline([{ id: 'stranger', name: 'Stranger' }]);
  assert.deepStrictEqual(plain(t.peers).map(p => p.id), ['stranger']);
  t.onSig('stranger', { t: 'req', tid: 'r2', from: 'Stranger', files: [{ name: 'a', size: 1 }] });
  assert.strictEqual(t.asks.length, 1);
});
test('friends go offline when they leave and online when they return; names stay fresh', async () => {
  const { t } = user('alice', 'Alice');
  await t.friendSig('bob', { t: 'fr', name: 'Bob' }); t.acceptReq('bob');
  await t.setOnline([{ id: 'bob', name: 'Bobby' }]);
  assert.strictEqual(t.peers.length, 1); assert.strictEqual(t.friends[0].name, 'Bobby');
  await t.setOnline([]); assert.strictEqual(t.peers.length, 0); assert.strictEqual(t.friends.length, 1, 'still a friend while offline');
});
test('removing a friend: told right away if online, otherwise when they come back', async () => {
  const A = user('alice', 'Alice'), t = A.t;
  for (const id of ['bob', 'carol']) { await t.friendSig(id, { t: 'fr', name: id }); t.acceptReq(id); }
  await t.setOnline([{ id: 'bob', name: 'bob' }]); A.sig.length = 0;
  t.removeFriend('bob'); assert(A.sig.some(m => m.to === 'bob' && m.data.t === 'fx'));
  t.removeFriend('carol'); assert.deepStrictEqual(plain(t.gone), ['carol']);
  A.sig.length = 0; await t.setOnline([{ id: 'carol', name: 'carol' }]);
  assert(A.sig.some(m => m.to === 'carol' && m.data.t === 'fx')); assert.deepStrictEqual(plain(t.gone), []); assert.strictEqual(t.friends.length, 0);
});
test('being removed by a friend removes them from our list too', async () => {
  const { t } = user('alice', 'Alice');
  await t.friendSig('bob', { t: 'fr', name: 'Bob' }); t.acceptReq('bob'); await t.setOnline([{ id: 'bob', name: 'Bob' }]);
  await t.friendSig('bob', { t: 'fx' }); assert.strictEqual(t.friends.length, 0); assert.strictEqual(t.peers.length, 0);
});
test('incoming requests are limited and sanitised', async () => {
  const { t } = user('alice', 'Alice');
  for (let i = 0; i < 60; i++) await t.friendSig('u' + i, { t: 'fr', name: 'n'.repeat(100), av: 'javascript:alert(1)' });
  assert.strictEqual(t.pendIn.length, 50); assert.strictEqual(t.pendIn[0].name.length, 40); assert.strictEqual(t.pendIn[0].av, '');
});
test('friends are saved after every change', async () => {
  const A = user('alice', 'Alice'); await A.t.friendSig('bob', { t: 'fr', name: 'Bob' }); await tick(250);
  assert.strictEqual(A.stored.at(-1).inc.length, 1);
  A.t.acceptReq('bob'); await tick(250); assert.strictEqual(A.stored.at(-1).friends[0].id, 'bob'); assert.strictEqual(A.stored.at(-1).inc.length, 0);
});

// ---- main process ----
const code = c => 'DRP-' + c;
test('main: friends survive a restart and are validated', async () => {
  const m = loadMain(); await m.ready();
  const good = { id: 'bob-id', code: code('ABCD-EFGH-JKMN'), name: 'Bob', av: 'data:image/jpeg;base64,AAAA' };
  const saved = await m.h.handle['save-friends'](m.ev, {
    friends: [good, good, { id: 'x', code: 'bad', name: 'Bad' }, { id: '', code: good.code }, { id: 'e', code: code('ABCD-EFGH-JKMP'), name: 'E', av: 'javascript:1' }],
    inc: [{ ...good, id: 'inc-id' }], out: [{ code: good.code }, { code: 'nope' }], gone: ['g1', 5, 'g1']
  });
  assert.deepStrictEqual(plain(saved.friends).map(f => f.id), ['bob-id', 'e']); assert.strictEqual(saved.friends[1].av, '');
  assert.strictEqual(saved.inc.length, 1); assert.deepStrictEqual(plain(saved.out), [{ code: good.code }]); assert.deepStrictEqual(plain(saved.gone), ['g1']);
  const onDisk = JSON.parse(fs.readFileSync(path.join(m.ud, 'friends.json'), 'utf8')); assert.strictEqual(onDisk.friends.length, 2);
});
test('main: saved friends are loaded on start; a corrupt file is backed up, not lost', async () => {
  const good = { id: 'bob-id', code: code('ABCD-EFGH-JKMN'), name: 'Bob', av: '' };
  const m = loadMain({ friendsRaw: JSON.stringify({ friends: [good], inc: [], out: [], gone: [] }) }); await m.ready();
  assert.deepStrictEqual(plain((await m.h.handle['get-friends'](m.ev)).friends), [good]);
  const bad = loadMain({ friendsRaw: '{oops' }); await bad.ready();
  assert(fs.existsSync(path.join(bad.ud, 'friends.json.corrupt')));
  assert.deepStrictEqual(plain((await bad.h.handle['get-friends'](bad.ev)).friends), []);
});
test('main: friends IPC only answers our own window; clipboard only takes device codes', async () => {
  const m = loadMain(); await m.ready();
  assert.strictEqual(await m.h.handle['get-friends']({ sender: {} }), null);
  await m.h.handle['save-friends']({ sender: {} }, { friends: [{ id: 'z', code: code('ABCD-EFGH-JKMN'), name: 'Z' }] });
  assert.strictEqual(fs.existsSync(path.join(m.ud, 'friends.json')), false);
  m.h.on['copy'](m.ev, 'rm -rf /'); assert.strictEqual(m.h.copied, undefined);
  m.h.on['copy']({ sender: {} }, code('ABCD-EFGH-JKMN')); assert.strictEqual(m.h.copied, undefined);
  m.h.on['copy'](m.ev, code('ABCD-EFGH-JKMN')); assert.strictEqual(m.h.copied, code('ABCD-EFGH-JKMN'));
});
