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

test('iPhone landscape dialogs scroll within the space above the bottom bar', async () => {
  const bridge = await readFile(new URL('../bridge.js', import.meta.url), 'utf8');
  const css = await readFile(webCss, 'utf8');
  assert.match(bridge, /if \(\/iPhone\|iPod\/\.test\(navigator\.userAgent\)\) document\.documentElement\.classList\.add\('droply-iphone'\)/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 500px\) and \(max-width: 1000px\)/);
  assert.match(css, /html\.droply-web\.droply-iphone #setup,/);
  assert.match(css, /align-items: center; justify-content: flex-start;/);
  assert.match(css, /max-height: none; overflow: visible; margin: 0 auto;/);
  assert.match(css, /html\.droply-web\.droply-iphone #addFriend \.box/);
  assert.doesNotMatch(css, /html\.droply-web\.droply-ipad/);
});

test('iPhone landscape uses the visible Safari viewport with a compact two-column setup', async () => {
  const css = await readFile(webCss, 'utf8');
  assert.match(css, /html\.droply-web\.droply-iphone body \{[^}]*height: 100dvh/);
  assert.match(css, /html\.droply-web\.droply-iphone #titlebar \{ display: none; \}/);
  assert.match(css, /html\.droply-web\.droply-iphone #setup \.box \{[^}]*display: grid/);
  assert.match(css, /grid-template-columns: minmax\(64px, 90px\) minmax\(0, 1fr\)/);
  assert.match(css, /html\.droply-web\.droply-iphone #setup #codeRow \{/);
  assert.match(css, /html\.droply-web\.droply-iphone #setup #saveBtn \{/);
  assert.match(css, /html\.droply-web\.droply-iphone #settingsPane \{[^}]*var\(--iphone-landscape-nav\)/);
  assert.match(css, /max-height: calc\(100dvh - var\(--iphone-landscape-nav\) - 12px\)/);
});

test('Add Friend does not automatically focus code entry on Web or Android', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /const mobileFriendDialog = !!window\.DroplyAndroid/);
  assert.match(html, /!!window\.DroplyWeb && \(navigator\.maxTouchPoints > 0/);
  assert.match(html, /if \(!mobileFriendDialog && !window\.DroplyWeb\) \$\('#codeIn'\)\.focus\(\)/);
  assert.doesNotMatch(html, /\$\('#addFriend'\)\.classList\.remove\('hidden'\); \$\('#codeIn'\)\.focus\(\)/);
});

test('Touch platforms block pinch zoom but keep one-finger scrolling', async () => {
  const web = await readFile(new URL('../bridge.js', import.meta.url), 'utf8');
  const android = await readFile(new URL('../../android/app/src/main/web/android-bridge.js', import.meta.url), 'utf8');
  const css = await readFile(webCss, 'utf8');
  for (const source of [web, android]) {
    assert.match(source, /event\.touches\.length > 1\) event\.preventDefault\(\)/);
    assert.match(source, /passive: false/);
  }
  assert.match(web, /gesturestart/);
  assert.match(web, /gesturechange/);
  assert.match(css, /touch-action:pan-x pan-y/);
});

test('Transfers logo sits slightly higher and exactly matches profile avatar size across landscape layouts', async () => {
  const css = await readFile(webCss, 'utf8');
  const webOnly = css.slice(css.indexOf('/* Align the restored Transfers logo with the Y profile avatar.'));
  assert.ok(webOnly.startsWith('/* Align the restored Transfers logo with the Y profile avatar.'));
  assert.match(webOnly, /html\.droply-web \.rail > \.rbtn\.active\{\s*width:50px;height:50px;border-radius:14px;top:-5px;/);
  assert.match(webOnly, /\(orientation: landscape\) and \(pointer: coarse\) and \(max-width: 1600px\)/);
  assert.match(webOnly, /width:42px;height:42px;border-radius:12px;top:-3px/);
  assert.match(webOnly, /\(orientation: landscape\) and \(max-height: 430px\) and \(max-width: 1100px\)/);
  assert.match(webOnly, /width:36px;height:36px;border-radius:11px;top:-2px/);
  assert.doesNotMatch(webOnly, /#railAv\s*\{|#addFriendBtn\s*\{|#gearBtn\s*\{/);
});
