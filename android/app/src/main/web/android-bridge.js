(() => {
  'use strict';
  const native = window.DroplyAndroid;
  if (!native) return;

  let nextId = 0;
  const pending = new Map(), listeners = new Map();
  const parse = value => { try { return JSON.parse(value); } catch { return null; } };
  const asyncCall = (method, args = []) => new Promise((resolve, reject) => {
    const id = String(++nextId); pending.set(id, { resolve, reject });
    try { native[method](JSON.stringify(args), id); } catch (error) { pending.delete(id); reject(error); }
  });

  window.__droplyAndroidResolve = (id, value, error) => {
    const item = pending.get(String(id)); if (!item) return;
    pending.delete(String(id));
    if (error) item.reject(new Error(error)); else item.resolve(value);
  };
  window.__droplyAndroidEvent = raw => {
    const event = parse(raw); if (!event || typeof event.t !== 'string') return;
    for (const listener of listeners.get(event.t) || []) { try { listener(event.data); } catch {} }
  };
  window.__droplyAndroidFolder = raw => {
    const files = parse(raw); if (!Array.isArray(files) || typeof window.sendFiles !== 'function') return;
    const decode = text => {
      const binary = atob(text), out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
      return out.buffer;
    };
    const selected = files.map(item => ({
      name: String(item.name || '').split('/').pop(), size: Number(item.size), droplyPath: String(item.name || ''),
      slice(start, end) { const uri = String(item.uri || ''), from = Math.max(0, Number(start) || 0), count = Math.max(0, Math.min(65536, (Number(end) || 0) - from)); return { arrayBuffer: async () => decode(native.readFileChunk(uri, from, count)) }; }
    }));
    window.sendFiles(selected);
  };

  const json = value => parse(value) || {};
  const toBase64 = bytes => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  window.api = {
    getWindowChrome: async () => ({ custom: false, rightControls: false }),
    windowControl: async () => false,
    getAccess: async () => json(native.getAccess()),
    enrollDevice: invitation => asyncCall('enrollDevice', [invitation]),
    connectServer: async () => json(native.connectServer()),
    sendSignal: message => native.sendSignal(JSON.stringify(message)),
    notify: (kind, body) => native.notify(String(kind || ''), String(body || '')),
    getSettings: async () => json(native.getSettings()),
    saveSettings: async patch => json(native.saveSettings(JSON.stringify(patch))),
    chooseDownloads: () => asyncCall('chooseDownloads'),
    openDownloads: () => asyncCall('openDownloads'),
    prepareReceive: (tid, files) => asyncCall('prepareReceive', [tid, files]),
    finishReceive: tid => native.finishReceive(String(tid)),
    getHistory: async () => json(native.getHistory()),
    clearHistory: async () => native.clearHistory(),
    recordTransfer: item => native.recordTransfer(JSON.stringify(item)),
    historyFile: (id, reveal) => asyncCall('historyFile', [id, !!reveal]),
    openGithub: () => native.openGithub(),
    openLog: () => native.openLog(),
    copyDiagnostics: async () => native.copyDiagnostics(),
    checkUpdates: () => native.checkUpdates(),
    dialogResponse: async () => false,
    getProfile: async () => json(native.getProfile()),
    saveProfile: async profile => json(native.saveProfile(JSON.stringify(profile))),
    getFriends: async () => json(native.getFriends()),
    saveFriends: data => native.saveFriends(JSON.stringify(data)),
    copy: text => native.copy(String(text || '')),
    saveOpen: (tid, name, size) => native.saveOpen(String(tid), String(name), Number(size)),
    saveChunk: (tid, bytes) => native.saveChunk(String(tid), toBase64(bytes)),
    saveClose: tid => native.saveClose(String(tid)),
    saveAbort: tid => native.saveAbort(String(tid)),
    freeSpace: async tid => { const value = Number(native.freeSpace(String(tid))); return value < 0 ? null : value; },
    showFile: uri => native.showFile(String(uri)),
    on: (channel, fn) => { if (!listeners.has(channel)) listeners.set(channel, new Set()); listeners.get(channel).add(fn); }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const mode = String(native.deviceMode());
    document.documentElement.classList.add('droply-android', `droply-android-${mode}`);
    const folderButton = document.querySelector('#folderBtn');
    if (folderButton) folderButton.onclick = event => { event.stopPropagation(); native.pickFolder(); };
    if (mode === 'tv') {
      const selector = '.rail #railAv,.rail .rbtn,.fr,#meBox,#peerBox,#drop,.peer,button,input,select';
      const markFocusable = root => (root.matches?.(selector) ? [root] : []).concat([...root.querySelectorAll?.(selector) || []]).forEach(el => {
        if (!el.hasAttribute('tabindex') && (el.onclick || el.matches('button,input,select'))) el.tabIndex = 0;
        if (el.onclick && !el.matches('button,input,select')) el.setAttribute('role', 'button');
      });
      const drop = document.querySelector('#drop');
      if (drop) { drop.tabIndex = 0; drop.setAttribute('role', 'button'); }
      markFocusable(document);
      new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === 1) markFocusable(node); }))).observe(document.body, { childList: true, subtree: true });
      document.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target?.getAttribute('role') === 'button') { event.preventDefault(); event.target.click(); }
      });
    }
    const log = document.querySelector('#log');
    window.addEventListener('droply-folder-error', event => { try { toast(String(event.detail || 'Could not read this folder')); } catch {} });
    if (log) {
      const update = () => native.setTransferActive(!!log.querySelector('.row.sending,.row.finishing'));
      new MutationObserver(update).observe(log, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      update();
    }
  }, { once: true });
})();
