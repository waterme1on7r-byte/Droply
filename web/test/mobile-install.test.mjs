import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, runInNewContext } from 'node:vm';

const installScript = new URL('../install.js', import.meta.url);
function harness({ ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit Safari',
  installed = false, touchPoints = 5, platform = 'iPhone', modernInstall } = {}) {
  const events = new Map(), documentEvents = new Map(), buttons = new Map();
  let panel;
  const guide = {
    innerHTML: '',
    attributes: {},
    classList: {
      hidden: true,
      add(k) { if (k === 'hidden') this.hidden = true; },
      remove(k) { if (k === 'hidden') this.hidden = false; },
      contains(k) { return k === 'hidden' && this.hidden; }
    }
  };
  function button() {
    return { textContent: '', attrs: {},
      setAttribute(k,v) { this.attrs[k] = v; },
      addEventListener(type,fn) { this.click = fn; }
    };
  }
  const installButton = button(), dismissButton = button(), caption = { textContent: '' };
  const header = { after(el) { panel = el; } };
  const document = {
    readyState: 'complete', referrer: '',
    documentElement: { classList: { contains: key => key === 'droply-ios' && /iPhone|iPad/.test(ua) } },
    querySelector(s) { return s === 'main > .head' ? header : s === '#homeScreenBanner' ? panel : null; },
    createElement(tag) {
      if (tag !== 'section') return {};
      return {
        innerHTML: '', attributes: {}, id: '', className: '',
        setAttribute(k,v) { this.attributes[k] = v; },
        querySelector(s) {
          return ({ '#homeScreenInstall': installButton, '#homeScreenDismiss': dismissButton,
            '#homeScreenHelp': guide, '.web-install-copy span': caption })[s] || null;
        },
        remove() { this.removed = true; }
      };
    },
    addEventListener(type, fn) { documentEvents.set(type,fn); }
  };
  const window = {
    addEventListener(type, fn) { events.set(type,fn); },
    matchMedia(q) { return { matches: installed && q.includes('display-mode:'), addEventListener() {} }; }
  };
  const navigator = { userAgent: ua, platform, maxTouchPoints: touchPoints,
    standalone: installed, ...(modernInstall ? { install: modernInstall } : {}) };
  return { document, window, navigator, events, documentEvents, installButton, dismissButton, guide,
    get panel() { return panel; } };
}
async function execute(env) {
  const src = await readFile(installScript,'utf8');
  assert.doesNotThrow(() => new Script(src));
  runInNewContext(src, { document: env.document, window: env.window, navigator: env.navigator });
  env.documentEvents.get('DOMContentLoaded')?.();
  return env;
}
const androidUA = 'Mozilla/5.0 (Linux; Android 16; Pixel) AppleWebKit Chrome Mobile Safari';

test('mobile browsers show a small install banner; desktop and installed apps do not', async () => {
  assert.ok((await execute(harness())).panel);
  assert.ok((await execute(harness({ua:androidUA,platform:'Linux armv8l'}))).panel);
  assert.equal((await execute(harness({ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X)',platform:'MacIntel',touchPoints:0}))).panel,undefined);
  assert.equal((await execute(harness({installed:true}))).panel,undefined);
});

test('iOS instantly shows the shortest install path and one tap opens a two-step visual guide', async () => {
  const env = await execute(harness());
  assert.match(env.panel.innerHTML, /Tap Share → Add to Home Screen/);
  await env.installButton.click();
  assert.equal(env.guide.classList.hidden, false);
  assert.match(env.guide.innerHTML, /Tap <strong>Share<\/strong>/);
  assert.match(env.guide.innerHTML, /<strong>Add to Home Screen<\/strong>/);
  assert.match(env.guide.innerHTML, /Open as Web App/);
  assert.equal(env.installButton.attrs['aria-expanded'], 'true');
  await env.installButton.click();
  assert.equal(env.guide.classList.hidden, true);
  env.events.get('appinstalled')();
  assert.equal(env.panel.removed,true);
});

test('Android uses captured install prompt in one click; no unnecessary instructions', async () => {
  const env = await execute(harness({ua:androidUA,platform:'Linux armv8l'}));
  let prompts = 0, prevented = false;
  env.events.get('beforeinstallprompt')({
    preventDefault() { prevented = true; },
    prompt() { prompts++; return Promise.resolve(); },
    userChoice: Promise.resolve({outcome:'accepted'})
  });
  assert.equal(prevented,true);
  assert.equal(env.installButton.textContent,'Install Droply');
  await env.installButton.click();
  assert.equal(prompts,1);
  assert.equal(env.guide.classList.hidden,true);
  env.events.get('appinstalled')();
  assert.equal(env.panel.removed,true);
});

test('modern navigator.install API is preferred for direct one-tap installation', async () => {
  let installs = 0;
  const env = await execute(harness({ua:androidUA,platform:'Linux armv8l',
    modernInstall() { installs++; return Promise.resolve(); }}));
  assert.equal(env.installButton.textContent,'Install Droply');
  await env.installButton.click();
  assert.equal(installs,1);
  assert.equal(env.panel.removed,true);
});

test('fallback instructions are short, and the tip can be dismissed', async () => {
  const env = await execute(harness({ua:androidUA,platform:'Linux armv8l'}));
  await env.installButton.click();
  assert.match(env.guide.innerHTML, /Browser menu/);
  assert.match(env.guide.innerHTML, /Install app/);
  env.dismissButton.click();
  assert.equal(env.panel.removed,true);
});

test('install button, icons and styles are browser-only; desktop renderer remains untouched', async () => {
  const [build,source,css] = await Promise.all([
    new URL('../build.mjs',import.meta.url),
    new URL('../../index.html',import.meta.url),
    new URL('../web.css',import.meta.url)
  ].map(url=>readFile(url,'utf8')));
  assert.match(build, /'<script src="install\.js"><\/script>'/);
  assert.match(build, /'bridge\.js', 'install\.js', 'web\.css'/);
  assert.match(build, /exportPwaIcons\(root, output\)/);
  assert.doesNotMatch(source, /homeScreenBanner|install\.js/);
  assert.match(css, /html\.droply-web \.web-install-steps/);
  assert.match(css, /html\.droply-web \.web-install-dismiss/);
});
