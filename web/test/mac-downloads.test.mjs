import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = await readFile(root + 'docs/mac-downloads.js', 'utf8');

const armFallback = 'https://github.com/waterme1on7r-byte/Droply/releases/download/v2.8.19/Droply-2.8.19-arm64.dmg';
const intelFallback = 'https://github.com/waterme1on7r-byte/Droply/releases/download/v2.8.19/Droply-2.8.19.dmg';

function element(href = '') {
  const classes = new Set(['btn', 'btn-outline']);
  const recommended = { hidden: true };
  const attrs = {};
  return {
    href, textContent: '',
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
        return !!enabled;
      },
      contains: name => classes.has(name)
    },
    querySelector: selector => selector === '[data-mac-recommended]' ? recommended : null,
    setAttribute: (name, value) => { attrs[name] = value; },
    recommended, attrs
  };
}

async function simulate(navigator, response = { ok: false }) {
  const elements = {
    'hero-mac': element(intelFallback),
    'download-mac': element(armFallback),
    'download-mac-intel': element(intelFallback),
    'mac-download-status': element(),
    'mac-arm-size': element(),
    'mac-intel-size': element(),
    'mac-release-version': element(),
    'hero-mac-version': element()
  };
  const calls = [];
  runInNewContext(script, {
    document: { getElementById: id => elements[id] || null },
    navigator,
    fetch: async (url, options) => { calls.push({ url, options }); return response; }
  });
  // Flush asynchronous browser architecture and release metadata handlers.
  await new Promise(resolve => setImmediate(resolve));
  return { elements, calls };
}

test('Safari-style MacIntel is never assumed to be an Intel CPU', async () => {
  const { elements: e } = await simulate({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15',
    platform: 'MacIntel', maxTouchPoints: 0
  });
  assert.equal(e['hero-mac'].href, intelFallback);
  assert.match(e['mac-download-status'].textContent, /Choose Apple Silicon or Intel above/);
  for (const id of ['download-mac', 'download-mac-intel']) {
    assert.ok(e[id].classList.contains('btn-outline'));
    assert.equal(e[id].recommended.hidden, true);
  }
});

test('Apple Silicon browser architecture makes arm64 the recommendation', async () => {
  const { elements: e } = await simulate({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel', maxTouchPoints: 0,
    userAgentData: {
      platform: 'macOS',
      getHighEntropyValues: async () => ({ architecture: 'arm' })
    }
  });
  assert.equal(e['hero-mac'].href, armFallback);
  assert.ok(e['download-mac'].classList.contains('btn-primary'));
  assert.ok(e['download-mac-intel'].classList.contains('btn-outline'));
  assert.equal(e['download-mac'].recommended.hidden, false);
  assert.equal(e['download-mac-intel'].href, intelFallback);
});

test('Intel architecture makes x64 the recommendation, preserving Apple Silicon choice', async () => {
  const { elements: e } = await simulate({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel', maxTouchPoints: 0,
    userAgentData: {
      platform: 'macOS',
      getHighEntropyValues: async () => ({ architecture: 'x86', bitness: '64' })
    }
  });
  assert.equal(e['hero-mac'].href, intelFallback);
  assert.ok(e['download-mac-intel'].classList.contains('btn-primary'));
  assert.ok(e['download-mac'].classList.contains('btn-outline'));
  assert.equal(e['download-mac-intel'].recommended.hidden, false);
  assert.equal(e['download-mac'].href, armFallback);
});

test('iPad desktop user agent and Windows never receive a Mac processor recommendation', async () => {
  for (const navigator of [
    {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      platform: 'MacIntel', maxTouchPoints: 5,
      userAgentData: { getHighEntropyValues: async () => ({ architecture: 'arm' }) }
    },
    {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32',
      userAgentData: { platform: 'Windows', getHighEntropyValues: async () => ({ architecture: 'x86' }) }
    }
  ]) {
    const { elements: e } = await simulate(navigator);
    assert.equal(e['hero-mac'].href, intelFallback);
    assert.ok(e['download-mac'].classList.contains('btn-outline'));
    assert.ok(e['download-mac-intel'].classList.contains('btn-outline'));
  }
});

test('unavailable processor hints stay manual and missing release metadata keeps working fallback links', async () => {
  const { elements: e } = await simulate({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel', maxTouchPoints: 0,
    userAgentData: { platform: 'macOS', getHighEntropyValues: async () => { throw new Error('blocked'); } }
  }, { ok: false });
  assert.equal(e['hero-mac'].href, intelFallback);
  assert.equal(e['download-mac'].href, armFallback);
  assert.equal(e['download-mac-intel'].href, intelFallback);
});

test('latest release metadata refreshes both links without changing the architecture choice', async () => {
  const armLatest = 'https://github.com/waterme1on7r-byte/Droply/releases/download/v2.9.0/Droply-2.9.0-arm64.dmg';
  const intelLatest = 'https://github.com/waterme1on7r-byte/Droply/releases/download/v2.9.0/Droply-2.9.0.dmg';
  const { elements: e, calls } = await simulate({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel', maxTouchPoints: 0,
    userAgentData: { platform: 'macOS', getHighEntropyValues: async () => ({ architecture: 'arm' }) }
  }, {
    ok: true,
    json: async () => ({
      tag_name: 'v2.9.0',
      assets: [
        { name: 'Droply-2.9.0-arm64.dmg', size: 125000000, browser_download_url: armLatest },
        { name: 'Droply-2.9.0.dmg', size: 132000000, browser_download_url: intelLatest }
      ]
    })
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\.github\.com\/repos\/waterme1on7r-byte\/Droply\/releases\/latest/);
  assert.equal(e['download-mac'].href, armLatest);
  assert.equal(e['download-mac-intel'].href, intelLatest);
  assert.equal(e['hero-mac'].href, armLatest);
  assert.equal(e['mac-release-version'].textContent, 'v2.9.0');
  assert.equal(e['hero-mac-version'].textContent, 'Free · Version 2.9.0');
  assert.equal(e['mac-arm-size'].textContent, '125 MB');
  assert.equal(e['mac-intel-size'].textContent, '132 MB');
});

test('incomplete release assets never replace the known matching architecture links', async () => {
  const { elements: e } = await simulate({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0
  }, {
    ok: true,
    json: async () => ({ tag_name: 'v3.0.0', assets: [
      { name: 'Droply-3.0.0-arm64.dmg', browser_download_url: 'https://github.com/waterme1on7r-byte/Droply/releases/download/v3.0.0/Droply-3.0.0-arm64.dmg' }
    ] })
  });
  assert.equal(e['download-mac'].href, armFallback);
  assert.equal(e['download-mac-intel'].href, intelFallback);
});

test('Hero Mac button uses a Universal installer when one is published', async () => {
  const universal = 'https://github.com/waterme1on7r-byte/Droply/releases/download/v2.9.0/Droply-2.9.0-universal.dmg';
  const { elements: e } = await simulate({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15',
    platform: 'MacIntel', maxTouchPoints: 0
  }, {
    ok: true,
    json: async () => ({ tag_name: 'v2.9.0', assets: [
      { name: 'Droply-2.9.0-arm64.dmg', browser_download_url: 'https://github.com/waterme1on7r-byte/Droply/releases/download/v2.9.0/Droply-2.9.0-arm64.dmg' },
      { name: 'Droply-2.9.0.dmg', browser_download_url: 'https://github.com/waterme1on7r-byte/Droply/releases/download/v2.9.0/Droply-2.9.0.dmg' },
      { name: 'Droply-2.9.0-universal.dmg', browser_download_url: universal }
    ] })
  });
  assert.equal(e['hero-mac'].href, universal);
  assert.match(e['mac-download-status'].textContent, /Choose Apple Silicon or Intel above/);
});
