import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('mobile hero downloads stay in a single row without changing desktop styles', async () => {
  const html = await readFile(root + 'docs/index.html', 'utf8');
  const css = await readFile(root + 'docs/mobile-downloads.css', 'utf8');
  assert.match(html, /<link rel="stylesheet" href="mobile-downloads\.css">/);
  for (const id of ['hero-mac', 'hero-win', 'hero-android']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(css, /@media\s*\(max-width:\s*500px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*360px\)/);
  assert.match(css, /flex-direction:\s*column/); // Inner button only: icons above text on small phones.
  assert.doesNotMatch(css, /\.hero-actions\s*\{[^}]*flex-direction:\s*column/);
  // All three assets are unchanged; this is presentation only.
  assert.match(html, /id="hero-mac"[^>]*v2\.8\.15\/Droply-2\.8\.15-universal\.dmg/);
  assert.match(html, /id="hero-win"[^>]*v2\.8\.15\/Droply-Setup-2\.8\.15\.exe/);
  assert.match(html, /id="hero-android"[^>]*v2\.8\.15\/Droply-Android-2\.8\.15-debug-preview\.apk/);
});
