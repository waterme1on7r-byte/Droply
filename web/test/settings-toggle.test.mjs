import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext, Script } from 'node:vm';

const settingsUrl = new URL('../../settings.js', import.meta.url);
const androidCssUrl = new URL('../../android/app/src/main/web/android.css', import.meta.url);
const webCssUrl = new URL('../web.css', import.meta.url);

test('gear button opens Settings on the first click and closes on the second', async () => {
  const js = await readFile(settingsUrl, 'utf8');
  assert.doesNotThrow(() => new Script(js));
  const start = js.indexOf('function openSettings(');
  const end = js.indexOf('function settingToggle(', start);
  assert.ok(start >= 0 && end > start, 'Settings open/close/toggle functions must be present');
  assert.match(js, /\$\('#gearBtn'\)\.onclick = toggleSettings/);
  assert.match(js, /\$\('#settingsClose'\)\.onclick = closeSettings/);
  assert.match(js, /\$\('#gearBtn'\)\.setAttribute\('aria-controls', 'settingsPane'\)/);
  assert.match(js, /e\.key === 'Escape'[\s\S]*?closeSettings\(\)/);

  const makeNode = (initial = []) => {
    const flags = new Set(initial);
    return {
      attrs: {},
      focused: false,
      inert: false,
      classList: {
        add: value => flags.add(value),
        remove: value => flags.delete(value),
        contains: value => flags.has(value),
      },
      setAttribute(key, value) { this.attrs[key] = value; },
      focus() { this.focused = true; },
    };
  };
  const nodes = {
    main: makeNode(),
    '#picker': makeNode(),
    '#settingsPane': makeNode(['hidden']),
    '#gearBtn': makeNode(),
    '#settingsClose': makeNode(),
  };
  const sections = [];
  const scope = {
    $: selector => nodes[selector],
    renderSettings: section => sections.push(section),
  };
  runInNewContext(js.slice(start, end) +
    '\nthis.settingsToggleForTest = toggleSettings; this.closeForTest = closeSettings;', scope);

  scope.settingsToggleForTest();
  assert.equal(nodes.main.inert, true);
  assert.equal(nodes['#settingsPane'].classList.contains('hidden'), false);
  assert.equal(nodes['#picker'].classList.contains('hidden'), true);
  assert.equal(nodes['#gearBtn'].attrs['aria-expanded'], 'true');
  assert.equal(nodes['#settingsClose'].focused, true);
  assert.deepEqual(sections, ['Profile']);

  scope.settingsToggleForTest();
  assert.equal(nodes.main.inert, false);
  assert.equal(nodes['#settingsPane'].classList.contains('hidden'), true);
  assert.equal(nodes['#gearBtn'].attrs['aria-expanded'], 'false');
  assert.equal(nodes['#gearBtn'].focused, true);
  assert.deepEqual(sections, ['Profile'], 'Second click must close, not rerender');

  scope.settingsToggleForTest();
  assert.equal(nodes['#settingsPane'].classList.contains('hidden'), false);
  assert.deepEqual(sections, ['Profile', 'Profile']);

  scope.closeForTest();
  assert.equal(nodes['#settingsPane'].classList.contains('hidden'), true);
  assert.equal(nodes.main.inert, false);
});

test('mobile settings keep the gear visible and reachable for a second tap', async () => {
  const [android, web] = await Promise.all([
    readFile(androidCssUrl, 'utf8'),
    readFile(webCssUrl, 'utf8')
  ]);
  assert.match(android, /html\.droply-android-phone #settingsPane\{[\s\S]*?bottom:calc\(70px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(android, /html\.droply-android-phone \.rail\{[^}]*z-index:30/);
  assert.match(android, /html\.droply-android-tablet #settingsPane\{inset:0 0 0 80px/);
  assert.match(android, /html\.droply-android-tv #settingsPane\{inset:0 0 0 104px/);
  assert.match(web, /html\.droply-web #settingsPane\{inset:50px 0 calc\(65px/);
  assert.match(web, /html\.droply-web \.rail #gearBtn\s*\{\s*order:\s*2/);
});
