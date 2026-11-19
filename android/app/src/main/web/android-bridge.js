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
    const root = document.documentElement;
    root.classList.add('droply-android');
    const applyLayoutMode = () => {
      const portrait = window.matchMedia('(orientation: portrait)').matches;
      const compact = mode !== 'tv' && (portrait || root.clientWidth < 900);
      root.classList.toggle('droply-android-phone', compact);
      root.classList.toggle('droply-android-tablet', mode !== 'tv' && !compact);
      root.classList.toggle('droply-android-tv', mode === 'tv');
    };
    applyLayoutMode();
    window.addEventListener('resize', applyLayoutMode, { passive: true });
    const friendStrip = document.createElement('section');
    friendStrip.id = 'androidFriendsStrip'; friendStrip.setAttribute('aria-label', 'Friends');
    friendStrip.innerHTML = '<div class="strip-heading"><b>Friends</b><small></small></div><div class="strip-friends"></div>';
    document.querySelector('.pairwrap').before(friendStrip);
    window.renderAndroidFriends = (friends, peers, selected) => {
      const online = new Set(peers.map(peer => peer.id));
      const list = friendStrip.querySelector('.strip-friends'); list.replaceChildren();
      friendStrip.querySelector('.strip-heading small').textContent = `${friends.filter(f => online.has(f.id)).length} online · ${friends.filter(f => !online.has(f.id)).length} offline`;
      if (!friends.length) {
        const empty = document.createElement('button'); empty.type = 'button'; empty.className = 'strip-empty ghost'; empty.textContent = 'Add your first friend';
        empty.onclick = () => document.querySelector('#addFriendBtn').click(); list.append(empty);
      }
      [...friends].sort((a,b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name)).forEach(friend => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'strip-friend' + (online.has(friend.id) ? ' online' : '') + (friend.id === selected ? ' selected' : '');
        button.setAttribute('aria-pressed', String(friend.id === selected));
        button.setAttribute('aria-label', `${friend.name}, ${online.has(friend.id) ? 'online' : 'offline'}`);
        const image = avatar(friend.av, friend.name), dot = document.createElement('i'); dot.className = 'strip-dot'; image.append(dot);
        const name = document.createElement('span'); name.textContent = friend.name;
        const state = document.createElement('small'); state.textContent = online.has(friend.id) ? 'Online' : 'Offline';
        button.append(image, name, state); button.onclick = () => selectFriend(friend.id); list.append(button);
      });
    };
    renderRail();
    // The Android add-friend form is anchored to its own navigation button.
    const addPopup = document.querySelector('#addFriend'), addButton = document.querySelector('#addFriendBtn');
    const addPanel = addPopup.querySelector('.box');
    addPopup.classList.remove('overlay');
    addPopup.setAttribute('aria-modal', 'false');
    const positionAddPopup = () => {
      if (addPopup.classList.contains('hidden')) return;
      const anchor = addButton.getBoundingClientRect(), panel = addPanel.getBoundingClientRect();
      const horizontal = getComputedStyle(document.querySelector('.rail')).flexDirection === 'row';
      let left = horizontal ? anchor.right - panel.width : anchor.right + 12;
      let top = horizontal ? anchor.top - panel.height - 10 : anchor.bottom - panel.height;
      left = Math.max(12, Math.min(left, innerWidth - panel.width - 12));
      top = Math.max(12, Math.min(top, innerHeight - panel.height - 12));
      addPanel.style.left = `${left}px`; addPanel.style.top = `${top}px`;
    };
    const openAdd = addButton.onclick;
    addButton.onclick = event => {
      if (!addPopup.classList.contains('hidden')) { addPopup.classList.add('hidden'); return; }
      openAdd.call(addButton, event);
      requestAnimationFrame(positionAddPopup);
    };
    window.addEventListener('resize', positionAddPopup);
    window.visualViewport?.addEventListener('resize', positionAddPopup);
    document.addEventListener('pointerdown', event => {
      if (!addPopup.classList.contains('hidden') && !addPanel.contains(event.target) && !addButton.contains(event.target)) addPopup.classList.add('hidden');
    }, true);
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
