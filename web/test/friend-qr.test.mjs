import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const QR = require(root + '/assets/vendor/qrcode.js');
const decode = require(root + '/assets/vendor/jsQR.js');
const sample = 'DRP-ABCD-EFGH-JKMP';

test('public friend codes survive an entirely local QR encode/decode round trip', () => {
  const qr = QR(0, 'M');
  qr.addData(sample);
  qr.make();
  const size = qr.getModuleCount(), scale = 6, quiet = 4;
  const width = (size + 2 * quiet) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const row = Math.floor(y / scale) - quiet;
    const col = Math.floor(x / scale) - quiet;
    const black = row >= 0 && col >= 0 && row < size && col < size && qr.isDark(row, col);
    const p = (y * width + x) * 4;
    pixels[p] = pixels[p + 1] = pixels[p + 2] = black ? 0 : 255;
    pixels[p + 3] = 255;
  }
  assert.equal(decode(pixels, width, width)?.data, sample);
});

test('QR friend flow does not add friends without explicit Add confirmation', async () => {
  const source = await readFile(root + '/assets/friend-qr.js', 'utf8');
  const html = await readFile(root + '/index.html', 'utf8');
  const build = await readFile(root + '/web/build.mjs', 'utf8');
  assert.match(source, /const CODE = \/\^DRP-/);
  assert.match(source, /input\.value = code\.slice\(4\)/);
  assert.match(source, /press Add to send a request/);
  assert.doesNotMatch(source, /addByCode\(/);
  assert.match(source, /getUserMedia/);
  assert.match(source, /getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(html, /id="showFriendQr"/);
  assert.match(html, /id="scanFriendQr"/);
  assert.match(html, /id="friendQrFile"/);
  assert.match(html, /src="assets\/friend-qr\.js"/);
  assert.match(build, /'qrcode\.js', 'jsQR\.js'/);
});

test('QR friend popup stays bounded and repositions across Web, iOS and Android', async () => {
  const [shared, web, android, qr, html] = await Promise.all([
    'settings.css', 'web/web.css', 'android/app/src/main/web/android.css',
    'assets/friend-qr.js', 'index.html'
  ].map(name => readFile(root + '/' + name, 'utf8')));
  assert.match(shared, /#addFriend #friendQrImage\{[^}]*clamp\(/);
  assert.match(shared, /#addFriend \.friend-qr-panel/);
  assert.match(shared, /@media\(orientation:landscape\) and \(max-height:500px\)/);
  assert.match(web, /html\.droply-web #addFriend \.box\{[^}]*max-height:calc\(100dvh/);
  assert.match(android, /html\.droply-android #addFriend \.box\{[^}]*max-height:calc\(100dvh/);
  assert.match(qr, /layoutObserver\.observe\(display/);
  assert.match(qr, /layoutObserver\.observe\(scanner/);
  assert.match(qr, /window\.dispatchEvent\(new Event\('resize'\)\)/);
  assert.match(html, /popup\.id === 'addFriend'/);
  assert.match(html, /Ask a friend to scan this QR\./);
});

test('Share QR offers an actual PNG file to installed apps and keeps manual fallback', async () => {
  const qr = await readFile(root + '/assets/friend-qr.js', 'utf8');
  const html = await readFile(root + '/index.html', 'utf8');
  const css = await readFile(root + '/settings.css', 'utf8');
  assert.match(html, /id="shareFriendQr"/);
  assert.match(html, /id="friendQrShareStatus"/);
  assert.match(qr, /share\.addEventListener\('click', async/);
  assert.match(qr, /qr\.isDark\(row, col\)/);
  assert.match(qr, /return output\.toDataURL\('image\/png'\)/);
  assert.match(qr, /window\.DroplyAndroid\.shareQrImage\(dataUrl, code\)/);
  assert.match(qr, /navigator\.canShare\(\{ files: \[image\] \}\)/);
  assert.match(qr, /await navigator\.share\(\{/);
  assert.match(qr, /files: \[image\]/);
  assert.match(qr, /link\.download = 'Droply-Friend-QR\.png'/);
  // Never allow share content to contain a secret, server admin token, or a remote QR service.
  assert.doesNotMatch(qr, /ADMIN_TOKEN|privateKey|fetch\(/);
  assert.match(css, /#addFriend \.friend-qr-share-status:empty\{display:none\}/);
});

test('Android native QR sharing uses a scoped read-only content URI and chooser', async () => {
  const [activity, bridge, manifest, paths, gradle] = await Promise.all([
    'android/app/src/main/java/com/droply/android/MainActivity.kt',
    'android/app/src/main/java/com/droply/android/DroplyBridge.kt',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/res/xml/friend_qr_paths.xml',
    'android/app/build.gradle.kts'
  ].map(path => readFile(root + '/' + path, 'utf8')));
  assert.match(bridge, /@JavascriptInterface fun shareQrImage/);
  assert.match(activity, /Regex\("\^DRP-/);
  assert.match(activity, /BitmapFactory\.Options/);
  assert.match(activity, /FileProvider\.getUriForFile/);
  assert.match(activity, /Intent\(Intent\.ACTION_SEND\)/);
  assert.match(activity, /putExtra\(Intent\.EXTRA_STREAM, uri\)/);
  assert.match(activity, /FLAG_GRANT_READ_URI_PERMISSION/);
  assert.match(activity, /Intent\.createChooser/);
  assert.match(manifest, /android:name="androidx\.core\.content\.FileProvider"/);
  assert.match(manifest, /android:exported="false"/);
  assert.match(paths, /<cache-path name="friend_qr" path="shared_qr\/" \/>/);
  assert.match(gradle, /androidx\.core:core:/);
});

test('Android QR preview is opt-in and cannot silently overwrite the installed Android identity', async () => {
  const [gradle, manifest, native, workflow] = await Promise.all([
    'android/app/build.gradle.kts',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/java/com/droply/android/MainActivity.kt',
    '.github/workflows/android-qr-preview.yml'
  ].map(path => readFile(root + '/' + path, 'utf8')));
  assert.match(gradle, /findProperty\("droplyQrSharingPreview"\) == "true"/);
  assert.match(gradle, /applicationId = when \{[\s\S]*qrSharingPreview -> "com\.droply\.android\.qrpreview"[\s\S]*droplyNewInstall -> "com\.droply\.android\.release"[\s\S]*else -> "com\.droply\.android"/);
  assert.match(gradle, /versionCode = if \(qrSharingPreview\) 10 else if \(droplyNewInstall\) droplyVersionCode else 9/);
  assert.match(gradle, /qrSharingPreview -> "Droply QR Preview"[\s\S]*droplyNewInstall -> "Droply \(New\)"[\s\S]*else -> "Droply"/);
  assert.match(gradle, /create\("droplyRelease"\)/);
  assert.match(manifest, /android:label="\$\{droplyAppLabel\}"/);
  assert.match(native, /FileProvider\.getUriForFile\(this, "\$packageName\.friendqr", image\)/);
  assert.match(gradle, /"assets\/vendor\/qrcode\.js"/);
  assert.match(gradle, /"assets\/vendor\/jsQR\.js"/);
  assert.match(gradle, /"assets\/friend-qr\.js"/);
  assert.match(workflow, /droplyQrSharingPreview=true/);
  assert.match(workflow, /com\.droply\.android\.qrpreview/);
  assert.match(workflow, /apksigner/);
  assert.match(workflow, /--prerelease/);
});
