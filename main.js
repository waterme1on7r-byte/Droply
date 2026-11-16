const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const path = require('path'), fs = require('fs'), crypto = require('crypto');

if (!app.requestSingleInstanceLock()) app.quit();

let win, profile = { id: crypto.randomUUID(), name: '', avatar: '' };
const pf = () => path.join(app.getPath('userData'), 'profile.json');
const saveProfile = () => fs.writeFileSync(pf(), JSON.stringify(profile));
const open = new Map();

function uniquePath(dir, name) {
  const ext = path.extname(name), base = path.basename(name, ext);
  let p = path.join(dir, name), n = 1;
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${n++})${ext}`);
  return p;
}

ipcMain.handle('get-profile', () => profile);
ipcMain.handle('save-profile', (_, p) => {
  profile.name = String(p.name || '').trim().slice(0, 24);
  if (p.avatar !== undefined) profile.avatar = p.avatar;
  saveProfile(); return profile;
});
ipcMain.on('save-open', (_, tid, name) => {
  const dest = uniquePath(app.getPath('downloads'), path.basename(String(name)) || 'dosya');
  open.set(tid, { ws: fs.createWriteStream(dest), dest });
});
ipcMain.on('save-chunk', (_, tid, u8) => { const o = open.get(tid); if (o) o.ws.write(Buffer.from(u8)); });
ipcMain.on('save-close', (_, tid) => {
  const o = open.get(tid); if (!o) return; open.delete(tid);
  o.ws.end(() => {
    const info = { name: path.basename(o.dest), path: o.dest };
    win && win.webContents.send('saved', info);
    if (Notification.isSupported()) new Notification({ title: 'Dosya alındı', body: info.name }).show();
  });
});
ipcMain.on('show-file', (_, p) => shell.showItemInFolder(p));

app.whenReady().then(() => {
  try { profile = { ...profile, ...JSON.parse(fs.readFileSync(pf(), 'utf8')) }; } catch {}
  saveProfile();
  win = new BrowserWindow({
    width: 900, height: 620, minWidth: 720, minHeight: 480, backgroundColor: '#0f1115', show: false,
    autoHideMenuBar: true, title: 'Yolla',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.loadFile('index.html');
  // Windows'ta klavye odağı pencereye geçmeyebiliyor (özellikle installer'dan otomatik açılınca)
  win.once('ready-to-show', () => { win.show(); win.focus(); win.webContents.focus(); });
  win.on('focus', () => win.webContents.focus());
});
app.on('second-instance', () => { if (win) { win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
