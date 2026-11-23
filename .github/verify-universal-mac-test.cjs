// Run only on macOS after the isolated universal test build.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');

const dist = path.resolve(process.argv[2] || 'dist-universal-test');
const appDirectories = [];
function findApps(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (e.name.endsWith('.app')) {
      if (!p.split(path.sep).some(part => part.endsWith('-temp'))) appDirectories.push(p);
    } else findApps(p);
  }
}
assert.ok(fs.existsSync(dist), 'Universal preview build directory missing');
findApps(dist);
assert.equal(appDirectories.length, 1, `Expected one distinct preview app, found ${appDirectories.length}`);
const app = appDirectories[0];
assert.equal(path.basename(app), 'Droply Universal Test.app');
const plist = path.join(app, 'Contents', 'Info.plist');
const readPlist = key => execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim();
assert.equal(readPlist('CFBundleIdentifier'), 'com.droply.universaltest');
const executable = path.join(app, 'Contents', 'MacOS', readPlist('CFBundleExecutable'));
const framework = path.join(app, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Electron Framework');
for (const binary of [executable, framework]) {
  const architectures = execFileSync('lipo', ['-archs', binary], { encoding: 'utf8' }).trim().split(/\s+/);
  assert.ok(architectures.includes('x86_64') && architectures.includes('arm64'),
    `Expected x86_64 + arm64 in ${binary}, got: ${architectures.join(' ')}`);
  console.log('Verified universal architectures:', binary, architectures.join(' + '));
}
const archive = path.join(app, 'Contents', 'Resources', 'app.asar');
assert.ok(fs.statSync(archive).size > 100_000, 'Application archive is missing or too small');
const filenames = new Set(asar.listPackage(archive).map(file => file.replace(/^\//, '')));
for (const required of ['main.js', 'preload.js', 'index.html', 'config.js', 'package.json']) {
  assert.ok(filenames.has(required), `Missing ${required} in preview app archive`);
}
const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
assert.equal(metadata.name, 'droply-universal-test', 'Preview app name must be isolated');
assert.equal(metadata.productName, 'Droply Universal Test', 'Preview data folder must be isolated');
const files = fs.readdirSync(dist).filter(name => /^Droply-Universal-Test-.+-universal\.dmg$/.test(name));
assert.equal(files.length, 1, `Expected one universal DMG, got ${files.join(', ')}`);
execFileSync('hdiutil', ['verify', path.join(dist, files[0])], { stdio: 'inherit' });
console.log('Validated isolated preview DMG:', files[0]);
