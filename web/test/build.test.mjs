import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { imagePixels } from '../pwa-icons.mjs';

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

test('landscape web app matches desktop-style layout on phones and tablets', async () => {
  const css = await readFile(root + '/docs/app/web.css', 'utf8');
  const src = await readFile(root + '/web/web.css', 'utf8');
  assert.equal(css, src, 'Landscape styling must be included in the published app bundle');
  assert.match(css, /@media \(orientation: landscape\) and \(pointer: coarse\) and \(max-width: 1600px\)/);
  assert.match(css, /\(orientation: landscape\) and \(max-width: 1100px\) and \(max-height: 800px\)/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 430px\)/);
  const landscape = css.slice(css.indexOf('/* Landscape phones and tablets'));
  assert.ok(landscape.startsWith('/* Landscape phones and tablets'));
  assert.match(landscape, /html\.droply-web body\s*\{[^}]*flex-direction: row/);
  assert.match(landscape, /html\.droply-web \.rail\s*\{[^}]*flex-direction: column/);
  assert.match(landscape, /html\.droply-web #frList\s*\{[^}]*flex-direction: column/);
  assert.match(landscape, /html\.droply-web main\s*\{[^}]*overflow-x: hidden; overflow-y: auto/);
  assert.match(landscape, /html\.droply-web #pair\s*\{[^}]*flex-direction: row/);
  assert.match(landscape, /html\.droply-web #drop\s*\{[^}]*min-height: 170px/);
  assert.match(landscape, /html\.droply-web #addFriend \.box\s*\{[^}]*left: calc\(var\(--landscape-rail\)/);
  assert.match(landscape, /html\.droply-web #friendRequests \.request-box\s*\{[^}]*bottom: max\(12px/);
  assert.match(landscape, /html\.droply-web #settingsPane\s*\{[^}]*var\(--landscape-rail\)/);
  assert.match(landscape, /html\.droply-web \.settings-content\s*\{[^}]*overflow-y: auto/);
  assert.match(landscape, /html\.droply-web #setup \.box,[\s\S]*max-height: calc\(100dvh - var\(--landscape-title\) - 20px\)/);
  // The ordinary narrow portrait layout remains in its own orientation-neutral
  // breakpoint and the landscape overrides do not target the desktop renderer.
  assert.match(css, /@media \(max-width:760px\)/);
  assert.doesNotMatch(landscape, /(^|\n)\s*body\s*\{/);
});

test('portrait browser layout follows the Android reference without hiding transfers', async () => {
  const css = await readFile(root + '/docs/app/web.css', 'utf8');
  const bridge = await readFile(root + '/docs/app/bridge.js', 'utf8');
  assert.match(css, /@media \(orientation: portrait\) and \(max-width: 900px\)/);
  assert.match(css, /#webFriendsStrip \{ display: block/);
  assert.match(css, /#pair \{\s*display: grid/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 42px minmax\(0, 1fr\)/);
  assert.match(css, /#drop \{\s*flex: 0 0 auto/);
  assert.match(css, /#frList \{ display: none !important/);
  assert.match(css, /#addFriendBtn \{ order: 3/);
  assert.match(bridge, /friendStrip\.id = 'webFriendsStrip'/);
  assert.match(bridge, /window\.renderAndroidFriends =/);
  assert.match(bridge, /button\.onclick = \(\) => selectFriend\(friend\.id\)/);
  assert.match(bridge, /main\.append\(banner\)/);
  assert.doesNotThrow(() => new Script(bridge));
});

test('iPhone Web alone gets the approved mobile Add Friend and Select File panel', async () => {
  const bridge = await readFile(root + '/docs/app/bridge.js', 'utf8');
  const css = await readFile(root + '/docs/app/web.css', 'utf8');
  const desktop = await readFile(root + '/index.html', 'utf8');
  assert.match(bridge, /if \(document\.documentElement\.classList\.contains\('droply-iphone'\)\) \{/);
  assert.match(bridge, /actions\.className = 'ios-upload-actions'/);
  assert.match(bridge, /document\.querySelector\('#addFriendBtn'\)\?\.click\(\)/);
  assert.match(bridge, /document\.querySelector\('#fi'\)\?\.click\(\)/);
  assert.match(bridge, /event\.stopPropagation\(\)/);
  assert.match(css, /html\.droply-web\.droply-iphone #drop > h2/);
  assert.match(css, /html\.droply-web\.droply-iphone #drop > p \{ display: none; \}/);
  assert.match(css, /html\.droply-web\.droply-iphone \.ios-upload-actions/);
  assert.match(css, /@media \(orientation: landscape\)/);
  assert.match(css, /@media \(orientation: portrait\)/);
  const mobileRules = css.slice(css.indexOf('/* iPhone Web mobile transfer actions only.'));
  assert.doesNotMatch(mobileRules, /html\.droply-web\.droply-ios[^\n]*(?:#drop|\.ios-upload-actions|\.ios-action-divider)/);
  assert.doesNotMatch(desktop, /ios-upload-actions/);
  assert.doesNotThrow(() => new Script(bridge));
});

test('home screen metadata uses the native Droply icon without changing desktop', async () => {
  const html = await readFile(root + '/docs/app/index.html', 'utf8');
  const desktop = await readFile(root + '/index.html', 'utf8');
  const icon = await readFile(root + '/docs/app/droply-icon.png');
  const originalIcon = await readFile(root + '/assets/droply-icon.png');
  const manifest = JSON.parse(await readFile(root + '/docs/app/manifest.webmanifest', 'utf8'));

  assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="droply-icon-home-180\.png">/);
  assert.match(html, /<link rel="icon" type="image\/png" href="droply-icon\.png">/);
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="Droply">/);
  assert.deepEqual(icon, originalIcon, 'Use the official Droply icon without altering it');
  assert.equal(manifest.name, 'Droply');
  assert.equal(manifest.short_name, 'Droply');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons, [
    { src: 'droply-icon-home-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'droply-icon-home-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
  ]);
  // The native source has transparent rounded corners. Safari draws white
  // behind them; generated Home Screen icons must contain opaque blue corners.
  const native = imagePixels(originalIcon);
  const pixel = (raster, x, y) =>
    [...raster.image.subarray((y * raster.width + x) * 4, (y * raster.width + x) * 4 + 4)];
  assert.equal(pixel(native, 0, 0)[3], 0, 'Original logo retains its existing transparency');
  for (const size of [180, 192, 512]) {
    const raw = await readFile(root + '/docs/app/droply-icon-home-' + size + '.png');
    assert.deepEqual([...raw.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(raw.readUInt32BE(16), size, 'Home Screen icon width');
    assert.equal(raw.readUInt32BE(20), size, 'Home Screen icon height');
    const image = imagePixels(raw);
    for (let i = 3; i < image.image.length; i += 4)
      assert.equal(image.image[i], 255, 'Home Screen icon must be opaque');
    for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
      const rgba = pixel(image, x, y);
      assert.ok(rgba[0] < 130 && rgba[1] < 190 && rgba[2] > 150,
        'Icon corner must show Droply blue, not a white halo: ' + rgba);
    }
    assert.deepEqual(pixel(image, size >> 1, size >> 1).slice(0, 3), [255, 255, 255],
      'Keep the original white Droply symbol centered');
  }
  assert.doesNotMatch(desktop, /apple-touch-icon|manifest\.webmanifest/);
});

test('mobile browser inputs do not trigger automatic Safari focus zoom', async () => {
  const html = await readFile(root + '/docs/app/index.html', 'utf8');
  const desktop = await readFile(root + '/index.html', 'utf8');
  const css = await readFile(root + '/docs/app/web.css', 'utf8');
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"/);
  assert.doesNotMatch(desktop, /user-scalable=no/);
  const mobile = css.slice(css.indexOf('/* Only the browser app on touch devices: iOS Safari'));
  assert.ok(mobile.startsWith('/* Only the browser app on touch devices: iOS Safari'));
  assert.match(mobile, /@media \(pointer: coarse\), \(hover: none\)/);
  assert.match(mobile, /html\.droply-web body \{\s*touch-action: pan-x pan-y/);
  assert.match(mobile, /html\.droply-web input:not\(\[type="checkbox"\]\)/);
  assert.match(mobile, /html\.droply-web textarea/);
  assert.match(mobile, /html\.droply-web select/);
  assert.match(mobile, /font-size: 16px !important/);
  assert.match(mobile, /html\.droply-web\.droply-ios input/);
});

test('dark-theme Transfers sidebar icon is bundled at the exact CSS background URL', async () => {
  const sharedCss = await readFile(root + '/settings.css', 'utf8');
  const webCss = await readFile(root + '/docs/app/settings.css', 'utf8');
  const desktopHtml = await readFile(root + '/index.html', 'utf8');
  const builtHtml = await readFile(root + '/docs/app/index.html', 'utf8');
  const sourceLogo = await readFile(root + '/assets/droply-icon.png');
  const webLogo = await readFile(root + '/docs/app/assets/droply-icon.png');
  assert.match(sharedCss, /\.rail>\.rbtn\.active\{background:url\('assets\/droply-icon\.png'\)/);
  assert.equal(webCss, sharedCss, 'Web must use the same dark-theme sidebar CSS');
  assert.deepEqual(webLogo, sourceLogo, 'Sidebar image must actually exist at the CSS URL');
  assert.match(desktopHtml, /class="rbtn active" title="Transfers"/);
  assert.match(builtHtml, /class="rbtn active" title="Transfers"/);
  assert.match(builtHtml, /<svg width="32" height="32" viewBox="0 0 32 32">/);
});

test('Web Transfers logo opens the Droply homepage without changing native renderers', async () => {
  const desktop = await readFile(root + '/index.html', 'utf8');
  const built = await readFile(root + '/docs/app/index.html', 'utf8');
  const css = await readFile(root + '/docs/app/web.css', 'utf8');
  assert.match(built, /<a class="rbtn active" href="\.\.\/" title="Droply home page" aria-label="Go to Droply home page">/);
  assert.match(built, /<\/svg><\/a>\s*<div class="rsep">/);
  assert.doesNotMatch(built, /<div class="rbtn active" title="Transfers">/);
  assert.match(desktop, /<div class="rbtn active" title="Transfers">/);
  assert.doesNotMatch(desktop, /href="\.\.\/" title="Droply home page"/);
  assert.equal(
    new URL('../', 'https://waterme1on7r-byte.github.io/Droply/app/').href,
    'https://waterme1on7r-byte.github.io/Droply/'
  );
  assert.match(css, /html\.droply-web \.rail > a\.rbtn\.active\{\s*cursor:pointer/);
  assert.match(css, /html\.droply-web \.rail > a\.rbtn\.active:focus-visible/);
});
