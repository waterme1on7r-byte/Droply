'use strict';

// GitHub Pages serves inline CSS and JS under a strict Content Security Policy.
// Browsers discard the *entire* inline stylesheet if even one character changes
// without updating its sha256 hash. This check must run before publishing.
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const mode = process.argv[2] || '--check';
if (!['--check', '--fix'].includes(mode)) {
  console.error('Usage: node scripts/site-csp.cjs [--check|--fix]');
  process.exit(2);
}
const file = resolve(__dirname, '../docs/index.html');
let html = readFileSync(file, 'utf8');
const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)">/i);
if (!meta) throw new Error('Website has no CSP meta tag');

const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
const js = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/\bsrc\s*=/.test(match[1]));
if (css.length !== 1 || js.length !== 1) {
  throw new Error('Expected one inline CSS and one inline JS block; review CSP before publishing');
}

function hash(body) {
  // HTML parsers normalize line endings before CSP sees inline blocks.
  return 'sha256-' + createHash('sha256')
    .update(body.replace(/\r\n?/g, '\n'), 'utf8').digest('base64');
}
function updateDirective(csp, directive, expected) {
  const regex = new RegExp('(^|;\\s*)(' + directive + '\\s+)([^;]*)');
  const found = csp.match(regex);
  if (!found) throw new Error('CSP missing ' + directive);
  const oldHashes = found[3].match(/'sha256-[^']+'/g) || [];
  if (oldHashes.length !== 1) {
    throw new Error('Expected exactly one ' + directive + ' hash');
  }
  return csp.replace(regex, (whole, prefix, name, values) =>
    prefix + name + values.replace(oldHashes[0], "'" + expected + "'"));
}
let next = updateDirective(meta[1], 'style-src', hash(css[0][1]));
next = updateDirective(next, 'script-src', hash(js[0][2]));
const updated = html.replace(meta[0], meta[0].replace(meta[1], next));
if (mode === '--check') {
  if (updated !== html) {
    console.error('FAIL: Website CSP hashes do not match the inline CSS / JS. CSS may disappear entirely in browsers. Run: node scripts/site-csp.cjs --fix');
    process.exit(1);
  }
  console.log('Website inline style and script CSP hashes verified.');
} else {
  if (updated !== html) writeFileSync(file, updated, 'utf8');
  console.log(updated === html ? 'Website CSP hashes already valid.' : 'Website CSP hashes updated.');
}
