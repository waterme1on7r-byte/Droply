(() => {
  'use strict';
  // Every browser installation is a separate device. No server secrets or credentials
  // are embedded in the published site.
  const DB_NAME = 'droply-web-v1';
  const STORE = 'state';
  const defaults = { theme: 'dark', askSave: true, friendNotifications: true, incomingNotifications: true,
    completedNotifications: true, sounds: false, launchAtStartup: false, tray: false };
  let opening;
  function db() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || Error('Browser storage is not available'));
      request.onblocked = () => reject(Error('Close other Droply tabs and try again'));
    });
    return opening;
  }
  async function get(key) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function set(key, value) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || Error('Browser storage failed'));
    });
  }
  const safeAvatar = avatar => typeof avatar === 'string' && avatar.length < 60000 &&
    (avatar === '' || /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(avatar));
  async function profile() {
    let value = await get('profile');
    if (value !== undefined) {
      if (!value || typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.id)) throw Error('Stored identity is damaged. Do not clear site data; contact support.');
      return value;
    }
    value = { id: crypto.randomUUID(), name: '', avatar: '' };
    await set('profile', value);
    return value;
  }
  async function saveProfile(patch) {
    const old = await profile();
    const name = typeof patch?.name === 'string' ? Array.from(patch.name.trim()).slice(0, 24).join('') : old.name;
    const avatar = safeAvatar(patch?.avatar) ? patch.avatar : old.avatar;
    return set('profile', { id: old.id, name: name || old.name, avatar });
  }
  const CODE = /^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
  const cleanPerson = p => p && typeof p.id === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(p.id) &&
    CODE.test(p.code) ? { id: p.id, code: p.code, name: String(p.name || 'Friend').slice(0, 40),
      av: safeAvatar(p.av) ? p.av : '' } : null;
  async function friends() {
    const s = await get('friends');
    return s && typeof s === 'object' ? s : { friends: [], inc: [], out: [], gone: [] };
  }
  async function saveFriends(s) {
    const distinct = (arr, key, n) => {
      const keys = new Set();
      return (Array.isArray(arr) ? arr.slice(0, n) : []).filter(x => x && !keys.has(x[key]) && keys.add(x[key]));
    };
    const value = {
      friends: distinct((Array.isArray(s?.friends) ? s.friends : []).map(cleanPerson).filter(Boolean), 'id', 200),
      inc: distinct((Array.isArray(s?.inc) ? s.inc : []).map(cleanPerson).filter(Boolean), 'id', 50),
      out: distinct((Array.isArray(s?.out) ? s.out : []).filter(x => x && CODE.test(x.code))
        .map(x => ({ code: x.code })), 'code', 100),
      gone: [...new Set((Array.isArray(s?.gone) ? s.gone : []).filter(x => typeof x === 'string'
        && /^[A-Za-z0-9-]{16,64}$/.test(x)))].slice(0, 200)
    };
    return set('friends', value);
  }
  async function settings() {
    const current = await get('settings');
    return { ...defaults, ...(current && typeof current === 'object' ? current : {}),
      downloadDir: 'Chosen folder / browser downloads', startupSupported: false, version: 'Web' };
  }
  async function saveSettings(patch) {
    const current = await settings();
    for (const [key, value] of Object.entries(patch || {})) {
      if (Object.prototype.hasOwnProperty.call(defaults, key) && typeof value === typeof defaults[key]
        && !['launchAtStartup', 'tray'].includes(key)) current[key] = value;
    }
    current.theme = current.theme === 'light' ? 'light' : 'dark';
    await set('settings', current);
    return current;
  }
  async function history() { const data = await get('history'); return Array.isArray(data) ? data : []; }
  async function record(item) {
    if (!item || !['in', 'out'].includes(item.direction) || !['done', 'error', 'cancelled'].includes(item.state)) return;
    const next = [{ id: crypto.randomUUID(), date: new Date().toISOString(),
      name: String(item.name || '').slice(0, 240), peer: String(item.peer || '').slice(0, 40),
      direction: item.direction, state: item.state, message: String(item.message || '').slice(0, 160) },
    ...(await history())].slice(0, 300);
    await set('history', next);
    return next;
  }
  async function credential(origin, id) {
    const saved = await get('credential');
    let key = await get('credential-key');
    if (saved) {
      if (saved.version !== 1 || saved.origin !== origin || saved.id !== id || !key)
        throw Error('Stored browser credential cannot be used. Your identity has been preserved; use Device access recovery.');
      const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(saved.iv) },
        key, new Uint8Array(saved.cipher));
      const token = new TextDecoder().decode(bytes);
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('Invalid stored browser credential');
      return { token, registered: saved.registered !== false };
    }
    if (!key) {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await set('credential-key', key);
    }
    const raw = new Uint8Array(32); crypto.getRandomValues(raw);
    const token = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await writeCredential(token, origin, id, false);
    return { token, registered: false };
  }
  async function writeCredential(token, origin, id, registered = true, recovery = false) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('Invalid credential');
    let key = await get('credential-key');
    // Only an explicit administrator-approved recovery may replace a lost key.
    if (!key && recovery) {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await set('credential-key', key);
    }
    if (!key) throw Error('Browser encryption key is missing; identity has been preserved');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
    await set('credential', { version: 1, origin, id, registered, iv: [...iv], cipher: [...new Uint8Array(cipher)] });
  }
  window.DroplyWebStore = { get, set, profile, saveProfile, friends, saveFriends, settings,
    saveSettings, history, record, credential, writeCredential };
})();
