'use strict';

// Local-only administrator helper. It never writes credentials or invitations to disk.
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const open = promisify(execFile);

const HOST = '127.0.0.1';
const SIGNALING_ORIGIN = 'https://droply-server-91kh.onrender.com';
const CODE = /^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function page(content) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Droply device recovery</title>
  <style>
    :root{color-scheme:dark;font:16px system-ui,sans-serif;background:#0d1728;color:#e7eefb}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(100%,520px);padding:30px;border:1px solid #263a59;border-radius:18px;background:#14223a;box-shadow:0 20px 70px #0005}h1{margin:0 0 10px;font-size:25px}p{color:#afc1dc;line-height:1.55}label{display:block;margin:20px 0 7px;font-size:14px;color:#c7d7ee}input{display:block;width:100%;padding:13px 14px;border-radius:10px;border:1px solid #344b6d;background:#0e1a2d;color:#fff;font:inherit}button{width:100%;margin-top:22px;padding:13px;border:0;border-radius:10px;background:#3478ed;color:white;font:600 15px system-ui;cursor:pointer}button:hover{background:#4386fa}.notice{padding:13px;border-radius:10px;background:#0e1a2d;border:1px solid #344b6d;overflow-wrap:anywhere}.small{font-size:13px;color:#90a5c3}a{color:#80b6ff}
  </style><body><main class="card">${content}</main></body></html>`;
}

function send(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  });
  res.end(html);
}

function readForm(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 8192) { reject(new Error('Form is too large.')); req.destroy(); }
    });
    req.on('end', () => resolve(new URLSearchParams(raw)));
    req.on('error', reject);
  });
}

const app = http.createServer(async (req, res) => {
  const origin = `http://${HOST}:${app.address().port}`;
  if (req.headers.host !== `${HOST}:${app.address().port}`) return send(res, 403, page('<h1>Local access only</h1>'));
  if (req.method === 'GET' && req.url === '/') {
    return send(res, 200, page(`<h1>Droply device recovery</h1>
      <p>Create a one-time replacement invitation for a device that shows “This device identity is already in use.” The invitation is for the device code you enter below.</p>
      <form method="post" action="/create" autocomplete="off">
        <label for="code">Affected device code</label><input id="code" name="code" placeholder="DRP-XXXX-XXXX-XXXX" required maxlength="18" spellcheck="false" autocapitalize="characters">
        <label for="token">Server ADMIN_TOKEN</label><input id="token" name="token" type="password" minlength="32" required autocomplete="new-password">
        <button type="submit">Create one-time invitation</button>
      </form><p class="small">The token is sent only to this computer and then to Droply over HTTPS. It is not saved or printed. The invitation expires after 15 minutes and can be used once.</p>`));
  }
  if (req.method !== 'POST' || req.url !== '/create') return send(res, 404, page('<h1>Page not found</h1>'));
  if (req.headers.origin !== origin) return send(res, 403, page('<h1>Request rejected</h1><p>Open the recovery tool from this computer’s local page.</p>'));

  try {
    const form = await readForm(req);
    const code = (form.get('code') || '').trim().toUpperCase();
    const token = form.get('token') || '';
    if (!CODE.test(code)) return send(res, 400, page('<h1>Check the device code</h1><p>Enter it in the format DRP-XXXX-XXXX-XXXX.</p><p><a href="/">Return to the form</a></p>'));
    if (token.length < 32 || token.length > 4096) return send(res, 400, page('<h1>Check the administrator token</h1><p>Enter the ADMIN_TOKEN from the signaling server’s private environment settings.</p><p><a href="/">Return to the form</a></p>'));

    const response = await fetch(`${SIGNALING_ORIGIN}/admin/invites`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ code, replace: true, ttlMs: 15 * 60 * 1000 }),
      redirect: 'error',
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      // Consume without exposing server response contents, which may contain operational details.
      await response.arrayBuffer().catch(() => {});
      const message = response.status === 401 ? 'The administrator token was not accepted.'
        : response.status === 404 ? 'The signaling server did not recognize the recovery request.'
          : 'The server could not create an invitation. Try again later.';
      return send(res, 502, page(`<h1>Recovery was not completed</h1><p>${message}</p><p><a href="/">Return to the form</a></p>`));
    }
    const result = await response.json();
    if (typeof result.invitation !== 'string' || !result.invitation || result.code !== code) throw new Error('Invalid response from the server.');
    return send(res, 200, page(`<h1>Invitation ready</h1><p>One-time replacement invitation for <strong>${escapeHtml(code)}</strong>. It expires in 15 minutes.</p><p class="notice">${escapeHtml(result.invitation)}</p><p>Select and copy the invitation, then on the affected device open <strong>Settings → Device access</strong> and paste it.</p><p class="small">Keep this invitation private. It can replace access for this device code once.</p><p><a href="/">Recover another device</a></p>`));
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'The server took too long to respond.' : 'A connection error interrupted recovery.';
    return send(res, 502, page(`<h1>Recovery was not completed</h1><p>${message}</p><p><a href="/">Return to the form</a></p>`));
  }
});

app.listen(0, HOST, async () => {
  const url = `http://${HOST}:${app.address().port}/`;
  console.log('Droply recovery tool is running in your browser. Stop it with Ctrl+C when finished.');
  try {
    if (process.platform === 'win32') await open('cmd.exe', ['/c', 'start', '', url], { windowsHide: true });
    else if (process.platform === 'darwin') await open('open', [url]);
    else await open('xdg-open', [url]);
  } catch {
    console.log(`Open this local address in your browser: ${url}`);
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close(() => process.exit(0)));
