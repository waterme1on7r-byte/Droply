'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PREFIX = '/internal/preview/';
const ASSETS = new Map([
  ['', 'index.html'], ['index.html', 'index.html'],
  ['settings.js', 'settings.js'], ['settings.css', 'settings.css'],
  ['config.js', 'config.js'], ['storage.js', 'storage.js'],
  ['network.js', 'network.js'], ['receive.js', 'receive.js'],
  ['bridge.js', 'bridge.js'], ['web.css', 'web.css']
]);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8' };
const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive'
};
function isAuthorized(header, password) {
  if (typeof header !== 'string' || !header.startsWith('Basic ')) return false;
  const expected = Buffer.from('droply:' + password).toString('base64');
  const candidate = header.slice(6);
  const a = Buffer.from(candidate, 'utf8'), b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function validatePreview(env) {
  const password = env.WEB_PREVIEW_PASSWORD || '';
  const origin = env.WEB_PREVIEW_ORIGIN || '';
  if (!password && !origin) return null;
  if (typeof password !== 'string' || password.length < 24 || password.length > 256 ||
      password.trim() !== password || /[\r\n]/.test(password))
    throw Error('WEB_PREVIEW_PASSWORD must be a strong, 24–256 character secret');
  const value = new URL(origin);
  if (value.origin !== origin || value.username || value.password ||
      (value.protocol !== 'https:' &&
      !(value.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname))))
    throw Error('WEB_PREVIEW_ORIGIN must be an exact HTTPS origin (or local HTTP origin)');
  return { password, origin };
}
async function servePreview(req, res, preview, root) {
  let route;
  try { route = new URL(req.url, 'http://localhost').pathname; } catch { return false; }
  if (route !== PREFIX.slice(0, -1) && !route.startsWith(PREFIX)) return false;
  if (!preview) return false; // Hidden entirely until preview env vars are set.
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { ...HEADERS, Allow: 'GET, HEAD' });
    res.end(); return true;
  }
  if (!isAuthorized(req.headers.authorization, preview.password)) {
    res.writeHead(401, { ...HEADERS, 'WWW-Authenticate': 'Basic realm="Droply private preview", charset="UTF-8"' });
    res.end('Private Droply preview: sign in to continue.'); return true;
  }
  if (route === PREFIX.slice(0, -1)) {
    res.writeHead(308, { ...HEADERS, Location: PREFIX });
    res.end(); return true;
  }
  // Never use the URL as a filesystem path. The exact allowlist also rejects
  // encoded traversal, subfolders and backup/config files.
  const asset = ASSETS.get(route.slice(PREFIX.length));
  if (!asset) {
    res.writeHead(404, HEADERS); res.end('Not found'); return true;
  }
  const filename = path.join(root, asset);
  let stat;
  try { stat = await fs.promises.stat(filename); }
  catch {
    res.writeHead(503, HEADERS);
    res.end('The preview build is unavailable. Check the server startup logs.'); return true;
  }
  if (!stat.isFile()) {
    res.writeHead(404, HEADERS); res.end('Not found'); return true;
  }
  res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[path.extname(asset)],
    'Content-Length': stat.size });
  if (req.method === 'HEAD') { res.end(); return true; }
  const stream = fs.createReadStream(filename);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
  return true;
}
module.exports = { PREFIX, validatePreview, servePreview };
