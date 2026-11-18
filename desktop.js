const fs = require('fs'), path = require('path'), os = require('os');
const DEFAULTS = { theme: 'dark', askSave: false, friendNotifications: true, incomingNotifications: true, completedNotifications: true, sounds: false, launchAtStartup: false, tray: false };
const MAX_TRANSFER_FILES = 1000, MAX_TRANSFER_BYTES = 1n << 40n;
const validTid = tid => typeof tid === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(tid);
const validManifest = files => Array.isArray(files) && files.length > 0 && files.length <= MAX_TRANSFER_FILES
  && files.every(f => f && typeof f.name === 'string' && f.name.length > 0 && f.name.length <= 1024
    && Number.isSafeInteger(f.size) && f.size >= 0 && f.size <= Number(MAX_TRANSFER_BYTES))
  && files.reduce((sum, f) => sum + BigInt(f.size), 0n) <= MAX_TRANSFER_BYTES;
function createDesktop({ app, ipcMain, dialog, shell, clipboard, fromUI, toUI, window: getWindow, safeName, log }) {
  const file = n => path.join(app.getPath('userData'), n + '.json');
  function read(n, fallback) { try { return JSON.parse(fs.readFileSync(file(n), 'utf8')); } catch { return fallback; } }
  function write(n, value) { const f = file(n); fs.writeFileSync(f + '.tmp', JSON.stringify(value)); fs.renameSync(f + '.tmp', f); }
  const raw = read('settings', {}) || {}, settings = { ...DEFAULTS, downloadDir: app.getPath('downloads') };
  for (const k of Object.keys(DEFAULTS)) if (typeof raw[k] === typeof DEFAULTS[k]) settings[k] = raw[k];
  settings.theme = settings.theme === 'light' ? 'light' : 'dark';
  if (typeof raw.downloadDir === 'string' && path.isAbsolute(raw.downloadDir)) settings.downloadDir = raw.downloadDir;
  let history = read('history', []); if (!Array.isArray(history)) history = [];
  history = history.slice(0, 300);
  const destinations = new Map();
  const handle = (name, fn) => ipcMain.handle(name, async (e, ...args) => { if (!fromUI(e)) return null; return fn(...args); });
  function appearance() { const win = getWindow(); if (win && process.platform !== 'darwin' && win.setTitleBarOverlay) win.setTitleBarOverlay({ color: settings.theme === 'light' ? '#f1f5fb' : '#0e1523', symbolColor: settings.theme === 'light' ? '#526079' : '#9aa7bd', height: 40 }); }
  handle('get-settings', () => ({ ...settings, startupSupported: app.isPackaged && ['win32', 'darwin'].includes(process.platform), version: app.getVersion ? app.getVersion() : 'dev' }));
  handle('save-settings', patch => {
    if (!patch || typeof patch !== 'object') throw Error('Invalid settings');
    const next = { ...settings };
    for (const k of Object.keys(DEFAULTS)) if (typeof patch[k] === typeof DEFAULTS[k]) next[k] = patch[k];
    if (!['dark', 'light'].includes(next.theme)) throw Error('Invalid theme');
    if (next.launchAtStartup !== settings.launchAtStartup) {
      if (!app.isPackaged || !['win32', 'darwin'].includes(process.platform)) throw Error('Startup is available in installed Windows and macOS builds.');
      app.setLoginItemSettings({ openAtLogin: next.launchAtStartup });
      next.launchAtStartup = app.getLoginItemSettings().openAtLogin;
    }
    write('settings', next); Object.assign(settings, next); appearance(); return settings;
  });
  handle('choose-downloads', async () => { const r = await dialog.showOpenDialog(getWindow(), { title: 'Choose download folder', defaultPath: settings.downloadDir, properties: ['openDirectory', 'createDirectory'] }); if (!r.canceled) { settings.downloadDir = r.filePaths[0]; write('settings', settings); } return settings.downloadDir; });
  handle('open-downloads', () => shell.openPath(settings.downloadDir));
  handle('prepare-receive', async (tid, files) => {
    if (!validTid(tid) || destinations.has(tid) || !validManifest(files) || destinations.size >= 10) return false;
    const names = files.map(f => f.name);
    let dir = settings.downloadDir;
    if (settings.askSave) { const r = await dialog.showOpenDialog(getWindow(), { title: 'Save incoming transfer to', defaultPath: dir, properties: ['openDirectory', 'createDirectory'] }); if (r.canceled) return false; dir = r.filePaths[0]; }
    // Isolate folder transfers inside an exclusively created directory; never walk existing folders.
    let root = null;
    if (names.some(n => typeof n === 'string' && n.includes('/'))) {
      for (const n of names) if (typeof n !== 'string' || n.split('/').some(p => !p || p === '.' || p === '..' || p.includes('\\'))) throw Error('Invalid folder path');
      for (let i = 0; i < 1000; i++) { const candidate = path.join(dir, i ? `DROPLY transfer (${i})` : 'DROPLY transfer'); try { fs.mkdirSync(candidate); root = candidate; break; } catch (e) { if (e.code !== 'EEXIST') throw e; } }
      if (!root) throw Error('Cannot create transfer folder');
    }
    destinations.set(tid, { dir, root, files: files.map(f => ({ name: f.name, size: f.size })), next: 0, started: 0n }); return true;
  });
  handle('finish-receive', tid => { destinations.delete(tid); });
  handle('get-history', () => history);
  handle('clear-history', () => { history = []; write('history', history); });
  function record(item) { history.unshift({ ...item, date: new Date().toISOString(), id: require('crypto').randomUUID() }); history = history.slice(0, 300); try { write('history', history); } catch (e) { log('Could not save transfer history', e); } toUI('history-changed', history); }
  handle('record-transfer', item => { if (!item || !['out', 'in'].includes(item.direction) || !['done', 'error', 'cancelled'].includes(item.state)) return; record({ name: String(item.name || '').slice(0, 240), peer: String(item.peer || '').slice(0, 40), direction: item.direction, state: item.state, message: String(item.message || '').slice(0, 160) }); });
  handle('history-file', (id, reveal) => { const item = history.find(h => h.id === id); if (!item || !item.path) return; return reveal ? shell.showItemInFolder(item.path) : shell.openPath(item.path); });
  handle('open-github', () => shell.openExternal('https://github.com/waterme1on7r-byte/Droply'));
  handle('open-log', () => { const p = path.join(app.getPath('userData'), 'droply.log'); fs.appendFileSync(p, ''); return shell.openPath(p); });
  handle('copy-diagnostics', () => { clipboard.writeText(`DROPLY ${app.getVersion()}\nOS: ${process.platform} ${os.release()} ${process.arch}\nElectron: ${process.versions.electron}\nTheme: ${settings.theme}\nBackground mode: ${settings.tray}`); return true; });
  return { settings, appearance, record, directory(tid) { return destinations.get(tid)?.dir || settings.downloadDir; }, target(tid, name, size) {
    const d = destinations.get(tid);
    const expected = d?.files[d.next];
    if (!d || !expected || expected.name !== name || expected.size !== size) throw Error('Unapproved file');
    d.next++;
    d.started += BigInt(size);
    if (d.started > MAX_TRANSFER_BYTES) throw Error('Transfer too large');
    if (!d.root) return { dir: d.dir, name: safeName(name), size };
    const parts = name.split('/').map(safeName), base = parts.pop(); let dir = d.root;
    if (fs.lstatSync(dir).isSymbolicLink()) throw Error('Unsafe destination');
    for (const part of parts) { dir = path.join(dir, part); try { fs.mkdirSync(dir); } catch (e) { if (e.code !== 'EEXIST') throw e; } const st = fs.lstatSync(dir); if (!st.isDirectory() || st.isSymbolicLink()) throw Error('Unsafe destination'); }
    return { dir, name: base, size };
  } };
}
module.exports = { createDesktop, DEFAULTS, MAX_TRANSFER_FILES, MAX_TRANSFER_BYTES, validTid, validManifest };
