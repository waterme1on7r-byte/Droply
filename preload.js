const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getProfile: () => ipcRenderer.invoke('get-profile'),
  saveProfile: p => ipcRenderer.invoke('save-profile', p),
  saveOpen: (tid, name) => ipcRenderer.send('save-open', tid, name),
  saveChunk: (tid, u8) => ipcRenderer.send('save-chunk', tid, u8),
  saveClose: tid => ipcRenderer.send('save-close', tid),
  showFile: p => ipcRenderer.send('show-file', p),
  on: (ch, fn) => ipcRenderer.on(ch, (_, d) => fn(d))
});
