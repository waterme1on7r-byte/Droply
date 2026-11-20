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
  const actions = html.match(/<div class="hero-actions"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(actions, 'Expected four choices in one button group');
  const heroStart = html.indexOf('<div class="hero-copy">');
  const heroEnd = html.indexOf('<div class="hero-art"', heroStart);
  const hero = html.slice(heroStart, heroEnd);
  assert.ok(hero.indexOf('class="hero-meta"') < hero.indexOf('class="hero-trust"'), 'Version details precede the trust line');
  assert.ok(hero.indexOf('class="hero-trust"') < hero.indexOf('class="hero-actions"'), 'All four buttons must follow the trust line');
  assert.match(css, /margin-top: 36px/);
  assert.equal((actions[1].match(/class="btn btn-lg/g) || []).length, 4);
  assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*500px\)/);
  assert.match(css, /@media\s*\(max-width:\s*360px\)/);
  assert.doesNotMatch(css, /\.hero-actions\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /min-height: 54px/);
  assert.match(css, /@media \(min-width: 901px\) \{\s*\.hero-actions \{ transform: translateX\(-8px\); \}/);

  assert.match(css, /max-width: 515px/);
  assert.match(css, /min-height: 54px/);
  assert.match(css, /min-height: 55px/);
  assert.doesNotMatch(css, /min-height: (?:65|67|68)px/);
  assert.match(css, /min-height: 58px/);
  assert.doesNotMatch(html, /class="btn btn-primary nav-cta"/);
  assert.match(html, /<a href="#download">Download<\/a>/);
  // The published native downloads are still the exact same releases.
  assert.match(html, /id="hero-mac"[^>]*v2\.8\.15\/Droply-2\.8\.15-universal\.dmg/);
  assert.match(html, /id="hero-win"[^>]*v2\.8\.15\/Droply-Setup-2\.8\.15\.exe/);
  assert.match(html, /id="hero-android"[^>]*v2\.8\.15\/Droply-Android-2\.8\.15-debug-preview\.apk/);
});
