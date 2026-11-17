const { test } = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const { loadMain, tick } = require('./helpers');

test('saves a file, sanitises the name, never overwrites, reports the tid', async () => {
  const m = loadMain(); await m.ready();
  for (const t of ['a', 'b']) { m.h.on['save-open'](m.ev, t, '../../evil:name?.txt'); m.h.on['save-chunk'](m.ev, t, new Uint8Array([1, 2, 3])); m.h.on['save-close'](m.ev, t); }
  await tick(100);
  assert.deepStrictEqual(fs.readdirSync(m.dl).sort(), ['evil_name_ (1).txt', 'evil_name_.txt']);
  assert.deepStrictEqual([...fs.readFileSync(path.join(m.dl, 'evil_name_.txt'))], [1, 2, 3]);
  const saved = m.sent.filter(s => s[0] === 'saved'); assert.strictEqual(saved.length, 2);
  assert.deepStrictEqual(saved.map(s => s[1].tid).sort(), ['a', 'b']);
});
test('acknowledges written bytes (flow control)', async () => {
  const m = loadMain(); await m.ready();
  m.h.on['save-open'](m.ev, 'f', 'x.bin'); m.h.on['save-chunk'](m.ev, 'f', new Uint8Array(1000)); await tick(60);
  assert.deepStrictEqual(m.sent.find(s => s[0] === 'save-wrote')[1], { tid: 'f', n: 1000 });
});
test('dangerous / reserved names are neutralised', async () => {
  const m = loadMain(); await m.ready();
  for (const [i, n] of ['..', 'CON.txt', 'a'.repeat(400) + '.pdf', ''].entries()) m.h.on['save-open'](m.ev, 't' + i, n);
  await tick(60);
  const files = fs.readdirSync(m.dl); assert.strictEqual(files.length, 4);
  assert(files.includes('file') && files.includes('_CON.txt'));
  assert(files.every(f => f.length <= 210 && !f.includes('..')));
});
test('abort deletes the partial file', async () => {
  const m = loadMain(); await m.ready();
  m.h.on['save-open'](m.ev, 'x', 'partial.bin'); m.h.on['save-chunk'](m.ev, 'x', new Uint8Array(10)); await tick(30);
  assert(fs.existsSync(path.join(m.dl, 'partial.bin')));
  m.h.on['save-abort'](m.ev, 'x'); await tick(80);
  assert(!fs.existsSync(path.join(m.dl, 'partial.bin')));
});
test('ignores IPC from anything but our window', async () => {
  const m = loadMain(); await m.ready();
  m.h.on['save-open']({ sender: {} }, 'z', 'nope.txt'); await tick(30);
  assert.deepStrictEqual(fs.readdirSync(m.dl), []);
  assert.strictEqual(await m.h.handle['get-profile']({ sender: {} }), null);
});
test('unwritable Downloads reports an error instead of crashing', async () => {
  const m = loadMain({ downloads: path.join(require('os').tmpdir(), 'droply-does-not-exist', 'nope') }); await m.ready();
  m.h.on['save-open'](m.ev, 'e', 'a.txt'); await tick(30);
  assert.strictEqual(m.sent.find(s => s[0] === 'save-error')[1].tid, 'e');
});
test('limits how many files can be open at once', async () => {
  const m = loadMain(); await m.ready();
  for (let i = 0; i < 10; i++) m.h.on['save-open'](m.ev, 't' + i, `f${i}.bin`);
  await tick(50);
  assert.strictEqual(fs.readdirSync(m.dl).length, 8);
  assert.strictEqual(m.sent.filter(s => s[0] === 'save-error').length, 2);
});
test('profile: validates input, rejects non-image avatars', async () => {
  const m = loadMain(); await m.ready();
  const p = await m.h.handle['save-profile'](m.ev, { name: '  Ayşe  ', avatar: 'javascript:alert(1)' });
  assert.strictEqual(p.name, 'Ayşe'); assert.strictEqual(p.avatar, '');
  const q = await m.h.handle['save-profile'](m.ev, { name: 'x'.repeat(50), avatar: 'data:image/jpeg;base64,AAAA' });
  assert.strictEqual(q.name.length, 24); assert.strictEqual(q.avatar, 'data:image/jpeg;base64,AAAA');
  assert.strictEqual((await m.h.handle['save-profile'](m.ev, null)).name, q.name);
});
test('profile: corrupt file is backed up, not silently replaced', async () => {
  const m = loadMain({ profileRaw: '{not json' }); await m.ready();
  assert(fs.existsSync(path.join(m.ud, 'profile.json.corrupt')));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(m.ud, 'profile.json'), 'utf8')).name, '');
});
test('profile: keeps the identity across restarts', async () => {
  const m = loadMain({ profileRaw: JSON.stringify({ id: 'abc-123', name: 'Mehmet', avatar: '' }) }); await m.ready();
  assert.strictEqual((await m.h.handle['get-profile'](m.ev)).id, 'abc-123');
});
