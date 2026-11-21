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
