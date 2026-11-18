const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdater } = require('../updater');
function fixture({ packaged = true, available = true, busy = false, choices = [0, 0], fail = false } = {}) {
  const updater = new EventEmitter(), messages = []; let downloads = 0, installs = 0, checks = 0;
  updater.checkForUpdates = async () => { checks++; if (fail) throw Error('offline'); return { isUpdateAvailable: available, updateInfo: { version: '2.7.0' } }; };
  updater.downloadUpdate = async () => { downloads++; updater.emit('update-downloaded'); };
  updater.quitAndInstall = () => installs++;
  const controller = createUpdater({ app: { isPackaged: packaged, getVersion: () => '2.6.0' }, getUpdater: () => updater,
    showDialog: async o => { messages.push(o); return { response: choices.shift() ?? 0 }; },
    isBusy: async () => busy });
  return { controller, updater, messages, get downloads() { return downloads; }, get installs() { return installs; }, get checks() { return checks; } };
}
test('development builds never query or install updates', async () => {
  const f = fixture({ packaged: false }); await f.controller.check(true); assert.equal(f.checks, 0); assert.equal(f.installs, 0);
});
test('update requires download and restart consent', async () => {
  const f = fixture(); await f.controller.check(true); assert.equal(f.downloads, 1); assert.equal(f.installs, 1);
  assert.equal(f.updater.autoInstallOnAppQuit, false); assert.equal(f.updater.autoDownload, false);
});
test('declining download leaves installation alone', async () => {
  const f = fixture({ choices: [1] }); await f.controller.check(); assert.equal(f.downloads, 0); assert.equal(f.installs, 0);
});
test('active transfers defer installation and retain downloaded update', async () => {
  const f = fixture({ busy: true }); await f.controller.check(); await f.controller.check(true);
  assert.equal(f.downloads, 1); assert.equal(f.checks, 1); assert.equal(f.installs, 0);
});
test('no update is quiet in background and visible on manual check', async () => {
  const f = fixture({ available: false }); await f.controller.check(); assert.equal(f.messages.length, 0);
  await f.controller.check(true); assert.match(f.messages[0].message, /up to date/);
});
test('network failures are handled without installing', async () => {
  const f = fixture({ fail: true }); await f.controller.check(true); assert.equal(f.installs, 0); assert.match(f.messages[0].message, /Could not/);
});
