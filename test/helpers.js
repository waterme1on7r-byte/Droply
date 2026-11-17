// Test helpers: load main.js with a fake `electron`, and index.html's script inside a stubbed DOM.
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), Module = require('module');

function loadMain({ profileRaw, downloads } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'droply-'));
  const dl = downloads || path.join(root, 'dl'), ud = path.join(root, 'ud');
  fs.mkdirSync(ud, { recursive: true }); if (!downloads) fs.mkdirSync(dl);
  if (profileRaw !== undefined) fs.writeFileSync(path.join(ud, 'profile.json'), profileRaw);
  const h = { on: {}, handle: {}, sent: [] };
  const wc = { send: (c, d) => h.sent.push([c, d]), setWindowOpenHandler() {}, on() {}, getURL: () => 'x', focus() {} };
  class BW { constructor() { this.webContents = wc; } isDestroyed() { return false; } loadFile() {} once() {} on() {} show() {} focus() {} }
  const electron = {
    app: { requestSingleInstanceLock: () => true, quit() {}, setAppUserModelId() {}, getPath: n => n === 'downloads' ? dl : ud, on() {}, whenReady: () => Promise.resolve(), isPackaged: false },
    BrowserWindow: BW, ipcMain: { on: (c, f) => (h.on[c] = f), handle: (c, f) => (h.handle[c] = f) },
    Notification: class { static isSupported() { return false; } }, shell: {}, dialog: { showErrorBox() {} },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } }
  };
  const orig = Module._load;
  Module._load = (req, ...a) => req === 'electron' ? electron : orig(req, ...a);
  const file = require.resolve('../main.js'); delete require.cache[file];
  try { require(file); } finally { Module._load = orig; }
  return { h, ev: { sender: wc }, dl, ud, sent: h.sent, ready: () => new Promise(r => setTimeout(r, 30)) };
}

function mkEl() {
  return { classList: { add() {}, remove() {}, toggle() {}, contains: () => true }, style: {}, _q: {}, textContent: '', className: '',
    querySelector(sel) { return this._q[sel] || (this._q[sel] = mkEl()); }, appendChild() {}, prepend() {}, append() {}, replaceWith() {}, remove() {},
    click() {}, focus() {}, addEventListener() {} };
}
const all = [];
// end every session so no watchdog/timeout timers keep the test process alive
function cleanupAll() { for (const t of all) for (const s of Object.values(t.sess)) t.fail(s, 'test over'); }
function loadRenderer() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  let js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  js = js.slice(0, js.lastIndexOf('(async () => {'));            // skip the bootstrap IIFE; tests drive the state
  const created = [], sentSig = [], aborts = [], handlers = {}, saves = [];
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, Promise, Array, Object, Set, Number, String, Uint8Array, DataView, TextEncoder, encodeURIComponent,
    window: { CONFIG: { SERVER_URL: 'ws://x', KEY: 'k', ICE: [] }, addEventListener() {} },
    document: { querySelector: () => mkEl(), getElementById: id => created.find(e => e.id === id) || null, createElement: () => { const e = mkEl(); created.push(e); return e; }, addEventListener() {} },
    crypto: { randomUUID: () => 'tid-' + Math.random().toString(36).slice(2) }, Notification: function () { throw new Error('denied'); },
    api: { saveOpen: (t, n) => saves.push(['open', t, n]), saveChunk: (t, u) => saves.push(['chunk', t, u.length]), saveClose: t => saves.push(['close', t]),
      saveAbort: t => aborts.push(t), showFile() {}, freeSpace: async () => null, on: (c, f) => (handlers[c] = f) },
    WebSocket: function () {}, RTCPeerConnection: function () { this.close = () => {}; }, Image: function () {}, File: function () {}, URL: { createObjectURL() {} }
  };
  vm.createContext(ctx);
  vm.runInContext(js + `
;globalThis.__t = { sess, asks, fail, cancelTransfer, onSig, answer, recv, pump, maybeFinish, showCode, WIN,
  setMe: () => { me = { id: 'me', name: 'Me' }; },
  setPeers: p => { peers = p; sel = p[0].id; },
  setWs: ok => { ws = { readyState: ok ? 1 : 3, send: m => __sig.push(JSON.parse(m)) }; },
  sendFiles };`, ctx);
  ctx.__sig = sentSig;
  const t = ctx.__t; t.setMe(); t.setWs(true); t.setPeers([{ id: 'bob', name: 'Bob' }]);
  all.push(t);
  const row = id => created.find(e => e.id === id);
  return { t, ctx, api: ctx.api, sig: sentSig, aborts, handlers, saves, row, state: id => row(id) && row(id).className, text: id => row(id) && row(id)._q['.st'] && row(id)._q['.st'].textContent };
}
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));
module.exports = { loadMain, loadRenderer, tick, cleanupAll };
