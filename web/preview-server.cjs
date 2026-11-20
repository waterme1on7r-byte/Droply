'use strict';

// Standalone, password-protected test gateway. It never holds administrator or
// database credentials. The live signaling backend stays on its existing host.
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const serverRequire = createRequire(path.join(__dirname, '..', 'server', 'server.js'));
const WebSocket = serverRequire('ws');
const { WebSocketServer } = WebSocket;

const PREFIX = '/internal/preview/';
const COOKIE = 'droply_preview_session';
const MAX_AGE = 8 * 60 * 60;
const MAX_BODY = 4096;
const allowedAssets = new Set(['index.html', 'settings.js', 'settings.css', 'web.css',
  'config.js', 'storage.js', 'network.js', 'receive.js', 'bridge.js']);
const contentTypes = { '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const baseHeaders = {
  'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin'
};

function createPreviewServer(options = {}) {
  const env = options.env || process.env;
  const password = env.WEB_PREVIEW_PASSWORD;
  if (typeof password !== 'string' || password.length < 24 || password.length > 256
    || password.trim() !== password || /[\r\n]/.test(password))
    throw Error('WEB_PREVIEW_PASSWORD must be a strong 24–256 character secret.');
  const backend = new URL(env.SIGNALING_UPSTREAM_URL || '');
  const localUpstream = options.allowLocalUpstream === true &&
    backend.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname);
  if ((!localUpstream && backend.protocol !== 'wss:') || backend.username || backend.password ||
    backend.search || backend.hash || backend.pathname !== '/')
    throw Error('SIGNALING_UPSTREAM_URL must be a WSS origin without credentials or paths.');
  const upstreamHttps = new URL(backend.origin);
  upstreamHttps.protocol = backend.protocol === 'wss:' ? 'https:' : 'http:';
  const root = options.root || path.join(__dirname, '..', 'docs', 'app');
  const sessionKey = crypto.createHash('sha256').update('droply-preview-session-v1:' + password).digest();
  const attempts = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20, perMessageDeflate: false });
  const secureCookies = env.PREVIEW_LOCAL_HTTP !== '1';

  function reply(res, status, body = '', headers = {}) {
    res.writeHead(status, { ...baseHeaders, ...headers });
    res.end(body);
  }
  const compare = (a, b) => {
    const aa = Buffer.from(a), bb = Buffer.from(b);
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  };
  function signedCookie() {
    const data = Buffer.from(JSON.stringify({
      iat: Date.now(), nonce: crypto.randomBytes(12).toString('base64url')
    })).toString('base64url');
    const sig = crypto.createHmac('sha256', sessionKey).update(data).digest('base64url');
    return data + '.' + sig;
  }
  function authorized(req) {
    const raw = String(req.headers.cookie || '').split(';').map(x => x.trim())
      .find(x => x.startsWith(COOKIE + '='));
    if (!raw) return false;
    const token = raw.slice(COOKIE.length + 1);
    if (token.length > 512 || !/^[A-Za-z0-9_.-]+$/.test(token)) return false;
    const [data, tag, extra] = token.split('.');
    if (!data || !tag || extra) return false;
    const expected = crypto.createHmac('sha256', sessionKey).update(data).digest('base64url');
    if (!compare(tag, expected)) return false;
    try {
      const value = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
      return Number.isSafeInteger(value.iat) && value.iat <= Date.now() &&
        Date.now() - value.iat < MAX_AGE * 1000;
    } catch { return false; }
  }
  // Safari may omit both Origin and Referer (the page uses no-referrer).
  // Use an expiring, HMAC-signed hidden form token instead.
  const LOGIN_TOKEN_AGE = 15 * 60 * 1000;
  function signedLoginToken() {
    const value = Date.now().toString(36) + '.' + crypto.randomBytes(16).toString('base64url');
    const signature = crypto.createHmac('sha256', sessionKey)
      .update('droply-private-login:' + value).digest('base64url');
    return value + '.' + signature;
  }
  function validLoginToken(token) {
    if (typeof token !== 'string' || token.length > 128) return false;
    const parts = token.split('.');
    if (parts.length !== 3 || !/^[a-z0-9]+$/.test(parts[0]) ||
      !/^[A-Za-z0-9_-]{22}$/.test(parts[1]) ||
      !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return false;
    const when = Number.parseInt(parts[0], 36), elapsed = Date.now() - when;
    if (!Number.isSafeInteger(when) || elapsed < 0 || elapsed > LOGIN_TOKEN_AGE) return false;
    const value = parts[0] + '.' + parts[1];
    const signature = crypto.createHmac('sha256', sessionKey)
      .update('droply-private-login:' + value).digest('base64url');
    return compare(signature, parts[2]);
  }
  const matchesPassword = supplied => {
    const digest = value => crypto.createHash('sha256').update(value).digest();
    return crypto.timingSafeEqual(digest(String(supplied || '')), digest(password));
  };
  const remoteIP = req => (String(req.socket.remoteAddress || 'unknown'));
  function attemptAllowed(req) {
    const ip = remoteIP(req), now = Date.now();
    let state = attempts.get(ip);
    if (!state || state.until < now) state = { count: 0, until: now + 15 * 60 * 1000 };
    attempts.set(ip, state);
    if (attempts.size > 5000) for (const [key, value] of attempts)
      if (value.until < now || attempts.size > 4000) attempts.delete(key);
    return ++state.count <= 12;
  }
  function loginPage(error = '') {
    const notice = error ? '<p class="error" role="alert">Incorrect password or expired sign-in page. Reload and try again.</p>' : '';
    const formToken = signedLoginToken();
    return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Droply · Private test access</title><meta name="robots" content="noindex,nofollow">' +
      '<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0e1523;color:#f1f5fb;font:16px system-ui,-apple-system,sans-serif;padding:20px}' +
      'form{width:min(100%,390px);padding:35px;background:#151f30;border-radius:18px;box-shadow:0 20px 70px #0005}h1{font-size:31px;margin:0 0 8px;color:#f5d97e}p{font-size:14px;color:#9aa7bd;line-height:1.5}' +
      'label{display:block;margin-top:22px;font-size:13px;font-weight:600}input{display:block;width:100%;margin-top:8px;padding:13px;border:1px solid #4b5a72;border-radius:9px;background:#101827;color:white;font:inherit}' +
      'button{width:100%;margin-top:22px;padding:13px;background:#3b82f6;border:0;border-radius:9px;color:white;font:inherit;font-weight:600;cursor:pointer}.error{color:#f87171}small{color:#9aa7bd}</style></head>' +
      '<body><form method="post" action="' + PREFIX + 'login"><h1>Droply</h1>' +
      '<input type="hidden" name="csrf" value="' + formToken + '">' +
      '<p>Private browser testing. Only invited testers can enter this preview.</p>' +
      notice + '<label for="password">Test access password</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus>' +
      '<button type="submit">Enter Droply</button><p><small>Testing uses the existing Droply signaling service. Your browser gets its own device identity.</small></p></form></body></html>';
  }
  const validOrigin = req => {
    const origin = req.headers.origin;
    if (typeof origin !== 'string') return false;
    // The session cookie is host-only. No other browser origin is accepted.
    const hostname = req.headers.host;
    if (!hostname || /[\s/\\@]/.test(hostname)) return false;
    return origin === 'https://' + hostname ||
      (env.PREVIEW_LOCAL_HTTP === '1' && origin === 'http://' + hostname);
  };
  // The form token proves this page was fetched; reject explicitly foreign
  // origins and cross-site fetches, without relying on missing Safari headers.
  const validLoginOrigin = req => {
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && !validOrigin(req)) return false;
    const site = req.headers['sec-fetch-site'];
    if (site && !['same-origin', 'none'].includes(site)) return false;
    const ref = req.headers.referer;
    if (!ref) return true; // no-referrer is intentional and common in Safari
    const host = req.headers.host;
    if (!host || /[\s/\\@]/.test(host)) return false;
    const expected = (env.PREVIEW_LOCAL_HTTP === '1' ? 'http://' : 'https://') + host;
    try { return new URL(ref).origin === expected; } catch { return false; }
  };
  async function readBody(req, limit = MAX_BODY) {
    const chunks = [];
    let n = 0;
    for await (const chunk of req) {
      n += chunk.length;
      if (n > limit) throw Error('Request too large');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  async function serveFile(res, name, isHead) {
    const filename = path.join(root, name);
    try {
      const stat = await fs.promises.stat(filename);
      if (!stat.isFile()) throw Error('Missing asset');
      res.writeHead(200, { ...baseHeaders,
        'Content-Type': contentTypes[path.extname(name)], 'Content-Length': stat.size });
      if (isHead) return res.end();
      const stream = fs.createReadStream(filename);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch { reply(res, 503, 'The test build is not available yet.'); }
  }
  async function proxyAuth(req, res, pathname) {
    if (!authorized(req) || !validOrigin(req)) return reply(res, 403, 'Forbidden');
    if (req.method !== 'POST' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))
      return reply(res, 405, 'Not allowed');
    let body;
    try { body = await readBody(req); JSON.parse(body); } catch { return reply(res, 400, 'Invalid request'); }
    try {
      const upstream = await fetch(new URL(pathname, upstreamHttps), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body, redirect: 'error', signal: AbortSignal.timeout(16000)
      });
      const response = await upstream.text();
      if (response.length > 16384) throw Error('Large upstream response');
      reply(res, upstream.status, response, { 'Content-Type': 'application/json; charset=utf-8' });
    } catch { reply(res, 502, JSON.stringify({ error: 'Signaling service unavailable' }),
      { 'Content-Type': 'application/json; charset=utf-8' }); }
  }
  const server = http.createServer(async (req, res) => {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; }
    catch { return reply(res, 400, 'Bad URL'); }
    if (pathname === '/health' && req.method === 'GET')
      return reply(res, 200, 'ok', { 'Content-Type': 'text/plain' });
    if (pathname === '/auth/register' || pathname === '/auth/enroll')
      return proxyAuth(req, res, pathname);
    if (pathname === '/internal/preview') return reply(res, 308, '', { Location: PREFIX });
    if (!pathname.startsWith(PREFIX)) return reply(res, 404, 'Not found');
    const asset = pathname.slice(PREFIX.length);
    if (asset === 'login' && req.method === 'POST') {
      if (!validLoginOrigin(req)) return reply(res, 403, 'Invalid origin');
      if (!attemptAllowed(req)) return reply(res, 429, loginPage('error'),
        { 'Content-Type': 'text/html; charset=utf-8' });
      let supplied, csrf;
      try {
        if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type'] || ''))
          throw Error('Invalid input');
        const data = new URLSearchParams(await readBody(req, 1024));
        supplied = data.get('password');
        csrf = data.get('csrf');
      } catch { return reply(res, 400, 'Bad input'); }
      if (!validLoginToken(csrf)) return reply(res, 403, 'Invalid or expired sign-in form. Reload the test page.');
      if (!matchesPassword(supplied)) return reply(res, 401, loginPage('error'),
        { 'Content-Type': 'text/html; charset=utf-8' });
      // A first-party Lax cookie survives Safari's top-level form navigation.
      // State-changing operations remain protected by a strict Origin check.
      const cookie = COOKIE + '=' + signedCookie() +
        '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + MAX_AGE +
        (secureCookies ? '; Secure' : '');
      // An intermediate success document gives Safari a full navigation to
      // store the cookie before loading the app and a manual Continue fallback.
      return reply(res, 200,
        '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
        '<meta http-equiv="refresh" content="1;url=' + PREFIX + '">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Droply · Access granted</title>' +
        '<style>:root{color-scheme:dark}body{background:#0e1523;color:#f1f5fb;font:16px system-ui,sans-serif;min-height:90vh;display:grid;place-items:center;text-align:center}a{color:#f5d97e}</style>' +
        '</head><body><main><h1>Access granted</h1><p>Opening Droply Web…</p>' +
        '<p><a href="' + PREFIX + '">Continue to Droply</a></p></main></body></html>',
        { 'Set-Cookie': cookie, 'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return reply(res, 405, 'Method not allowed');
    if (!authorized(req)) {
      // Never serve HTML as JavaScript/CSS: browsers may try to download
      // a misleading "file" instead of displaying the login page.
      if (asset && asset !== 'index.html')
        return reply(res, 401, 'Sign in at /internal/preview/ first.',
          { 'Content-Type': 'text/plain; charset=utf-8', 'WWW-Authenticate': 'Session realm="Droply preview"' });
      return reply(res, 200, loginPage(), {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
      });
    }
    if (asset === 'config.js') {
      // Both fetch() and WebSocket use this same protected preview origin.
      const configuration = 'window.CONFIG={SERVER_URL:location.origin.replace(/^http/,"ws"),ICE:' +
        JSON.stringify(options.ice || [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]) + '};window.DroplyPrivatePreview=true;';
      return reply(res, 200, req.method === 'HEAD' ? '' : configuration,
        { 'Content-Type': 'text/javascript; charset=utf-8' });
    }
    const file = asset || 'index.html';
    if (!allowedAssets.has(file)) return reply(res, 404, 'Not found');
    return serveFile(res, file, req.method === 'HEAD');
  });

  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; }
    catch { return socket.destroy(); }
    if (pathname !== '/device' || !authorized(req) || !validOrigin(req)
      || wss.clients.size >= 100) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, client => wss.emit('connection', client));
  });
  wss.on('connection', client => {
    const upstream = new WebSocket(new URL('/device', backend).href, {
      handshakeTimeout: 12000, perMessageDeflate: false, maxPayload: 1 << 20,
      followRedirects: false
    });
    let pending = [], queued = 0, stopped = false, lastPingAt = 0, waitingPing = null;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      pending = [];
      waitingPing = null;
      try { client.close(); } catch {}
      try { upstream.close(); } catch {}
      setTimeout(() => { if (client.readyState !== 3) client.terminate();
        if (upstream.readyState !== 3) upstream.terminate(); }, 2500).unref();
    };
    client.on('message', (frame, binary) => {
      if (binary || stopped) return stop();
      // Native WebSocket ping/pong gives the browser an end-to-end liveness
      // check through this gateway and the existing signaling server. No
      // broadcast/polling or changes to the production server are needed.
      if (frame.length <= 80) {
        let probe;
        try { probe = JSON.parse(frame.toString()); } catch {}
        if (probe?.t === 'gateway-ping') {
          if (!Number.isSafeInteger(probe.id) || probe.id < 0 ||
            probe.id > 0x7fffffff || upstream.readyState !== WebSocket.OPEN) return stop();
          const now = Date.now();
          if (now - lastPingAt < 4000 || waitingPing) return;
          lastPingAt = now;
          const nonce = crypto.randomBytes(12).toString('hex');
          waitingPing = { id: probe.id, nonce };
          try { upstream.ping(nonce); } catch { stop(); }
          return;
        }
      }
      if (upstream.readyState === WebSocket.OPEN) {
        if (upstream.bufferedAmount > 4 * 1024 * 1024) return stop();
        upstream.send(frame, { binary: false });
      } else if (upstream.readyState === WebSocket.CONNECTING) {
        queued += frame.length;
        if (queued > 1 << 20) return stop();
        pending.push(frame);
      } else stop();
    });
    upstream.on('open', () => {
      for (const frame of pending) upstream.send(frame, { binary: false });
      pending = []; queued = 0;
    });
    upstream.on('pong', frame => {
      if (stopped || !waitingPing || frame.toString() !== waitingPing.nonce) return;
      const id = waitingPing.id;
      waitingPing = null;
      if (client.readyState === WebSocket.OPEN)
        client.send(JSON.stringify({ t: 'gateway-pong', id }));
    });
    upstream.on('message', (frame, binary) => {
      if (binary || stopped || client.readyState !== WebSocket.OPEN) return stop();
      if (client.bufferedAmount > 4 * 1024 * 1024) return stop();
      client.send(frame, { binary: false });
    });
    client.on('error', stop);
    upstream.on('error', stop);
    client.on('close', stop);
    upstream.on('close', stop);
  });
  return { server, close: async () => {
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }};
}
if (require.main === module) {
  try {
    const app = createPreviewServer();
    app.server.listen(Number(process.env.PORT || 10000), '0.0.0.0',
      () => console.log('Droply private preview gateway listening'));
    const stop = () => app.close().then(() => process.exit(0));
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } catch (error) {
    console.error('Droply private preview could not start:', error.message);
    process.exit(1);
  }
}
module.exports = { createPreviewServer };
