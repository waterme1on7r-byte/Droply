const { app, BrowserWindow, ipcMain, Notification, shell, session, dialog, clipboard, Tray, Menu, nativeImage, safeStorage, powerMonitor } = require('electron');
const path = require('path'), fs = require('fs'), crypto = require('crypto');

// Second instance: quit right away and don't run any of the setup below
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// Diagnostics: errors go to <userData>/droply.log (Windows: %APPDATA%\Droply\droply.log)
function log(...a) {
  const file = path.join(app.getPath('userData'), 'droply.log');
  try {
    const line = `${new Date().toISOString()} ${a.map(x => x && x.stack || String(x)).join(' ').slice(0, 16000)}\n`;
    const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (size + Buffer.byteLength(line) > 1024 * 1024) {
      const previous = file + '.1';
      try { fs.unlinkSync(previous); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      try { fs.renameSync(file, previous); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    fs.appendFileSync(file, line);
  } catch {}
}
process.on('unhandledRejection', e => log('unhandledRejection', e));
process.on('uncaughtException', e => { log('uncaughtException', e); try { dialog.showErrorBox('Droply error', String(e && e.stack || e)); } catch {} });

// Windows: tie the taskbar button/pins to this app (must match build.appId in package.json)
if (process.platform === 'win32') app.setAppUserModelId('com.droply.app');

// Window/taskbar icon: from resources when packaged, from build/ during development
const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
const iconPath = () => app.isPackaged ? path.join(process.resourcesPath, iconFile) : path.join(__dirname, 'build', iconFile);

let desktop, tray, quitting = false;
let win, profile = { id: crypto.randomUUID(), name: '', avatar: '' };
function showMainWindow() {
  if (!win || win.isDestroyed()) return;
  try {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.setSkipTaskbar(false);
    if (process.platform === 'darwin') app.show();
    win.focus(); win.webContents.focus();
  } catch (e) { log('Could not restore main window', e); }
}
const pf = () => path.join(app.getPath('userData'), 'profile.json');
// Atomic write (temp file + rename) so a crash mid-write can't corrupt the profile / lose the identity
function saveProfile() {
  try { const f = pf(), tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(profile)); fs.renameSync(tmp, f); }
  catch (err) { console.error('Could not save profile:', err); }
}
const avatarPattern = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const okAvatar = a => a === '' || (typeof a === 'string' && a.length < 60000 && avatarPattern.test(a));
const okStoredAvatar = a => a === '' || (typeof a === 'string' && a.length < 300000 && avatarPattern.test(a));

// ---- Friends: stored per installation in <userData>/friends.json (deleted with the app data on uninstall) ----
const ff = () => path.join(app.getPath('userData'), 'friends.json');
const CODE_RE = /^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const okId = x => typeof x === 'string' && x.length > 0 && x.length <= 64;
const okFriendAv = a => okAvatar(a) && a.length < 60000;
const nm = x => Array.from(String(x || '').trim()).slice(0, 40).join('');
const cap = (a, n) => (Array.isArray(a) ? a : []).slice(0, n);
function cleanPerson(x) {
  if (!x || typeof x !== 'object' || !okId(x.id) || !CODE_RE.test(x.code)) return null;
  return { id: x.id, code: x.code, name: nm(x.name) || 'Friend', av: okFriendAv(x.av) ? x.av : '' };
}
function cleanSocial(x) {
  x = x && typeof x === 'object' ? x : {};
  const uniq = (list, key) => { const seen = new Set(); return list.filter(i => i && !seen.has(i[key]) && seen.add(i[key])); };
  return {
    friends: uniq(cap(x.friends, 200).map(cleanPerson), 'id'),
    inc: uniq(cap(x.inc, 50).map(cleanPerson), 'id'),
    out: uniq(cap(x.out, 100).filter(o => o && CODE_RE.test(o.code)).map(o => ({ code: o.code })), 'code'),
    gone: [...new Set(cap(x.gone, 200).filter(okId))]
  };
}
let social = cleanSocial();
function saveSocial() {
  try { const f = ff(), tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(social)); fs.renameSync(tmp, f); }
  catch (err) { console.error('Could not save friends:', err); }
}

const MAX_OPEN = 8;
const open = new Map();        // tid -> { ws, dest, fd }  (files currently being received)
const MAX_CHUNK_BYTES = 256 * 1024, MAX_PENDING_PER_TRANSFER = 64 * 1024 * 1024, MAX_PENDING_TOTAL = 512 * 1024 * 1024;
let pendingSaveBytes = 0;
const pendingByTransfer = new Map();
const savedPaths = new Set();  // files we saved ourselves (the only ones "show in folder" may reveal)

// Only accept IPC coming from our own window
const fromUI = e => !!win && !win.isDestroyed() && e.sender === win.webContents;
const toUI = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
const pendingDialogs = new Map(); let dialogId = 0;
function showAppDialog(options = {}) {
  const id = ++dialogId;
  return new Promise(resolve => {
    const buttons = Array.isArray(options.buttons) && options.buttons.length ? options.buttons.slice(0, 4) : ['OK'];
    pendingDialogs.set(id, { resolve, count: buttons.length });
    toUI('app-dialog', { id, title: options.title || 'Droply', message: options.message || '', detail: options.detail || '', buttons });
  });
}
ipcMain.handle('dialog-response', (e, id, response) => {
  if (!fromUI(e) || !Number.isSafeInteger(id) || !pendingDialogs.has(id)) return false;
  const pending = pendingDialogs.get(id); pendingDialogs.delete(id);
  const choice = Number.isInteger(response) && response >= 0 && response < pending.count ? response : 0;
  pending.resolve({ response: choice });
  return true;
});

// The file name comes from the other person: never trust it as a path
function safeName(name) {
  let n = path.basename(String(name || '')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim();
  if (!n || /^\.+$/.test(n)) n = 'file';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(n)) n = '_' + n; // reserved names on Windows
  if (n.length > 200) { const ext = path.extname(n).slice(0, 20); n = n.slice(0, 200 - ext.length) + ext; }
  return n;
}
// Create the file exclusively ('wx') so two transfers can never grab the same name (no check-then-write race)
function createUnique(dir, name) {
  const ext = path.extname(name), base = path.basename(name, ext);
  for (let n = 0; n < 1000; n++) {
    const p = path.join(dir, n ? `${base} (${n})${ext}` : name);
    try { return { fd: fs.openSync(p, 'wx'), p }; }
    catch (err) { if (err.code !== 'EEXIST') throw err; }
  }
  throw new Error('No free file name');
}
// Stop writing and delete the partial file (after the descriptor is closed, which Windows requires)
function removeFile(o) {
  const rm = () => fs.unlink(o.dest, () => {});
  if (o.ws.closed) rm(); else { o.ws.once('close', rm); o.ws.destroy(); }
}

ipcMain.handle('get-profile', e => fromUI(e) ? profile : null);
ipcMain.handle('save-profile', (e, p) => {
  if (!fromUI(e) || !p || typeof p !== 'object') return profile;
  const name = Array.from(String(p.name || '').trim()).slice(0, 24).join('');
  if (name) profile.name = name;
  if (p.avatar !== undefined && okAvatar(p.avatar)) profile.avatar = p.avatar;
  saveProfile(); return profile;
});

ipcMain.handle('get-friends', e => fromUI(e) ? social : null);
ipcMain.handle('save-friends', (e, x) => { if (fromUI(e)) { social = cleanSocial(x); saveSocial(); } return social; });
// Clipboard: only device codes can be copied (the page itself has no clipboard permission)
ipcMain.on('notify', (e, kind, body) => {
  const key = { friend: 'friendNotifications', incoming: 'incomingNotifications', completed: 'completedNotifications' }[kind];
  if (fromUI(e) && key && desktop.settings[key] && typeof body === 'string' && Notification.isSupported()) new Notification({ title: 'DROPLY', body: body.slice(0, 240), silent: !desktop.settings.sounds }).show();
});
ipcMain.on('copy', (e, text) => { if (fromUI(e) && typeof text === 'string' && CODE_RE.test(text)) clipboard.writeText(text); });

ipcMain.on('save-open', (e, tid, name, size) => {
  if (!fromUI(e) || typeof tid !== 'string') return;
  if (open.has(tid)) {
    const prev = open.get(tid); open.delete(tid); removeFile(prev);
    return toUI('save-error', { tid, message: 'Unexpected file sequence' });
  }
  if (open.size >= MAX_OPEN) return toUI('save-error', { tid, message: 'Too many files open at once' });
  let made;
  try { const target = desktop.target(tid, name, size); made = createUnique(target.dir, target.name); }
  catch (err) { console.error(err); return toUI('save-error', { tid, message: "Couldn't create the file in Downloads" }); }
  const ws = fs.createWriteStream(made.p, { fd: made.fd });
  const o = { ws, dest: made.p, fd: made.fd, size, received: 0 };
  // Without this handler a disk-full / permission error would crash the whole app
  ws.on('error', err => {
    console.error('Write failed:', err);
    if (open.get(tid) === o) open.delete(tid);
    removeFile(o);
    toUI('save-error', { tid, message: err.code === 'ENOSPC' ? 'Disk is full' : "Couldn't write the file" });
  });
  open.set(tid, o);
});
ipcMain.on('save-chunk', (e, tid, u8) => {
  if (!fromUI(e)) return;
  const o = open.get(tid); if (!o || !u8) return;
  if (!(ArrayBuffer.isView(u8) && u8.BYTES_PER_ELEMENT === 1) && !(u8 instanceof ArrayBuffer)) {
    open.delete(tid); removeFile(o); return toUI('save-error', { tid, message: 'Invalid file data' });
  }
  // Wrap the received bytes instead of copying them a second time.
  const buf = ArrayBuffer.isView(u8) ? Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength) : Buffer.from(u8);
  const transferPending = pendingByTransfer.get(tid) || 0;
  if (!buf.length || buf.length > MAX_CHUNK_BYTES || buf.length > o.size - o.received
      || pendingSaveBytes + buf.length > MAX_PENDING_TOTAL
      || transferPending + buf.length > MAX_PENDING_PER_TRANSFER) {
    open.delete(tid); o.failed = true; removeFile(o); return toUI('save-error', { tid, message: 'Transfer exceeded its safe receive limits' });
  }
  o.received += buf.length;
  pendingSaveBytes += buf.length; pendingByTransfer.set(tid, transferPending + buf.length);
  // Tell the renderer once the bytes are really written: it relays this to the sender as flow control
  o.ws.write(buf, err => {
    pendingSaveBytes = Math.max(0, pendingSaveBytes - buf.length);
    const left = Math.max(0, (pendingByTransfer.get(tid) || 0) - buf.length);
    if (left) pendingByTransfer.set(tid, left); else pendingByTransfer.delete(tid);
    if (!err && !o.failed) toUI('save-wrote', { tid, n: buf.length });
  });
});
ipcMain.on('save-close', (e, tid) => {
  if (!fromUI(e)) return;
  const o = open.get(tid); if (!o) return;
  if (o.received !== o.size) {
    open.delete(tid); o.failed = true; removeFile(o);
    return toUI('save-error', { tid, message: 'Received file did not match its approved size' });
  }
  open.delete(tid);
  o.ws.once('finish', () => {
    savedPaths.add(o.dest);
    const info = { tid, name: path.basename(o.dest), path: o.dest };
    desktop.record({ name: info.name, path: info.path, direction: 'in', state: 'done' });
    toUI('saved', info);
    if (desktop.settings.completedNotifications && Notification.isSupported()) new Notification({ title: 'File received', body: info.name, silent: !desktop.settings.sounds }).show();
  });
  o.ws.end();
});
// Transfer cancelled / failed: drop the half-written file
ipcMain.on('save-abort', (e, tid) => {
  if (!fromUI(e)) return;
  const o = open.get(tid); if (!o) return; open.delete(tid); o.failed = true; removeFile(o);
});
// Free space in Downloads (null = unknown), so a transfer that can't fit is refused up front
ipcMain.handle('free-space', async (e, tid) => {
  if (!fromUI(e)) return null;
  try { const st = await fs.promises.statfs(desktop.directory(tid)); return st.bavail * st.bsize; } catch { return null; }
});
ipcMain.on('show-file', (e, p) => { if (fromUI(e) && savedPaths.has(p)) shell.showItemInFolder(p); });

function start() {
  desktop = require('./desktop').createDesktop({ app, ipcMain, dialog, shell, clipboard, fromUI, toUI, window: () => win, safeName, log });
  // Eski 'Yolla' sürümünden profili taşı
  try {
    const prev = path.join(app.getPath('appData'), 'Yolla', 'profile.json');
    if (!fs.existsSync(pf()) && fs.existsSync(prev)) fs.copyFileSync(prev, pf());
  } catch {}
  try {
    const p = JSON.parse(fs.readFileSync(pf(), 'utf8'));
    if (p && typeof p === 'object') {
      if (typeof p.id === 'string' && p.id) profile.id = p.id;
      if (typeof p.name === 'string') profile.name = p.name.slice(0, 24);
      if (okStoredAvatar(p.avatar)) profile.avatar = p.avatar;
    }
  } catch (err) {
    // Unreadable profile: keep a copy instead of silently overwriting it with a new identity
    if (err.code !== 'ENOENT') { try { fs.copyFileSync(pf(), pf() + '.corrupt'); } catch {} }
  }
  saveProfile();
  try { social = cleanSocial(JSON.parse(fs.readFileSync(ff(), 'utf8'))); }
  catch (err) { if (err.code !== 'ENOENT') { try { fs.copyFileSync(ff(), ff() + '.corrupt'); } catch {} } }

  // The app only needs notifications; refuse every other permission request
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'notifications'));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'notifications');

  win = new BrowserWindow({
    width: 780, height: 740, minWidth: 640, minHeight: 560, backgroundColor: '#0f1b2e', show: false, titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 16, y: 13 } } : process.platform === 'win32' ? { frame: false, thickFrame: true } : { titleBarOverlay: { color: '#0e1523', symbolColor: '#9aa7bd', height: 40 } }),
    autoHideMenuBar: true, title: 'Droply', icon: iconPath(),
    // Friend invitations must be processed even if Droply is hidden in the tray.
    // Electron otherwise throttles background renderer execution.
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  ipcMain.handle('get-window-chrome', e => fromUI(e) ? { custom: process.platform === 'win32', rightControls: process.platform !== 'darwin', maximized: win.isMaximized() } : null);
  ipcMain.handle('window-control', (e, action) => {
    if (!fromUI(e) || !['minimize', 'toggle-maximize', 'close'].includes(action)) return false;
    if (action === 'minimize') win.minimize();
    else if (action === 'toggle-maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    else win.close();
    return true;
  });
  win.on('maximize', () => toUI('window-state', { maximized: true }));
  win.on('unmaximize', () => toUI('window-state', { maximized: false }));
  const accessConfig = { window: {} };
  require('vm').runInNewContext(fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8'), accessConfig, { timeout: 1000 });
  const nativeAccess = require('./access').createAccess({ app, ipcMain, safeStorage, fromUI, toUI, getProfile: () => profile, serverURL: accessConfig.window.CONFIG.SERVER_URL });
  // An OS sleep or network change may leave a WebSocket appearing connected.
  // Refresh signaling immediately on wake, and test it when the window returns.
  powerMonitor.on('resume', () => nativeAccess.resume());
  desktop.appearance();
  function ensureTray() {
    if (tray || !desktop.settings.tray) return;
    try {
      tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 20, height: 20 }));
      tray.setToolTip('DROPLY');
      tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open DROPLY', click: showMainWindow }, { label: 'Quit DROPLY', click: () => app.quit() }]));
      tray.on('double-click', showMainWindow); tray.on('click', showMainWindow);
    } catch (e) { log('tray unavailable', e); }
  }
  ensureTray();
  win.on('close', e => { if (!quitting && desktop.settings.tray) { ensureTray(); if (tray) { e.preventDefault(); win.hide(); } } });
  // The window only ever shows our own local page: no popups, no navigating away
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) e.preventDefault(); });

  if (process.platform === 'darwin' && !app.isPackaged) { try { app.dock.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch {} }
  // Show the window as soon as it has painted, but never stay invisible: also show on load failure / crash / after 4 s
  let shown = false;
  const show = () => { if (shown || !win || win.isDestroyed()) return; shown = true; win.show(); win.focus(); win.webContents.focus(); };
  win.once('ready-to-show', show);
  const t = setTimeout(show, 4000); if (t.unref) t.unref();
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain) { log('did-fail-load', code, desc, url); show(); } });
  win.webContents.on('render-process-gone', (_e, d) => { log('render-process-gone', JSON.stringify(d)); show(); });
  win.webContents.on('preload-error', (_e, file, err) => log('preload-error', file, err));
  const updates = require('./updater').createUpdater({
    app, showDialog: showAppDialog, onStatus: status => toUI('update-status', status), getUpdater: () => require('electron-updater').autoUpdater, log,
    isBusy: async () => {
      if (open.size) return true;
      try { return await win.webContents.executeJavaScript('Object.keys(sess).length > 0 || asks.length > 0'); }
      catch { return true; }
    }
  });
  ipcMain.handle('check-updates', e => fromUI(e) ? updates.check(true) : undefined);
  win.webContents.once('did-finish-load', () => updates.start());
  win.loadFile(path.join(__dirname, 'index.html')).catch(err => { log('loadFile failed', err); show(); });
  // Windows'ta klavye odağı pencereye geçmeyebiliyor (özellikle installer'dan otomatik açılınca)
  win.on('focus', () => { win.webContents.focus(); nativeAccess.checkConnection(); });
}
if (gotLock) app.whenReady().then(start).catch(err => {
  log('startup failed', err);
  try { dialog.showErrorBox('Droply could not start', String(err && err.stack || err)); } catch {}
  app.quit();
});
app.on('second-instance', showMainWindow);
app.on('activate', showMainWindow);
app.on('window-all-closed', () => app.quit());
// Quitting mid-transfer: don't leave half-written files in Downloads
app.on('before-quit', () => {
  quitting = true;
  for (const o of open.values()) {
    o.ws.on('error', () => {});
    try { fs.closeSync(o.fd); } catch {}
    try { fs.unlinkSync(o.dest); } catch {}
  }
  open.clear();
});
