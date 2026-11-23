import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
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
    const item = actions.match(new RegExp('<a id="' + id + '"[^\\n]*<\\/a>\\s*<p class="hero-requirements">([^<]*<span(?:\\s+[^>]*)?>[^<]*<\\/span>){2}<\\/p>'));
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
  assert.match(css, /max-width: 1064px/);
  assert.match(css, /max-width: 676px/);
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
  // One native universal DMG is a direct click from the hero and the Mac card.
  assert.match(html, /id="hero-mac"[^>]*v2\.8\.19\/Droply-2\.8\.19-universal\.dmg/);
  assert.doesNotMatch(html, /id="download-mac-auto"/);
  assert.doesNotMatch(html, /<details class="mac-download-alternatives">/);
  const macCard = html.slice(html.indexOf('<div class="download-card"><div class="download-card-title">'), html.indexOf('<div class="download-card"><div class="download-card-title">', html.indexOf('<div class="download-card"><div class="download-card-title">') + 1));
  assert.match(macCard, /<div class="mac-download-choices">/);
  assert.match(macCard, /id="download-mac"/);
  assert.doesNotMatch(macCard, /id="download-mac-intel"/);
  assert.match(macCard, /Apple Silicon \+ Intel/);
  assert.match(html, /<script defer src="mac-downloads\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="mac-downloads\.css">/);
  assert.match(html, /connect-src [^";]*https:\/\/api\.github\.com/);
  assert.match(html, /id="hero-win"[^>]*v2\.8\.19\/Droply-Setup-2\.8\.19\.exe/);
  assert.match(html, /id="hero-android"[^>]*v2\.8\.19\/Droply-Android-2\.8\.19\.apk/);
  assert.match(html, /id="download-mac"[^>]*v2\.8\.19\/Droply-2\.8\.19-universal\.dmg/);
  assert.doesNotMatch(html, /id="download-mac-intel"/);
  assert.match(html, /id="mac-download-status"[^>]*aria-live="polite"/);
});


test('mobile theme switching fades on modern and older browsers, except reduced motion', async () => {
  const html = await readFile(root + 'docs/index.html', 'utf8');
  const css = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i)?.[1];
  const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/.test(match[1]))[0]?.[2];
  const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)">/i)?.[1];
  assert.ok(css && script && csp, 'Expected site CSS, script and CSP');
  for (const [name, body] of [['style-src', css], ['script-src', script]]) {
    const expected = createHash('sha256').update(body).digest('base64');
    assert.ok(csp.match(new RegExp(name + '[^;]*')).at(0).includes("'sha256-" + expected + "'"),
      name + ' CSP hash must match the published inline content');
  }
  assert.match(css, /::view-transition-old\(root\)/);
  assert.match(css, /html\.theme-fade-fallback\.theme-fade-out body\s*\{\s*opacity:\s*0/);
  assert.match(css, /transition:\s*opacity 425ms ease-in-out/);
  assert.doesNotMatch(script, /if\s*\(isIOSWebKit\)/, 'iOS must not bypass the animation');

  const start = script.indexOf("themeToggle.addEventListener('click', async () => {");
  const end = script.indexOf("// Highlight the visitor's platform", start);
  assert.ok(start > 0 && end > start, 'Expected executable theme toggle handler');
  const handlerSource = script.slice(start, end);

  async function runMobileCase({ native, reduced }) {
    const events = [];
    const classes = new Set();
    let handler;
    const rootElement = {
      classList: {
        add: (...names) => { names.forEach(n => classes.add(n)); events.push('add:' + names.join(',')); },
        remove: (...names) => { names.forEach(n => classes.delete(n)); events.push('remove:' + names.join(',')); }
      }
    };
    const doc = { documentElement: rootElement };
    if (native) doc.startViewTransition = callback => {
      events.push('native');
      callback();
      return { finished: Promise.resolve() };
    };
    const context = {
      changingTheme: false,
      selectedTheme: 'dark',
      themeMotion: { matches: reduced },
      themeImagesReady: Promise.resolve(),
      themeKey: 'droply-website-theme',
      themeToggle: { addEventListener: (type, fn) => {
        assert.equal(type, 'click');
        handler = fn;
      }},
      applyWebsiteTheme: name => events.push('theme:' + name),
      document: doc,
      window: { localStorage: { setItem: () => {} } },
      // Simulate iOS WebKit to catch a future accidental early return.
      isIOSWebKit: true,
      requestAnimationFrame: callback => callback(),
      setTimeout: callback => callback()
    };
    runInNewContext(handlerSource, context);
    assert.equal(typeof handler, 'function');
    await handler();
    assert.ok(events.includes('theme:light'), 'Theme must become light');
    if (reduced) {
      assert.ok(!events.includes('native'));
      assert.ok(!events.some(e => e.startsWith('add:theme-fade-')), 'No fallback fade should start');
    } else if (native) {
      assert.ok(events.includes('native'), 'iOS with native support must crossfade');
      assert.ok(!events.some(e => e.startsWith('add:theme-fade-')), 'No fallback fade should start');
    } else {
      assert.ok(events.includes('add:theme-fade-out'), 'Older iOS must fade out');
      assert.ok(events.includes('remove:theme-fade-out'), 'Older iOS must fade back in');
      assert.ok(events.indexOf('add:theme-fade-out') < events.indexOf('theme:light'));
      assert.ok(events.indexOf('remove:theme-fade-out') > events.indexOf('theme:light'));
    }
    assert.equal(classes.size, 0, 'Transition classes must be removed');
    await handler();
    assert.equal(events.filter(e => e === 'theme:dark').length, 1, 'Second tap returns to dark');
  }
  await runMobileCase({ native: true, reduced: false });
  await runMobileCase({ native: false, reduced: false });
  await runMobileCase({ native: true, reduced: true });
});
