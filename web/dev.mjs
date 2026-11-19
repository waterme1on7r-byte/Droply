import './build.mjs';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../docs/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end(); }
  if (pathname === '/') { res.writeHead(302, { Location: '/app/' }); return res.end(); }
  const name = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
  const file = resolve(root, '.' + name);
  if (!file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file);
    const ext = file.slice(file.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => {
  console.log('Droply Web: http://localhost:' + port + '/app/');
  console.log('For browser registration, allow http://localhost:' + port + ' in WEB_ALLOWED_ORIGINS on the signaling server.');
});
