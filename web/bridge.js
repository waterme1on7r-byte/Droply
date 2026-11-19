(() => {
  'use strict';
  document.documentElement.classList.add('droply-web');
  const store = window.DroplyWebStore, net = window.DroplyWebNetwork, receive = window.DroplyWebReceive;
  const CODE = /^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
  async function getHistory() { return store.history(); }
  const api = {
    getWindowChrome: async () => ({ custom: false, rightControls: false, maximized: false }),
    windowControl: async () => false,
    getProfile: () => store.profile(),
    saveProfile: patch => store.saveProfile(patch),
    getFriends: () => store.friends(),
    saveFriends: value => store.saveFriends(value),
    getSettings: () => store.settings(),
    saveSettings: patch => store.saveSettings(patch),
    getHistory,
    clearHistory: async () => {
      await store.set('history', []);
      net.emit('history-changed', []);
    },
    recordTransfer: async item => {
      const updated = await store.record(item);
      if (updated) net.emit('history-changed', updated);
    },
    getAccess: () => net.access(),
    connectServer: () => net.start(),
    sendSignal: message => net.sendSignal(message),
    enrollDevice: invitation => net.enrollDevice(invitation),
    prepareReceive: (tid, files) => receive.prepareReceive(tid, files),
    finishReceive: tid => receive.finishReceive(tid),
    saveOpen: (tid, name, size) => receive.saveOpen(tid, name, size),
    saveChunk: (tid, data) => receive.saveChunk(tid, data),
    saveClose: tid => receive.saveClose(tid),
    saveAbort: tid => receive.saveAbort(tid),
    showFile: path => receive.showFile(path),
    freeSpace: async () => null,
    chooseDownloads: async () => 'Choose a folder when accepting files (Chrome / Edge)',
    openDownloads: async () => {
      window.alert('Files are saved in the folder you chose for each transfer. Other browsers show a Download file link in the transfer list.');
    },
    historyFile: async () => {
      window.alert('Previous downloads are managed by your browser or the folder you chose when accepting a transfer.');
    },
    copy: text => {
      if (CODE.test(text)) navigator.clipboard?.writeText(text).catch(() => {});
    },
    copyDiagnostics: async () => {
      const status = await net.access();
      await navigator.clipboard.writeText('Droply Web\n' + navigator.userAgent + '\n' +
        'Server status: ' + status.state + '\nFile System Access: ' + (typeof showDirectoryPicker === 'function'));
    },
    notify: (kind, body) => {
      const preference = { friend: 'friendNotifications', incoming: 'incomingNotifications',
        completed: 'completedNotifications' }[kind];
      if (!preference || typeof body !== 'string'
        || !('Notification' in window) || Notification.permission !== 'granted') return;
      store.settings().then(settings => {
        if (settings[preference]) new Notification('Droply', { body: body.slice(0, 240) });
      }).catch(() => {});
    },
    openGithub: () => window.open('https://github.com/waterme1on7r-byte/Droply', '_blank', 'noopener,noreferrer'),
    openLog: () => window.alert('Browser diagnostics are available in the developer console. Do not share browser storage or credentials.'),
    checkUpdates: async () => {
      net.emit('update-status', { text: 'The web app updates when you reload this page.' });
    },
    dialogResponse: async () => true,
    on: (channel, fn) => net.on(channel, fn)
  };
  window.api = api;
  window.DroplyWeb = true;
  document.addEventListener('DOMContentLoaded', () => {
    const main = document.querySelector('main');
    const head = main?.querySelector('.head');
    if (head) {
      const banner = document.createElement('div');
      banner.className = 'web-note';
      banner.setAttribute('role', 'note');
      banner.textContent = 'Browser edition · Each browser has its own device code. Keep site data intact to keep your identity. Credentials are stored in this browser, not protected by your operating system keychain. You choose where received files go.';
      head.after(banner);
    }
    const label = document.querySelector('#titlebar');
    if (label) label.firstChild.textContent = 'Droply · Web';
    const update = document.querySelector('#updateBtn');
    if (update) update.classList.add('hidden');
  });
})();
