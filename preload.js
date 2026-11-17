const { contextBridge, ipcRenderer } = require('electron');
const EVENTS = new Set(['saved', 'save-error', 'save-wrote']); // only these main→renderer channels are exposed
contextBridge.exposeInMainWorld('api', {
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  getProfile: () => ipcRenderer.invoke('get-profile'),
  saveProfile: p => ipcRenderer.invoke('save-profile', p),
  getFriends: () => ipcRenderer.invoke('get-friends'),
  saveFriends: x => ipcRenderer.invoke('save-friends', x),
  copy: t => ipcRenderer.send('copy', t),
  saveOpen: (tid, name) => ipcRenderer.send('save-open', tid, name),
  saveChunk: (tid, u8) => ipcRenderer.send('save-chunk', tid, u8),
  saveClose: tid => ipcRenderer.send('save-close', tid),
  saveAbort: tid => ipcRenderer.send('save-abort', tid),
  freeSpace: () => ipcRenderer.invoke('free-space'),
  showFile: p => ipcRenderer.send('show-file', p),
  on: (ch, fn) => { if (EVENTS.has(ch)) ipcRenderer.on(ch, (_, d) => fn(d)); }
});
