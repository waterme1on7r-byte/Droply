import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const webCss = new URL('../web.css', import.meta.url);

test('web transfer content scrolls at desktop and phone-landscape widths', async () => {
  const css = await readFile(webCss, 'utf8');
  assert.match(css, /html\.droply-web main\{[^}]*overflow-y:auto/);
  assert.doesNotMatch(css, /html\.droply-web main\{overflow:hidden\}/);
  assert.match(css, /\(orientation:landscape\) and \(max-height:500px\) and \(pointer:coarse\)/);
});

test('mobile navigation forms one centered row without an empty friends spacer', async () => {
  const css = await readFile(webCss, 'utf8');
  assert.match(css, /html\.droply-web \.rail\{[^}]*justify-content:center/);
  assert.match(css, /html\.droply-web #frList\{[^}]*flex:0 1 auto/);
  assert.match(css, /html\.droply-web #frList:empty\{display:none\}/);
  assert.match(css, /env\(safe-area-inset-bottom,0px\)/);
});

test('iOS browser detection supports iPhone, iPad and desktop-UA iPadOS', async () => {
  const bridge = await readFile(new URL('../bridge.js', import.meta.url), 'utf8');
  assert.match(bridge, /iPad\|iPhone\|iPod/);
  assert.match(bridge, /navigator\.platform === 'MacIntel' && navigator\.maxTouchPoints > 1/);
  assert.match(bridge, /if \(iosDevice\) document\.documentElement\.classList\.add\('droply-ios'\)/);
});

test('iOS landscape uses a fixed bottom bar without altering Android landscape', async () => {
  const css = await readFile(webCss, 'utf8');
  assert.match(css, /@media \(orientation: landscape\) \{\s*html\.droply-web\.droply-ios/);
  assert.match(css, /html\.droply-web\.droply-ios \.rail \{[^}]*position: fixed;[^}]*inset: auto 0 0/);
  assert.match(css, /html\.droply-web\.droply-ios \.rail #frList \{ display: none !important; \}/);
  assert.match(css, /html\.droply-web\.droply-ios main \{[^}]*overflow-x: hidden; overflow-y: auto/);
  assert.match(css, /html\.droply-web\.droply-ios #settingsPane \{[^}]*var\(--ios-landscape-nav\)/);
});
