import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, runInNewContext } from 'node:vm';

const appScript = new URL('../install.js', import.meta.url);
function harness({ ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit Safari',
  installed = false, touchPoints = 5, platform = 'iPhone', readyState = 'complete' } = {}) {
  const windowEvents = new Map();
  const documentEvents = new Map();
  const buttonEvents = new Map();
  const help = {
    textContent: '',
    classList: {
      hidden: true,
      add(value) { if (value === 'hidden') this.hidden = true; },
      remove(value) { if (value === 'hidden') this.hidden = false; },
      contains(value) { return value === 'hidden' ? this.hidden : false; }
    },
    children: [],
    append(child) { this.children.push(child); }
  };
  const button = {
    textContent: '',
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    addEventListener(type, callback) { buttonEvents.set(type, callback); }
  };
  let banner = null;
  const header = { after(value) { banner = value; } };
  const document = {
    readyState,
    referrer: '',
    documentElement: { classList: { contains: cls => cls === 'droply-ios' && /iPad|iPhone/.test(ua) } },
    querySelector(selector) {
      if (selector === 'main > .head') return header;
      if (selector === '#homeScreenBanner') return banner;
      return null;
    },
    createElement(type) {
      if (type === 'section') return {
        id: '', className: '', attributes: {}, innerHTML: '', removed: false,
        setAttribute(k, v) { this.attributes[k] = v; },
        querySelector(sel) {
          return sel === '#homeScreenInstall' ? button : sel === '#homeScreenHelp' ? help : null;
        },
        remove() { this.removed = true; }
      };
      return { textContent: '' };
    },
    addEventListener(type, fn) { documentEvents.set(type, fn); }
  };
  const window = {
    addEventListener(type, fn) { windowEvents.set(type, fn); },
    matchMedia(query) {
      return { matches: installed && /display-mode/.test(query), addEventListener() {} };
    }
  };
  const navigator = { userAgent: ua, platform, maxTouchPoints: touchPoints, standalone: installed };
  return { document, window, navigator, events: windowEvents, documentEvents, buttonEvents,
    get banner() { return banner; }, button, help };
}
async function execute(env) {
  const source = await readFile(appScript, 'utf8');
  assert.doesNotThrow(() => new Script(source));
  runInNewContext(source, { document: env.document, window: env.window, navigator: env.navigator });
  env.documentEvents.get('DOMContentLoaded')?.();
  return env;
}

test('Add to Home Screen appears on mobile browser, not desktop or already-installed app', async () => {
  assert.ok((await execute(harness())).banner, 'iPhone browser should show install banner');
  assert.ok((await execute(harness({ ua: 'Mozilla/5.0 (Linux; Android 16; Pixel)', platform: 'Linux armv8l' }))).banner);
  assert.equal((await execute(harness({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', touchPoints: 0 }))).banner, null);
  assert.equal((await execute(harness({ installed: true }))).banner, null);
});

test('iOS opens manual Safari sharing instructions and hides after standalone installation', async () => {
  const env = await execute(harness());
  await env.buttonEvents.get('click')();
  assert.equal(env.help.classList.hidden, false);
  assert.match(env.help.textContent, /Share .*Add to Home Screen/);
  assert.match(env.help.children[0].textContent, /device code/);
  await env.buttonEvents.get('click')();
  assert.equal(env.help.classList.hidden, true);
  env.events.get('appinstalled')();
  assert.equal(env.banner.removed, true);
});

test('Android supports native browser installation prompt or a manual browser-menu fallback', async () => {
  const env = await execute(harness({ ua: 'Mozilla/5.0 (Linux; Android 16; Pixel)', platform: 'Linux armv8l' }));
  let prevented = false, prompts = 0;
  const prompt = {
    preventDefault() { prevented = true; },
    prompt() { prompts++; return Promise.resolve(); },
    userChoice: Promise.resolve({ outcome: 'accepted' })
  };
  env.events.get('beforeinstallprompt')(prompt);
  assert.equal(prevented, true);
  await env.buttonEvents.get('click')();
  assert.equal(prompts, 1);
  assert.match(env.help.textContent, /installation confirmation/);
  await env.buttonEvents.get('click')();
  assert.equal(env.help.classList.hidden, true);
  await env.buttonEvents.get('click')();
  assert.match(env.help.textContent, /browser menu/);
});

test('public browser build includes manifest and install script without modifying desktop renderer', async () => {
  const build = await readFile(new URL('../build.mjs', import.meta.url), 'utf8');
  const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../web.css', import.meta.url), 'utf8');
  assert.match(build, /'<script src="install\.js"><\/script>'/);
  assert.match(build, /'bridge\.js', 'install\.js', 'web\.css'/);
  assert.match(build, /apple-mobile-web-app-capable/);
  assert.doesNotMatch(source, /homeScreenBanner|install\.js/);
  assert.match(css, /html\.droply-web \.web-install-banner/);
  assert.match(css, /@media\(orientation:landscape\) and \(max-height:540px\)/);
});
