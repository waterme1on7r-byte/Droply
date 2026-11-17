const { app, BrowserWindow, ipcMain, Notification, shell, session } = require('electron');
const path = require('path'), fs = require('fs'), crypto = require('crypto');

// Second instance: quit right away and don't run any of the setup below
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// Windows: tie the taskbar button/pins to this app (must match build.appId in package.json)
if (process.platform === 'win32') app.setAppUserModelId('com.droply.app');

// Window/taskbar icon: from resources when packaged, from build/ during development
const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
const iconPath = () => app.isPackaged ? path.join(process.resourcesPath, iconFile) : path.join(__dirname, 'build', iconFile);

let win, profile = { id: crypto.randomUUID(), name: '', avatar: '' };
const pf = () => path.join(app.getPath('userData'), 'profile.json');
// Atomic write (temp file + rename) so a crash mid-write can't corrupt the profile / lose the identity
function saveProfile() {
  try { const f = pf(), tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(profile)); fs.renameSync(tmp, f); }
  catch (err) { console.error('Could not save profile:', err); }
}
const okAvatar = a => a === '' || (typeof a === 'string' && a.length < 300000 && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(a));

const MAX_OPEN = 8;
const open = new Map();        // tid -> { ws, dest, fd }  (files currently being received)
const savedPaths = new Set();  // files we saved ourselves (the only ones "show in folder" may reveal)

// Only accept IPC coming from our own window
const fromUI = e => !!win && !win.isDestroyed() && e.sender === win.webContents;
const toUI = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

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

ipcMain.on('save-open', (e, tid, name) => {
  if (!fromUI(e) || typeof tid !== 'string') return;
  const prev = open.get(tid); if (prev) { open.delete(tid); removeFile(prev); }
  if (open.size >= MAX_OPEN) return toUI('save-error', { tid, message: 'Too many files open at once' });
  let made;
  try { made = createUnique(app.getPath('downloads'), safeName(name)); }
  catch (err) { console.error(err); return toUI('save-error', { tid, message: "Couldn't create the file in Downloads" }); }
  const ws = fs.createWriteStream(made.p, { fd: made.fd });
  const o = { ws, dest: made.p, fd: made.fd };
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
  // Wrap the received bytes instead of copying them a second time
  const buf = ArrayBuffer.isView(u8) ? Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength) : Buffer.from(u8);
  // Tell the renderer once the bytes are really written: it relays this to the sender as flow control
  o.ws.write(buf, err => { if (!err) toUI('save-wrote', { tid, n: buf.length }); });
});
ipcMain.on('save-close', (e, tid) => {
  if (!fromUI(e)) return;
  const o = open.get(tid); if (!o) return; open.delete(tid);
  o.ws.once('finish', () => {
    savedPaths.add(o.dest);
    const info = { tid, name: path.basename(o.dest), path: o.dest };
    toUI('saved', info);
    if (Notification.isSupported()) new Notification({ title: 'File received', body: info.name }).show();
  });
  o.ws.end();
});
// Transfer cancelled / failed: drop the half-written file
ipcMain.on('save-abort', (e, tid) => {
  if (!fromUI(e)) return;
  const o = open.get(tid); if (!o) return; open.delete(tid); removeFile(o);
});
// Free space in Downloads (null = unknown), so a transfer that can't fit is refused up front
ipcMain.handle('free-space', async e => {
  if (!fromUI(e)) return null;
  try { const st = await fs.promises.statfs(app.getPath('downloads')); return st.bavail * st.bsize; } catch { return null; }
});
ipcMain.on('show-file', (e, p) => { if (fromUI(e) && savedPaths.has(p)) shell.showItemInFolder(p); });

if (gotLock) app.whenReady().then(() => {
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
      if (okAvatar(p.avatar)) profile.avatar = p.avatar;
    }
  } catch (err) {
    // Unreadable profile: keep a copy instead of silently overwriting it with a new identity
    if (err.code !== 'ENOENT') { try { fs.copyFileSync(pf(), pf() + '.corrupt'); } catch {} }
  }
  saveProfile();

  // The app only needs notifications; refuse every other permission request
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'notifications'));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'notifications');

  win = new BrowserWindow({
    width: 780, height: 740, minWidth: 640, minHeight: 560, backgroundColor: '#0f1b2e', show: false, titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 16, y: 13 } } : { titleBarOverlay: { color: '#0e1523', symbolColor: '#9aa7bd', height: 40 } }),
    autoHideMenuBar: true, title: 'Droply', icon: iconPath(),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  // The window only ever shows our own local page: no popups, no navigating away
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) e.preventDefault(); });

  if (process.platform === 'darwin' && !app.isPackaged) { try { app.dock.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch {} }
  win.loadFile('index.html');
  // Windows'ta klavye odağı pencereye geçmeyebiliyor (özellikle installer'dan otomatik açılınca)
  win.once('ready-to-show', () => { win.show(); win.focus(); win.webContents.focus(); });
  win.on('focus', () => win.webContents.focus());
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
// Quitting mid-transfer: don't leave half-written files in Downloads
app.on('before-quit', () => {
  for (const o of open.values()) {
    o.ws.on('error', () => {});
    try { fs.closeSync(o.fd); } catch {}
    try { fs.unlinkSync(o.dest); } catch {}
  }
  open.clear();
});
