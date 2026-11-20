(() => {
  'use strict';
  document.documentElement.classList.add('droply-web');
  // iPadOS can advertise itself as macOS; touch capability distinguishes it
  // from a Mac without affecting Android or desktop browser layouts.
  const iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iosDevice) document.documentElement.classList.add('droply-ios');
  if (/iPhone|iPod/.test(navigator.userAgent)) document.documentElement.classList.add('droply-iphone');
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

  // Use the same friend-strip hook as the Android renderer, without changing
  // the shared desktop HTML or duplicating its friend and selection state.
  const friendStrip = document.createElement('section');
  friendStrip.id = 'webFriendsStrip';
  friendStrip.setAttribute('aria-label', 'Friends');
  friendStrip.innerHTML = '<div class="strip-heading"><b>Friends</b><small>0 online · 0 offline</small></div><div class="strip-friends"></div>';
  document.querySelector('.pairwrap').before(friendStrip);
  window.renderAndroidFriends = (friends, peers, selected, resolvePlatform) => {
    const online = new Set(peers.map(peer => peer.id));
    const list = friendStrip.querySelector('.strip-friends');
    list.replaceChildren();
    friendStrip.querySelector('.strip-heading small').textContent =
      `${friends.filter(friend => online.has(friend.id)).length} online · ${friends.filter(friend => !online.has(friend.id)).length} offline`;
    if (!friends.length) {
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'strip-empty ghost';
      empty.textContent = 'Add your first friend';
      empty.onclick = () => document.querySelector('#addFriendBtn').click();
      list.append(empty);
    }
    [...friends].sort((a, b) =>
      Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name)
    ).forEach(friend => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'strip-friend' +
        (online.has(friend.id) ? ' online' : '') + (friend.id === selected ? ' selected' : '');
      button.setAttribute('aria-pressed', String(friend.id === selected));
      button.setAttribute('aria-label', friend.name + ', ' + (online.has(friend.id) ? 'online' : 'offline'));
      const frame = document.createElement('span');
      frame.className = 'strip-avatar';
      const image = avatar(friend.av, friend.name);
      const badge = withDeviceBadge(image, resolvePlatform?.(friend.id));
      const dot = document.createElement('i');
      dot.className = 'strip-dot';
      frame.append(badge, dot);
      const name = document.createElement('span');
      name.className = 'strip-name';
      name.textContent = friend.name;
      const status = document.createElement('small');
      status.textContent = online.has(friend.id) ? 'Online' : 'Offline';
      attachFriendHover(frame, friend.id);
      button.append(frame, name, status);
      button.onclick = () => selectFriend(friend.id);
      list.append(button);
    });
  };
  document.addEventListener('DOMContentLoaded', () => {
    const main = document.querySelector('main');
    // iOS Web only: use the approved two-button mobile transfer panel.
    // Reuse existing friend and file inputs instead of altering the renderer.
    if (iosDevice) {
      const drop = document.querySelector('#drop');
      if (drop) {
        const actions = document.createElement('div');
        actions.className = 'ios-upload-actions';
        actions.setAttribute('role', 'group');
        actions.setAttribute('aria-label', 'Transfer actions');
        actions.innerHTML =
          '<button type="button" class="ios-add-friend">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<circle cx="9" cy="7" r="3.4"/><path d="M2.5 20v-2c0-3.2 2.6-5.2 6.5-5.2s6.5 2 6.5 5.2v2M19 9v8m-4-4h8"/>' +
            '</svg><span>Add Friend</span></button>' +
          '<span class="ios-action-divider" aria-hidden="true"></span>' +
          '<button type="button" class="ios-select-file">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M6 2.5h8l4.5 4.5V21H6zM14 2.5V7h4.5"/>' +
            '</svg><span>Select File</span></button>';
        drop.querySelector('.ico')?.after(actions);
        actions.querySelector('.ios-add-friend').addEventListener('click', event => {
          event.stopPropagation();
          document.querySelector('#addFriendBtn')?.click();
        });
        actions.querySelector('.ios-select-file').addEventListener('click', event => {
          event.stopPropagation();
          if (drop.classList.contains('off')) {
            // Avoid silently selecting a file that cannot yet be sent.
            const noFriends = document.querySelector('#peerSub')?.textContent === 'No friends yet';
            document.querySelector(noFriends ? '#addFriendBtn' : '#peerBox')?.click();
            return;
          }
          document.querySelector('#fi')?.click();
        });
      }
    }
    const head = main?.querySelector('.head');
    if (head) {
      const banner = document.createElement('details');
      banner.className = 'web-note';
      banner.setAttribute('role', 'note');
      const heading = document.createElement('summary');
      heading.className = 'web-note-title';
      heading.textContent = window.DroplyPrivatePreview
        ? 'Welcome to the Droply Web preview'
        : 'Welcome to Droply Web';
      const introduction = document.createElement('p');
      introduction.textContent = 'This browser has its own device code. Keep this site’s data to keep your identity, and choose where incoming files are saved.';
      const privacy = document.createElement('p');
      privacy.className = 'web-note-privacy';
      privacy.textContent = 'A quick privacy note: Your identity credentials are stored in this browser, not protected by your device’s secure keychain.';
      banner.append(heading, introduction, privacy);
      main.append(banner);
    }
    const label = document.querySelector('#titlebar');
    if (label) label.firstChild.textContent = window.DroplyPrivatePreview ? 'Droply · Private test' : 'Droply · Web';
    const update = document.querySelector('#updateBtn');
    if (update) update.classList.add('hidden');
  });
})();
