import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('four equally sized hero choices remain in one row on desktop and phones', async () => {
  const html = await readFile(root + 'docs/index.html', 'utf8');
  const css = await readFile(root + 'docs/mobile-downloads.css', 'utf8');
  assert.match(html, /<link rel="stylesheet" href="mobile-downloads\.css">/);
  for (const id of ['hero-mac', 'hero-win', 'hero-android', 'hero-web']) {
    assert.match(html, new RegExp('id="' + id + '"[^>]*class="btn btn-lg'));
  }
  assert.match(html, /id="hero-web"[^>]*href="\.\/app\/"/);
  assert.match(html, /id="hero-web"[^>]*aria-label="Use Droply Web"/);
  const actionStart = html.indexOf('<div class="hero-actions"');
  assert.ok(actionStart >= 0, 'Expected four choices in one button group');
  const actionEnd = html.indexOf('</section>', actionStart);
  const actions = html.slice(actionStart, actionEnd);
  const heroStart = html.indexOf('<div class="hero-copy">');
  const heroArt = html.indexOf('<div class="hero-art"', heroStart);
  const heroActions = html.indexOf('<div class="hero-actions"', heroStart);
  const heroEnd = html.indexOf('</section>', heroStart);
  assert.ok(heroStart >= 0 && heroArt > heroStart && heroActions > heroArt && heroActions < heroEnd,
    'All four buttons must be a separate centered row below the hero illustration');
  assert.doesNotMatch(html, /class="hero-meta"/, 'Global requirements line should be replaced by platform-specific details');
  for (const [id, os] of [
    ['hero-mac', 'macOS 12+'],
    ['hero-win', 'Windows 10+'],
    ['hero-android', 'Android 10+'],
    ['hero-web', 'No installation']
  ]) {
    const item = actions.match(new RegExp('<a id="' + id + '"[^\\n]*<\\/a>\\s*<p class="hero-requirements">([^<]*<span>[^<]*<\\/span>){2}<\\/p>'));
    assert.ok(item, 'Requirements must appear directly below ' + id);
    assert.ok(item[0].includes(os), 'Expected the correct requirement below ' + id);
  }
  assert.match(css, /grid-column: 1 \/ -1/);
  assert.match(css, /justify-self: center/);
  assert.match(css, /margin-top: 8px/);
  assert.equal((actions.match(/class="btn btn-lg/g) || []).length, 4);
  assert.equal((actions.match(/class="hero-choice"/g) || []).length, 4);
  assert.equal((actions.match(/class="hero-requirements"/g) || []).length, 4);
  assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*500px\)/);
  assert.match(css, /@media\s*\(max-width:\s*360px\)/);
  assert.doesNotMatch(css, /\.hero-actions\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /min-height: 77px/);
  assert.doesNotMatch(css, /translateX\(-8px\)/);
  assert.match(css, /max-width: 887px/);
  assert.match(css, /max-width: 563px/);
  assert.match(css, /\.hero-actions \.hero-choice/);
  assert.match(css, /\.hero-actions \.hero-requirements/);
  assert.match(css, /grid-template-columns:\s*repeat\(4/);

  assert.match(css, /min-height: 86px/);
  assert.match(css, /min-height: 90px/);
  assert.match(css, /min-height: 88px/);
  assert.match(css, /padding: 12px 11px/);
  assert.match(css, /font-size: 1\.1rem/);
  assert.match(css, /width: 25px/);
  assert.match(css, /grid-column: 1 \/ -1/);
  assert.doesNotMatch(html, /class="btn btn-primary nav-cta"/);
  assert.match(html, /<a href="#download">Download<\/a>/);
  // The published native downloads are still the exact same releases.
  assert.match(html, /id="hero-mac"[^>]*v2\.8\.15\/Droply-2\.8\.15-universal\.dmg/);
  assert.match(html, /id="hero-win"[^>]*v2\.8\.15\/Droply-Setup-2\.8\.15\.exe/);
  assert.match(html, /id="hero-android"[^>]*v2\.8\.15\/Droply-Android-2\.8\.15-debug-preview\.apk/);
});
