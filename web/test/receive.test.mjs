import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../receive.js', import.meta.url)), 'utf8');
const sandbox = { window: {}, console };
runInNewContext(source, sandbox, { timeout: 1000 });
const safeName = sandbox.window.DroplyWebReceive.safeName;
test('browser downloads retain safe relative folder structures', () => {
  assert.equal(safeName('folder/photo.png').join('/'), 'folder/photo.png');
  assert.equal(safeName('sample.txt').join('/'), 'sample.txt');
});
test('incoming names cannot escape a selected folder', () => {
  for (const name of ['../secret', '/absolute', 'foo/../bar', 'a//b', 'a\\b',
    'C:drive', 'folder/CON', 'folder/bad.', 'folder/a ', '.'])
    assert.throws(() => safeName(name), name);
});
