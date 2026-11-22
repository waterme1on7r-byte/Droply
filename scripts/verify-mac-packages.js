const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const distDir = path.resolve(process.argv[2] || 'dist');
const appBundles = [];

function findApps(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      if (!fullPath.split(path.sep).some(part => part.endsWith('-temp'))) appBundles.push(fullPath);
      continue;
    }
    if (entry.isDirectory()) findApps(fullPath);
  }
}

if (!fs.existsSync(distDir)) throw new Error(`Build output directory does not exist: ${distDir}`);
findApps(distDir);

if (appBundles.length !== 2) {
  throw new Error(`Expected separate Intel and Apple silicon app bundles; found ${appBundles.length}: ${appBundles.join(', ')}`);
}

for (const appBundle of appBundles) {
  const archivePath = path.join(appBundle, 'Contents', 'Resources', 'app.asar');
  if (!fs.existsSync(archivePath)) throw new Error(`Missing app archive: ${archivePath}`);
  const stats = fs.statSync(archivePath);
  if (stats.size < 100_000) throw new Error(`App archive is unexpectedly small (${stats.size} bytes): ${archivePath}`);

  const files = new Set(asar.listPackage(archivePath).map(file => file.replace(/^\//, '')));
  for (const requiredFile of ['main.js', 'preload.js', 'index.html', 'config.js']) {
    if (!files.has(requiredFile)) throw new Error(`Missing ${requiredFile} in ${archivePath}`);
  }

  const main = asar.extractFile(archivePath, 'main.js').toString('utf8');
  if (!main.includes("process.argv.includes('--diagnose-startup')")) {
    throw new Error(`The diagnostic startup option is missing from ${archivePath}`);
  }

  console.log(`Verified ${appBundle}: ${stats.size} byte app archive with startup files and diagnostics.`);
}
