(() => {
  'use strict';
  const store = window.DroplyWebStore;
  const listeners = new Map();
  const on = (kind, fn) => {
    if (!listeners.has(kind)) listeners.set(kind, new Set());
    listeners.get(kind).add(fn);
  };
  const emit = (kind, value) => {
    for (const fn of listeners.get(kind) || []) {
      try { fn(value); } catch (error) { console.error('Droply event listener failed', error); }
    }
  };
  let last = { state: 'idle', text: 'Ready to connect' };
  let socket = null, retryTimer = null, pending = null, attempt = 0, active = false, authenticated = false;
  function state(type, text) {
    last = { state: type, text };
    emit('server-event', { t: 'state', ...last });
  }
  function address() {
    const url = new URL(window.CONFIG?.SERVER_URL || '');
    if (!['wss:', 'ws:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || (url.protocol === 'ws:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      throw Error('A secure WSS signaling server is required');
    return url;
  }
  function endpoint(base, path) {
    const url = new URL(path, base);
    url.protocol = base.protocol === 'wss:' ? 'https:' : 'http:';
    return url.href;
  }
  function close() {
    active = false;
    clearTimeout(retryTimer);
    retryTimer = null;
    authenticated = false;
    if (socket) { socket.onclose = null; socket.close(); socket = null; }
  }
  function schedule() {
    if (!active || retryTimer) return;
    state('offline', 'Offline — reconnecting securely…');
    retryTimer = setTimeout(() => { retryTimer = null; connect(); },
      Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)) + Math.random() * 500);
  }
  async function connect() {
    if (!active || pending || socket) return last;
    pending = (async () => {
      let base, user, credential;
      try {
        base = address();
        user = await store.profile();
        credential = await store.credential(base.origin, user.id);
      } catch (error) {
        state('locked', error.message || 'Browser identity is unavailable. Site data has not been reset.');
        active = false;
        return;
      }
      if (!credential.registered) {
        state('connecting', 'Registering this browser…');
        try {
          const response = await fetch(endpoint(base, '/auth/register'), {
            method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id, token: credential.token }),
            signal: AbortSignal.timeout(30000)
          });
          if (response.status === 409) {
            state('locked', 'This browser identity is already registered. Open Settings → Device access to recover it.');
            active = false;
            return;
          }
          if (!response.ok) throw Error('Registration unavailable');
          const result = await response.json();
          if (result.id !== user.id) throw Error('Registration identity mismatch');
          await store.writeCredential(credential.token, base.origin, user.id, true);
        } catch (error) {
          if (error.message === 'Registration identity mismatch') {
            state('locked', error.message); active = false;
          } else schedule();
          return;
        }
      }
      if (!active) return;
      state('connecting', 'Connecting securely…');
      let ws;
      try { ws = new WebSocket(new URL('/device', base)); }
      catch { schedule(); return; }
      socket = ws;
      authenticated = false;
      const deadline = setTimeout(() => { if (socket === ws && !authenticated) ws.close(); }, 15000);
      let denied = false;
      ws.onopen = () => { if (socket === ws) ws.send(JSON.stringify({ t: 'auth', token: credential.token })); };
      ws.onmessage = event => {
        if (socket !== ws || typeof event.data !== 'string' || event.data.length > (1 << 20)) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.t === 'access-denied') {
          denied = true;
          state('enrollment-required', 'Device access rejected. Your profile is preserved; check Device access.');
          ws.close();
          return;
        }
        if (message.t === 'authenticated') {
          if (message.id !== user.id) {
            denied = true;
            state('locked', 'Server identity mismatch. Your profile is preserved.');
            ws.close();
            return;
          }
          authenticated = true;
          attempt = 0;
          clearTimeout(deadline);
          // Read the latest profile: the user may have chosen a name while
          // initial registration or the WebSocket handshake was in progress.
          store.profile().then(latest => {
            if (socket === ws && ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ t: 'hello', id: latest.id, name: latest.name, av: latest.avatar }));
          }).catch(() => {});
          state('connected', 'Connected securely');
        } else if (authenticated && ['peers', 'sig', 'resolved'].includes(message.t))
          emit('server-event', { t: 'message', message });
      };
      ws.onerror = () => {};
      ws.onclose = event => {
        clearTimeout(deadline);
        if (socket !== ws) return;
        socket = null;
        authenticated = false;
        if (event.code === 4401) {
          denied = true;
          state('enrollment-required', 'Device credential rejected. Use Device access recovery.');
        }
        if (denied) active = false;
        else schedule();
      };
    })().finally(() => { pending = null; });
    await pending;
    return last;
  }
  function sendSignal(message) {
    if (!authenticated || socket?.readyState !== WebSocket.OPEN || !message || typeof message !== 'object') return;
    let payload;
    if (message.t === 'hello') {
      // The profile, not a renderer-supplied identity, is authoritative.
      store.profile().then(user => {
        if (socket?.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ t: 'hello', id: user.id, name: user.name, av: user.avatar }));
      }).catch(() => {});
      return;
    }
    if (message.t === 'sig' && typeof message.to === 'string' && message.to.length <= 64
      && message.data && typeof message.data === 'object')
      payload = { t: 'sig', to: message.to, data: message.data };
    else if (message.t === 'watch' && ['friends', 'codes', 'notify'].every(key => Array.isArray(message[key])
      && message[key].length <= 200)) payload = message;
    else if (message.t === 'lookup' && /^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(message.code))
      payload = message;
    if (!payload) return;
    const encoded = JSON.stringify(payload);
    if (encoded.length < (message.t === 'sig' ? (1 << 20) : 65536) && socket.bufferedAmount < 4 * 1024 * 1024)
      socket.send(encoded);
  }
  async function enrollDevice(invitation) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(String(invitation || '').trim())) throw Error('Enter a valid recovery invitation');
    const base = address(), user = await store.profile();
    const response = await fetch(endpoint(base, '/auth/enroll'), {
      method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitation: invitation.trim(), id: user.id }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw Error(response.status === 403 ? 'Invitation invalid, expired, or already used' : 'Recovery service unavailable');
    const result = await response.json();
    if (result.id !== user.id || !/^[A-Za-z0-9_-]{43}$/.test(result.token)) throw Error('Invalid enrollment response');
    // Preserve the same profile, friends and device code. Replace only the credential.
    await store.writeCredential(result.token, base.origin, user.id, true, true);
    close();
    active = true;
    connect();
    return { enrolled: true };
  }
  function start() { active = true; connect(); return Promise.resolve(last); }
  async function access() {
    return { configured: !!(await store.get('credential')), encryptionAvailable: !!crypto.subtle,
      ...last, text: last.text + ' Browser credentials are not protected by Electron safeStorage; use a trusted device.' };
  }
  window.DroplyWebNetwork = { on, emit, start, close, access, sendSignal, enrollDevice };
})();
