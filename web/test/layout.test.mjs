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
