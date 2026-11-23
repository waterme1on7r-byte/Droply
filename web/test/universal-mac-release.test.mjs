import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const stable = require('../../package.json');
const universal = require('../../.github/universal-mac-release.build.cjs');
const workflow = await readFile(root + '.github/workflows/publish-universal-mac.yml', 'utf8');
const verifier = await readFile(root + '.github/verify-universal-mac-release.cjs', 'utf8');

test('Universal release retains the real Droply identity and stable version', () => {
  assert.equal(stable.name, 'droply');
  assert.equal(stable.build.appId, 'com.droply.app');
  assert.equal(stable.build.productName, 'Droply');
  assert.equal(universal.appId, stable.build.appId);
  assert.equal(universal.productName, stable.build.productName);
  assert.equal(universal.extraMetadata, undefined, 'Do not accidentally retain the test app name');
  assert.equal(universal.directories.output, 'dist-universal-release');
  assert.deepEqual(universal.mac.target, [{ target: 'dmg', arch: ['universal'] }]);
  assert.equal(universal.mac.mergeASARs, false, 'Universal ASAR merger previously made an empty archive');
  assert.equal(universal.mac.artifactName, 'Droply-${version}-universal.${ext}');
  assert.deepEqual(universal.publish, [], 'The Mac builder must never overwrite the release directly');
  assert.deepEqual(stable.build.mac.target[0].arch, ['x64', 'arm64'],
    'Existing production arch-specific release configuration should not change');
});

test('Universal Mac release checks must be required before publishing', () => {
  assert.match(workflow, /runs-on: macos-latest/);
  assert.match(workflow, /--config .github\/universal-mac-release\.build\.cjs --mac --universal --publish never/);
  assert.match(workflow, /node .github\/verify-universal-mac-release\.cjs/);
  assert.match(workflow, /needs: build/);
  assert.match(workflow, /sha256sum -c SHA256SUMS-Universal-Mac\.txt/);
  assert.match(workflow, /gh release upload "\$tag" "\$file" SHA256SUMS-Universal-Mac\.txt/);
  assert.doesNotMatch(workflow, /--clobber/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /Latest stable tag changed/);
  assert.match(verifier, /CFBundleIdentifier/);
  assert.match(verifier, /com\.droply\.app/);
  assert.match(verifier, /x86_64/);
  assert.match(verifier, /arm64/);
  assert.match(verifier, /hdiutil/);
  assert.match(verifier, /app\.asar/);
  assert.match(verifier, /metadata\.name, 'droply'/);
});
