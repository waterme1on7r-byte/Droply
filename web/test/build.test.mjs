import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
test('browser build shares the desktop renderer without changing it', async () => {
  const desktop = await readFile(root + '/index.html', 'utf8');
  const built = await readFile(root + '/docs/app/index.html', 'utf8');
  assert.match(desktop, /<script src="settings\.js"><\/script>/);
  for (const asset of ['config.js', 'storage.js', 'network.js', 'receive.js', 'bridge.js', 'web.css'])
    assert.ok(built.includes('"' + asset + '"'), 'Missing ' + asset);
  assert.match(built, /name="viewport"/);
  assert.match(built, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(built, /script-src 'self' 'unsafe-inline'/);
  assert.match(built, /Droply Web/);
  assert.match(built, /Download file/);
  assert.doesNotMatch(desktop, /<script src="bridge\.js"><\/script>/);
});
test('bundle includes only the public signaling configuration', async () => {
  const config = await readFile(root + '/docs/app/config.js', 'utf8');
  const original = await readFile(root + '/config.js', 'utf8');
  const gateway = process.env.DROPLY_PUBLIC_GATEWAY_URL || '';
  if (gateway) {
    assert.equal(config, original + '\nwindow.CONFIG.SERVER_URL = ' + JSON.stringify(new URL(gateway).origin) + ';\n');
    const built = await readFile(root + '/docs/app/index.html', 'utf8');
    assert.ok(built.includes('connect-src \'self\' ' + new URL(gateway).origin));
    assert.doesNotMatch(config, /DroplyPrivatePreview|WEB_PREVIEW_PASSWORD/);
  } else assert.equal(config, original);
  assert.doesNotMatch(config, /ADMIN_TOKEN|DATABASE_URL|secret/i);
});

test('CSP script hash matches the HTML parser-normalized inline script', async () => {
  const built = await readFile(root + '/docs/app/index.html', 'utf8');
  const source = await readFile(root + '/index.html', 'utf8');
  const match = built.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'Expected the browser renderer inline script');
  assert.doesNotMatch(match[1], /\r/, 'HTML should use parser-normalized line endings');
  const sha = createHash('sha256').update(match[1], 'utf8').digest('base64');
  assert.ok(built.includes("script-src 'self' 'sha256-" + sha + "'"),
    'CSP must hash the exact JavaScript that the browser executes');
  // The desktop HTML is CRLF. Hashing that raw text would silently block
  // every onclick handler, leaving a visually rendered but inert UI.
  assert.match(source, /\r\n/);
  assert.notEqual(createHash('sha256')
    .update(source.match(/<script>([\s\S]*?)<\/script>/)[1]).digest('base64'), sha);
});

test('profile remains simple and centered with legible name and Web status', async () => {
  const settings = await readFile(root + '/settings.js', 'utf8');
  const css = await readFile(root + '/docs/app/web.css', 'utf8');
  const built = await readFile(root + '/docs/app/index.html', 'utf8');
  const styles = await readFile(root + '/settings.css', 'utf8');
  assert.match(settings, /window\.DroplyWeb/);
  assert.match(settings, /web-profile-hero/);
  assert.match(settings, /profile-hero-name/);
  assert.match(settings, /Using Web/);
  assert.match(css, /\.web-profile-hero \.profile-hero-name/);
  assert.match(css, /font-size:clamp\(20px/);
  assert.match(css, /align-items:center/);
  assert.match(built, /client-platform/);
  assert.match(built, /webPeerIds\.add\(from\)/);
  assert.match(styles, /\.client-platform-tag/);
  // The HTML parser executes these source blocks; ensure our additions do not
  // break the desktop renderer or its shared browser script syntax.
  const inline = built.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inline);
  assert.doesNotThrow(() => new Script(inline[1]));
  assert.doesNotThrow(() => new Script(settings));
});

test('browser intro uses friendly language without hiding identity security guidance', async () => {
  const bridge = await readFile(root + '/docs/app/bridge.js', 'utf8');
  const css = await readFile(root + '/docs/app/web.css', 'utf8');
  assert.match(bridge, /Welcome to Droply Web/);
  assert.match(bridge, /browser has its own device code/);
  assert.match(bridge, /Keep this site’s data to keep your identity/);
  assert.match(bridge, /choose where incoming files are saved/);
  assert.match(bridge, /not protected by your device’s secure keychain/);
  assert.match(bridge, /Welcome to the Droply Web preview/);
  assert.doesNotMatch(bridge, /PRIVATE TEST BUILD · |DROPLY WEB · /);
  assert.match(css, /\.web-note-title/);
  assert.match(css, /\.web-note-privacy/);
  assert.doesNotMatch(css, /\.web-note\{[^}]*border-left:/);
});
