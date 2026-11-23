import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const js = await readFile(root + 'docs/mac-downloads.js', 'utf8');
const html = await readFile(root + 'docs/index.html', 'utf8');
const stable = 'https://github.com/waterme1on7r-byte/Droply/releases/download/v2.8.19/Droply-2.8.19-universal.dmg';

function element(href = '') {
  const attrs = {};
  return {
    href, textContent: '',
    attrs,
    setAttribute: (key, value) => { attrs[key] = value; }
  };
}

async function simulate(response, navigator = { platform: 'MacIntel' }) {
  const elements = {
    'hero-mac': element(stable),
    'download-mac': element(stable),
    'mac-download-status': element(),
    'hero-mac-version': element(),
    'mac-release-version': element(),
    'mac-universal-size': element()
  };
  const calls = [];
  runInNewContext(js, {
    document: { getElementById: id => elements[id] || null },
    navigator,
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (response instanceof Error) throw response;
      return response;
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  return { elements, calls };
}

test('the macOS hero and card both offer the exact same native Universal DMG', async () => {
  assert.match(html, /id="hero-mac"[^>]*Droply-2\.8\.19-universal\.dmg/);
  assert.match(html, /id="download-mac"[^>]*Droply-2\.8\.19-universal\.dmg/);
  assert.doesNotMatch(html, /id="download-mac-intel"/);
  const { elements: e } = await simulate({ ok: false });
  assert.equal(e['hero-mac'].href, stable);
  assert.equal(e['download-mac'].href, stable);
  assert.match(e['mac-download-status'].textContent, /One download for Apple Silicon/);
  assert.match(e['hero-mac'].attrs['aria-label'], /Apple Silicon or Intel/);
});

test('both Intel and M4 Mac users receive the same Universal DMG without browser CPU detection', async () => {
  const browsers = [
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18 Safari/605', platform: 'MacIntel' },
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/129', platform: 'MacIntel', userAgentData: { platform: 'macOS', getHighEntropyValues: async () => ({ architecture: 'arm' }) } },
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/129', platform: 'MacIntel', userAgentData: { platform: 'macOS', getHighEntropyValues: async () => ({ architecture: 'x86' }) } }
  ];
  for (const navigator of browsers) {
    const { elements: e } = await simulate({ ok: false }, navigator);
    assert.equal(e['hero-mac'].href, stable);
    assert.equal(e['download-mac'].href, stable);
  }
  assert.doesNotMatch(js, /getHighEntropyValues|MacIntel|detectArchitecture/);
});

test('latest release with a verified Universal asset updates both download links', async () => {
  const latest = 'https://github.com/waterme1on7r-byte/Droply/releases/download/v2.8.20/Droply-2.8.20-universal.dmg';
  const { elements: e, calls } = await simulate({
    ok: true, json: async () => ({ tag_name: 'v2.8.20', assets: [
      { name: 'Droply-2.8.20-universal.dmg', browser_download_url: latest, size: 227000000 }
    ] })
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\.github\.com\/repos\/waterme1on7r-byte\/Droply\/releases\/latest/);
  assert.equal(e['hero-mac'].href, latest);
  assert.equal(e['download-mac'].href, latest);
  assert.equal(e['hero-mac-version'].textContent, 'Free · Version 2.8.20');
  assert.equal(e['mac-release-version'].textContent, 'v2.8.20');
  assert.equal(e['mac-universal-size'].textContent, '227 MB');
});

test('new releases without Universal installers retain the last known working stable Universal DMG', async () => {
  const { elements: e } = await simulate({ ok: true, json: async () => ({
    tag_name: 'v2.8.21', assets: [
      { name: 'Droply-2.8.21-arm64.dmg', browser_download_url: 'https://github.com/waterme1on7r-byte/Droply/releases/download/v2.8.21/Droply-2.8.21-arm64.dmg' },
      { name: 'Droply-2.8.21.dmg', browser_download_url: 'https://github.com/waterme1on7r-byte/Droply/releases/download/v2.8.21/Droply-2.8.21.dmg' }
    ] })
  });
  assert.equal(e['hero-mac'].href, stable);
  assert.equal(e['download-mac'].href, stable);
  assert.equal(e['mac-release-version'].textContent, 'v2.8.19');
});

test('forged release asset URL is never used', async () => {
  const { elements: e } = await simulate({ ok: true, json: async () => ({
    tag_name: 'v2.8.20', assets: [
      { name: 'Droply-2.8.20-universal.dmg', browser_download_url: 'https://example.com/fake.dmg' }
    ] })
  });
  assert.equal(e['hero-mac'].href, stable);
});

test('offline and rate-limited browsers keep direct published Universal downloads', async () => {
  for (const response of [{ ok: false }, new Error('offline')]) {
    const { elements: e } = await simulate(response);
    assert.equal(e['hero-mac'].href, stable);
    assert.equal(e['download-mac'].href, stable);
  }
});
