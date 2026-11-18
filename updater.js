// GitHub feed is embedded by electron-builder; never ship a GitHub token to clients.
function createUpdater({ app, showDialog, getUpdater, isBusy, onStatus = () => {}, log = () => {} }) {
  let updater, running = false, ready = false, prompt = false;
  const message = (message, detail = '', buttons = ['OK']) => showDialog({ title: 'DROPLY updates', message, detail, buttons });
  async function install() {
    if (await isBusy()) {
      await message('Finish your transfers first.', 'The update is ready. Use Check for updates when your transfers are finished.');
      return;
    }
    const result = await message('Update downloaded', 'Restart DROPLY to install the update?', ['Restart and install', 'Later']);
    // Transfers can start while the dialog is visible. Check again before quitting.
    if (result.response === 0) {
      if (await isBusy()) return message('Finish your transfers first.');
      updater.quitAndInstall();
    }
  }
  function init() {
    if (updater) return updater;
    updater = getUpdater();
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.logger = { info: (...a) => log('updater', ...a), warn: (...a) => log('updater', ...a), error: (...a) => log('updater', ...a), debug: () => {} };
    updater.on('checking-for-update', () => onStatus({ text: 'Checking for updates...' }));
    updater.on('update-not-available', () => onStatus({ text: 'You are up to date.' }));
    updater.on('update-available', i => onStatus({ text: `Version ${i.version} is available.` }));
    updater.on('download-progress', p => onStatus({ text: `Downloading update ... ${Math.round(p.percent)}%`, percent: p.percent }));
    updater.on('error', () => onStatus({ text: 'Update failed. Check your connection and try again.' }));
    updater.on('error', e => log('updater error', e));
    updater.on('update-downloaded', () => { ready = true; onStatus({ text: 'Update ready to install.', percent: 100 }); });
    return updater;
  }
  async function check(manual = false) {
    if (!app.isPackaged) {
      if (manual) await message('Updates are available in installed builds.', 'Development copies do not install updates.');
      return;
    }
    if (running || prompt) {
      if (manual) await message('An update check or download is already in progress.');
      return;
    }
    running = true;
    try {
      init();
      if (ready) return await install();
      const result = await updater.checkForUpdates();
      if (!result || !result.isUpdateAvailable) {
        if (manual) await message('DROPLY is up to date.', `Current version: ${app.getVersion()}`);
        return;
      }
      prompt = true;
      const choice = await message(`DROPLY ${result.updateInfo.version} is available`, 'Download this update? You can keep using DROPLY while it downloads.', ['Download', 'Later']);
      prompt = false;
      if (choice.response !== 0) return;
      await updater.downloadUpdate();
      ready = true;
      await install();
    } catch (e) {
      log('update failed', e);
      if (manual) await message('Could not complete the update.', 'Check your connection and try again from your profile. If no release has been published yet, try again later.');
    } finally { running = false; prompt = false; }
  }
  function start() {
    if (!app.isPackaged) return;
    const first = setTimeout(() => check(), 15000);
    const periodic = setInterval(() => check(), 4 * 60 * 60 * 1000);
    first.unref(); periodic.unref();
    app.once('before-quit', () => { clearTimeout(first); clearInterval(periodic); });
  }
  return { check, start };
}
module.exports = { createUpdater };
