import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const stable = require('../../package.json').build;
const preview = require('../../.github/universal-mac-test.build.cjs');
const html = await readFile(root + 'docs/universal-mac-test/index.html', 'utf8');
const script = await readFile(root + 'docs/universal-mac-test/preview.js', 'utf8');
const workflow = await readFile(root + '.github/workflows/universal-mac-test.yml', 'utf8');
const verifier = await readFile(root + '.github/verify-universal-mac-test.cjs', 'utf8');

test('preview code, app ID, metadata and installer path are separate from stable Droply', () => {
  assert.equal(stable.appId, 'com.droply.app');
  assert.equal(preview.appId, 'com.droply.universaltest');
  assert.equal(preview.productName, 'Droply Universal Test');
  assert.equal(preview.extraMetadata.name, 'droply-universal-test');
  assert.equal(preview.extraMetadata.productName, 'Droply Universal Test');
  assert.equal(preview.directories.output, 'dist-universal-test');
  assert.equal(preview.publish.length, 0);
  assert.equal(preview.mac.target[0].target, 'dmg');
  assert.deepEqual(preview.mac.target[0].arch, ['universal']);
  assert.ok(preview.mac.artifactName.includes('Universal-Test'));
  assert.deepEqual(stable.mac.target[0].arch, ['x64', 'arm64'],
    'Stable production installer targets must remain unchanged');
  assert.match(workflow, /--config .github\/universal-mac-test\.build\.cjs --mac --universal --publish never/);
  assert.match(workflow, /--prerelease/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(verifier, /CFBundleIdentifier/);
  assert.match(verifier, /x86_64/);
  assert.match(verifier, /arm64/);
  assert.match(verifier, /hdiutil/);
});

test('preview has clear test-only identity and no live website modification', () => {
  assert.match(html, /ISOLATED UNIVERSAL MAC TEST/);
  assert.match(html, /NOT THE LIVE DOWNLOAD PAGE/);
  assert.match(html, /Droply Universal Test\.app/);
  assert.match(html, /id="universal-test-download"[^>]*aria-disabled="true"/);
  assert.doesNotMatch(html, /id="hero-mac"/);
  assert.match(html, /href="\.\.\/"/);
  assert.match(html, /<script defer src="\.\/preview\.js"><\/script>/);
  assert.match(html, /connect-src https:\/\/api\.github\.com/);
});

function fakeElement() {
  const classes = new Set(['download-button', 'is-disabled']);
  const attrs = {};
  const listeners = {};
  return {
    textContent: '', href: undefined, disabled: false,
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    setAttribute: (key, value) => { attrs[key] = value; },
    removeAttribute: key => { delete attrs[key]; if (key === 'href') this.href = undefined; },
    addEventListener: (key, value) => { listeners[key] = value; },
    get attributes() { return attrs; },
    listeners
  };
}
async function simulate(releases, ok = true) {
  const elements = {
    'universal-test-download': fakeElement(),
    'test-download-status': fakeElement(),
    'build-version': fakeElement(),
    retry: fakeElement()
  };
  const response = { ok, json: async () => releases };
  runInNewContext(script, {
    document: { getElementById: id => elements[id] },
    fetch: async () => response
  });
  await new Promise(resolve => setImmediate(resolve));
  return elements;
}

const tag = 'universal-mac-test-v2.8.19-run42';
const assetName = 'Droply-Universal-Test-2.8.19-universal.dmg';
const asset = {
  name: assetName, size: 240000000,
  browser_download_url: 'https://github.com/waterme1on7r-byte/Droply/releases/download/' + tag + '/' + assetName
};

test('download stays disabled until test prerelease actually exists', async () => {
  const el = await simulate([]);
  assert.equal(el['universal-test-download'].href, undefined);
  assert.equal(el['universal-test-download'].attributes['aria-disabled'], 'true');
  assert.match(el['test-download-status'].textContent, /No verified Universal Mac test installer/);
});

test('valid universal prerelease enables a direct DMG download', async () => {
  const el = await simulate([{ tag_name: tag, draft: false, prerelease: true, assets: [asset] }]);
  assert.equal(el['universal-test-download'].href, asset.browser_download_url);
  assert.equal(el['universal-test-download'].attributes['aria-disabled'], undefined);
  assert.equal(el['universal-test-download'].classList.contains('is-disabled'), false);
  assert.match(el['build-version'].textContent, /240 MB/);
});

test('stable release, draft prerelease and forged download URLs never enable preview', async () => {
  const fake = { ...asset, browser_download_url: 'https://example.com/bad.dmg' };
  const el = await simulate([
    { tag_name: tag, draft: false, prerelease: false, assets: [asset] },
    { tag_name: tag, draft: true, prerelease: true, assets: [asset] },
    { tag_name: tag, draft: false, prerelease: true, assets: [fake] }
  ]);
  assert.equal(el['universal-test-download'].href, undefined);
  assert.equal(el['universal-test-download'].attributes['aria-disabled'], 'true');
});

test('GitHub API failure never presents a broken download', async () => {
  const el = await simulate(null, false);
  assert.equal(el['universal-test-download'].href, undefined);
  assert.match(el['test-download-status'].textContent, /Could not check preview builds/);
});
