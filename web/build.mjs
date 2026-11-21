import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportPwaIcons } from './pwa-icons.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs', 'app');
const source = await readFile(join(root, 'index.html'), 'utf8');
const config = await readFile(join(root, 'config.js'), 'utf8');
const context = { window: {} };
runInNewContext(config, context, { timeout: 1000 });
// Public Pages uses the separate gateway, which proxies to the existing
// signaling backend. Keep the production signaling server's CORS unchanged.
const publicGateway = process.env.DROPLY_PUBLIC_GATEWAY_URL || '';
const url = new URL(publicGateway || context.window.CONFIG?.SERVER_URL || '');
if (publicGateway && (url.protocol !== 'wss:' || url.pathname !== '/' ||
  url.origin + '/' !== url.href))
  throw Error('DROPLY_PUBLIC_GATEWAY_URL must be an exact WSS origin');
if (!['wss:', 'ws:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
  || (url.protocol === 'ws:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  throw Error('config.js must contain a valid secure public signaling URL');
const httpUrl = new URL(url.origin);
httpUrl.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
// HTML parsers normalize CRLF/CR to LF before CSP hashes are checked.
// The desktop renderer uses CRLF; hash and serve the same normalized text.
let html = source.replace(/\r\n?/g, '\n');
function replaceOnce(from, to) {
  if (!html.includes(from)) throw Error('Desktop renderer changed: missing ' + from.slice(0, 80));
  html = html.replace(from, to);
}
replaceOnce('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n<meta name="description" content="Droply Web — private peer-to-peer file transfers in your browser">');
replaceOnce('<title>Droply</title>', '<title>Droply Web · File transfers</title>\n<link rel="apple-touch-icon" sizes="180x180" href="droply-icon-home-180.png">\n<link rel="icon" type="image/png" href="droply-icon.png">\n<link rel="manifest" href="manifest.webmanifest">\n<meta name="apple-mobile-web-app-title" content="Droply">\n<meta name="theme-color" content="#0e1523">');
replaceOnce('<meta name="apple-mobile-web-app-title" content="Droply">',
  '<meta name="apple-mobile-web-app-title" content="Droply">\n<meta name="apple-mobile-web-app-capable" content="yes">');
replaceOnce('media="print" onload="this.media=\'all\'"', 'media="all"');
replaceOnce('<link rel="stylesheet" href="settings.css">', '<link rel="stylesheet" href="settings.css">\n<link rel="stylesheet" href="web.css">');
replaceOnce('<script src="config.js"></script>', [
  '<script src="config.js"></script>',
  '<script src="storage.js"></script>',
  '<script src="network.js"></script>',
  '<script src="receive.js"></script>',
  '<script src="bridge.js"></script>',
  '<script src="install.js"></script>'
].join('\n'));
// Apply every browser-specific renderer edit BEFORE hashing. A later edit
// would invalidate CSP and silently block all UI event handlers.
replaceOnce("a.textContent = 'Show in folder';", "a.textContent = window.DroplyWeb ? 'Download file' : 'Show in folder';");
// Preserve the desktop UI and transfer protocol, but remove broad browser
// script permission. Hash the FINAL normalized inline app script.
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (inline.length !== 1) throw Error('Expected exactly one renderer inline script');
const hash = createHash('sha256').update(inline[0][1]).digest('base64');
replaceOnce("script-src 'self' 'unsafe-inline'", "script-src 'self' 'sha256-" + hash + "'");
replaceOnce("connect-src 'self' ws: wss:", "connect-src 'self' " + url.origin + ' ' + httpUrl.origin + (process.env.DROPLY_PRIVATE_PREVIEW === '1' ? ' wss:' : ''));
await mkdir(output, { recursive: true });
await writeFile(join(output, 'index.html'), html);
const outputConfig = publicGateway
  ? config + '\nwindow.CONFIG.SERVER_URL = ' + JSON.stringify(url.origin) + ';\n'
  : config;
await writeFile(join(output, 'config.js'), outputConfig);
for (const name of ['settings.js', 'settings.css'])
  await copyFile(join(root, name), join(output, name));
for (const name of ['storage.js', 'network.js', 'receive.js', 'bridge.js', 'install.js', 'web.css'])
  await copyFile(join(root, 'web', name), join(output, name));
// Bundled QR libraries and pairing logic are same-origin scripts, never external CDNs.
await mkdir(join(output, 'assets', 'vendor'), { recursive: true });
for (const name of ['friend-qr.js'])
  await copyFile(join(root, 'assets', name), join(output, 'assets', name));
for (const name of ['qrcode.js', 'jsQR.js', 'qrcode-LICENSE', 'jsQR-LICENSE'])
  await copyFile(join(root, 'assets', 'vendor', name), join(output, 'assets', 'vendor', name));
/* Reuse the native app's own icon; only the generated browser app gets it. */
await copyFile(join(root, 'assets', 'droply-icon.png'), join(output, 'droply-icon.png'));
await exportPwaIcons(root, output);
await writeFile(join(output, 'manifest.webmanifest'), JSON.stringify({
  name: 'Droply',
  short_name: 'Droply',
  description: 'Private peer-to-peer file transfers',
  id: './',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#0e1523',
  theme_color: '#0e1523',
  icons: [
    { src: 'droply-icon-home-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'droply-icon-home-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
  ]
}, null, 2) + '\n');
console.log('Built the browser app at docs/app/index.html');
