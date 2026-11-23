// Production release gate: confirm native universal slices AND the original Droply identity.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');

const dir = path.resolve(process.argv[2] || 'dist-universal-release');
const apps = [];
function findApps(folder) {
  for (const e of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(folder, e.name);
    if (e.name.endsWith('.app')) {
      if (!p.split(path.sep).some(s => s.endsWith('-temp'))) apps.push(p);
    } else findApps(p);
  }
}
assert.ok(fs.existsSync(dir), 'Production Universal build directory is missing');
findApps(dir);
assert.equal(apps.length, 1, 'Expected one production Universal app; got ' + apps.join(', '));
const bundle = apps[0];
assert.equal(path.basename(bundle), 'Droply.app',
  'Do not publish the TEST app or an installer with a different identity');
const plist = path.join(bundle, 'Contents', 'Info.plist');
const read = key => execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim();
assert.equal(read('CFBundleIdentifier'), 'com.droply.app');
assert.equal(read('CFBundleName'), 'Droply');
const executable = path.join(bundle, 'Contents', 'MacOS', read('CFBundleExecutable'));
const electron = path.join(bundle, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Electron Framework');
for (const bin of [executable, electron]) {
  const arches = execFileSync('lipo', ['-archs', bin], { encoding: 'utf8' }).trim().split(/\s+/);
  assert.ok(arches.includes('x86_64') && arches.includes('arm64'),
    'Missing native Intel/Apple Silicon code in ' + bin + ': ' + arches.join(', '));
  console.log('Verified x86_64 + arm64:', bin);
}
const archive = path.join(bundle, 'Contents', 'Resources', 'app.asar');
assert.ok(fs.statSync(archive).size > 4096, 'App archive missing or empty');
const members = new Set(asar.listPackage(archive).map(f => f.replace(/^\//, '')));
for (const f of ['main.js', 'preload.js', 'index.html', 'config.js', 'updater.js', 'desktop.js', 'settings.js', 'package.json']) {
  assert.ok(members.has(f), 'Missing ' + f + ' in production app');
}
const main = asar.extractFile(archive, 'main.js').toString('utf8');
const html = asar.extractFile(archive, 'index.html').toString('utf8');
assert.ok(main.length > 10000 && main.includes("process.argv.includes('--diagnose-startup')"),
  'Production startup code is missing or incomplete');
assert.ok(html.length > 30000 && html.includes('DROPLY'),
  'Production user interface is missing or incomplete');
const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
assert.equal(metadata.name, 'droply', 'Must preserve existing app data directory');
assert.equal(metadata.productName, 'Droply', 'Must preserve existing production app name');
assert.equal(metadata.build.appId, 'com.droply.app', 'Must preserve original app identity');
const version = metadata.version;
const name = 'Droply-' + version + '-universal.dmg';
assert.ok(/^\d+\.\d+\.\d+$/.test(version));
assert.ok(fs.statSync(path.join(dir, name)).size > 10000000, 'Production Universal DMG is missing or too small');
execFileSync('hdiutil', ['verify', path.join(dir, name)], { stdio: 'inherit' });
console.log('Verified production Universal installer:', name);
