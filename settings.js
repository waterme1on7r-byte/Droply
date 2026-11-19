const settingsSections = ['Profile', 'Downloads', 'Notifications', 'App behavior', 'Appearance', 'Updates & About', 'Transfer history', 'Troubleshooting', 'Device access'];
let accessState = { text: 'Enter an invitation to connect this device.' };
let settingsState = {}, historyItems = [], connectionText = 'Connecting to the signaling server…';
let updateState = { text: 'Check for a newer version of DROPLY.' };
function applyTheme(theme) { document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'; }
function settingsFeedback(text) { $('#settingsFeedback').textContent = text; }
async function updatePreference(key, value) {
  try { const next = await api.saveSettings({ [key]: value }); settingsState = { ...settingsState, ...next }; preferences = settingsState; applyTheme(settingsState.theme); settingsFeedback('Saved'); }
  catch (e) { settingsFeedback(e.message || 'Could not save settings.'); renderSettings(activeSettingsSection); }
}
let activeSettingsSection = 'Profile';
function openSettings(section = 'Profile') {
  $('main').inert = true;
  $('#picker').classList.add('hidden'); $('#settingsPane').classList.remove('hidden');
  renderSettings(section); $('#settingsClose').focus();
}
function closeSettings() { $('main').inert = false; $('#settingsPane').classList.add('hidden'); $('#gearBtn').focus(); }
function settingToggle(parent, key, title, hint, disabled = false) {
  const row = h('label', 'setting-row'), text = h('span', '', title), input = document.createElement('input');
  if (hint) text.append(h('small', '', hint)); input.type = 'checkbox'; input.checked = !!settingsState[key]; input.disabled = disabled;
  input.onchange = () => updatePreference(key, input.checked); row.append(text, input); parent.append(row);
}
function settingAction(parent, title, fn, primary = false) {
  const b = h('button', primary ? '' : 'ghost', title); b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { settingsFeedback(e.message || 'This action could not be completed.'); } finally { b.disabled = false; } }; parent.append(b); return b;
}
function renderHistory(parent) {
  if (!historyItems.length) { parent.append(h('p', 'intro', 'Your completed and failed transfers will appear here.')); return; }
  for (const item of historyItems) {
    const row = h('div', 'history-item'); row.append(h('b', '', item.name || 'Transfer'));
    row.append(h('small', '', `${item.direction === 'out' ? 'Sent' : 'Received'}${item.peer ? ' · ' + item.peer : ''} · ${item.state === 'done' ? 'Completed' : item.state} · ${new Date(item.date).toLocaleString()}`));
    if (item.direction === 'out' && item.state !== 'done') row.append(h('small', '', 'Retry from the transfer card, or select your files again after restarting.'));
    if (item.message) row.append(h('small', '', item.message));
    const actions = h('div', 'settings-actions');
    if (item.path) { settingAction(actions, 'Open file', () => api.historyFile(item.id, false)); settingAction(actions, 'Show in folder', () => api.historyFile(item.id, true)); }
    row.append(actions); parent.append(row);
  }
}
function renderSettings(section) {
  activeSettingsSection = section; const nav = $('#settingsNav'), body = $('#settingsContent'); nav.innerHTML = ''; body.innerHTML = ''; body.dataset.section = section;
  for (const label of settingsSections) { const b = h('button', '', label); b.setAttribute('aria-selected', String(label === section)); b.onclick = () => renderSettings(label); nav.append(b); }
  body.append(h('h3', '', section));
  const intro = text => body.append(h('p', 'intro', text));
  const actions = () => { const node = h('div', 'settings-actions'); body.append(node); return node; };
  if (section === 'Profile') {
    intro(window.DroplyWeb ? 'Your name and photo are visible to friends. Your code belongs to this browser profile and depends on this browser’s site data.' : 'Your name and photo are visible to your friends. Your code belongs to this device.');
    const av = avatar(me.avatar, me.name, true, true); av.onclick = () => openSetup(true);
    if (window.DroplyAndroid) {
      const hero = h('div', 'profile-hero'); av.classList.add('profile-hero-avatar');
      hero.append(av, h('strong', 'profile-hero-name', me.name)); body.append(hero);
    } else body.append(av, h('p', 'intro', me.name));
    settingAction(actions(), 'Edit name & photo', () => openSetup(true));
    const field = h('div', 'field settings-code'), box = h('div', 'codebox'), code = h('code'), copy = h('button', 'cp ghost');
    field.append(h('small', '', 'Your device code')); copy.innerHTML = ICON.copy; copy.setAttribute('aria-label', 'Copy device code');
    deviceCode(me.id).then(c => { code.textContent = c; copy.onclick = () => copyCode(copy, c); }); box.append(code, copy); field.append(box); body.append(field);
  } else if (section === 'Downloads') {
    if (window.DroplyWeb) {
      intro('Incoming transfers always require your approval. In Chrome or Edge, choose a folder when you accept a transfer. Files are written into a unique Droply received folder.');
      intro('Other browsers can receive up to 64 MB per transfer. Choose Download file on the completed transfer to save it through your browser. Empty folders are not included.');
    } else {
      intro('Choose where received files are saved. Incoming transfers always require your approval.');
      const code = h('code', '', settingsState.downloadDir); code.id = 'downloadPath'; body.append(code);
      const row = actions(); settingAction(row, 'Change folder', async () => { settingsState.downloadDir = await api.chooseDownloads(); code.textContent = settingsState.downloadDir; settingsFeedback('Download folder saved'); });
      settingAction(row, 'Open folder', async () => { const error = await api.openDownloads(); if (error) throw Error(error); });
      settingToggle(body, 'askSave', 'Ask where to save', 'Choose a destination for each accepted transfer.');
      intro('Folders keep their structure inside a new DROPLY transfer directory. Empty folders are not included.');
    }
  } else if (section === 'Notifications') {
    intro(window.DroplyWeb ? 'Browser notifications require permission and may not work in every browser or when the tab is closed.' : 'Choose which desktop notifications you receive. System notification permissions still apply.');
    if (window.DroplyWeb && 'Notification' in window && Notification.permission === 'default') settingAction(actions(), 'Enable browser notifications', () => Notification.requestPermission());
    settingToggle(body, 'friendNotifications', 'Friend requests', 'Notify when someone asks to add you.');
    settingToggle(body, 'incomingNotifications', 'Incoming transfers', 'Notify when a friend offers files.');
    settingToggle(body, 'completedNotifications', 'Completed transfers', 'Notify when files finish sending or saving.');
    if (!window.DroplyWeb) settingToggle(body, 'sounds', 'Notification sounds', 'Use the system notification sound when available.');
  } else if (section === 'App behavior') {
    if (window.DroplyWeb) {
      intro('This browser edition works while its tab is open. Browser startup and system tray features are available only in the desktop app.');
    } else {
      intro('Keep DROPLY available when you need it.');
      settingToggle(body, 'launchAtStartup', 'Launch at startup', settingsState.startupSupported ? 'Open DROPLY when you sign in.' : 'Available in installed Windows and macOS builds.', !settingsState.startupSupported);
      settingToggle(body, 'tray', 'Keep running when closed', 'Closing the window hides it in the system tray. Use Quit DROPLY in the tray menu to exit.');
    }
  } else if (section === 'Appearance') {
    intro('The same DROPLY layout, in your preferred palette.');
    const row = h('label', 'setting-row', 'Theme'), select = document.createElement('select'); select.setAttribute('aria-label', 'Theme');
    for (const value of ['dark', 'light']) { const option = h('option', '', value === 'dark' ? 'Dark' : 'Light'); option.value = value; select.append(option); } select.value = settingsState.theme; select.onchange = () => updatePreference('theme', select.value); row.append(select); body.append(row);
  } else if (section === 'Updates & About') {
    intro(`DROPLY ${settingsState.version || ''} · Share files with your friends.`);
    if (window.DroplyWeb) {
      intro('The browser edition updates when you reload this page. Installed desktop updates are managed separately.');
      settingAction(actions(), 'View GitHub', () => api.openGithub());
    } else {
      const status = h('p', '', updateState.text); status.id = 'updateDetail'; body.append(status);
      const progress = document.createElement('progress'); progress.id = 'updateProgress'; progress.max = 100; progress.value = updateState.percent || 0; progress.classList.toggle('hidden', updateState.percent == null); body.append(progress);
      const row = actions(); settingAction(row, 'Check for updates', () => api.checkUpdates(), true); settingAction(row, 'View GitHub', () => api.openGithub());
      intro('DROPLY checks for stable releases at startup and every four hours. You choose when to download and restart.');
    }
  } else if (section === 'Transfer history') {
    intro('The latest 300 events are saved on this device. Retry failed sends from their transfer card while DROPLY remains open.');
    const row = actions(); settingAction(row, 'Clear history', async () => { await api.clearHistory(); historyItems = []; renderSettings(section); }); renderHistory(body);
  } else if (section === 'Troubleshooting') {
    intro('Connection information and tools to help investigate a problem.');
    const detail = h('p', '', connectionText); detail.id = 'connectionDetail'; body.append(detail);
    const row = actions(); if (!window.DroplyWeb) settingAction(row, 'Open diagnostic log', () => api.openLog()); settingAction(row, 'Copy diagnostics', async () => { await api.copyDiagnostics(); settingsFeedback('Basic diagnostics copied. Device codes and credentials are excluded.'); });
  } else if (section === 'Device access') {
    intro('DROPLY normally connects this device automatically. Use recovery only if this device’s saved connection key is missing or no longer accepted.');
    const detail = h('p', '', accessState.text || 'Checking device connection…'); detail.id = 'accessDetail'; body.append(detail);
    if (['locked', 'enrollment-required'].includes(accessState.state)) {
      const recovery = h('div', 'access-recovery');
      recovery.append(h('b', '', 'Recover this device'));
      recovery.append(h('p', 'intro', 'Enter the one-time replacement invitation created for this device. It restores access to your existing profile.'));
      const codeField = h('div', 'field settings-code'), codeBox = h('div', 'codebox'), code = h('code'), copy = h('button', 'cp ghost');
      codeField.append(h('small', '', 'Device code')); copy.innerHTML = ICON.copy; copy.setAttribute('aria-label', 'Copy device code');
      deviceCode(me.id).then(value => { code.textContent = value; copy.onclick = () => copyCode(copy, value); }); codeBox.append(code, copy); codeField.append(codeBox); recovery.append(codeField);
      const field = h('label', 'access-field'); field.append(h('span', '', 'One-time invitation'));
      const invitation = document.createElement('input'); invitation.type = 'text'; invitation.maxLength = 43; invitation.autocomplete = 'off'; invitation.spellcheck = false; invitation.placeholder = 'Paste the invitation from your administrator'; invitation.setAttribute('aria-label', 'One-time replacement invitation');
      field.append(invitation); recovery.append(field);
      const row = h('div', 'settings-actions');
      settingAction(row, 'Recover this device', async () => {
        await api.enrollDevice(invitation.value.trim()); invitation.value = '';
        settingsFeedback('Invitation accepted. Reconnecting securely…');
      }, true);
      recovery.append(row); body.append(recovery);
    }
  }
}
async function initSettings() {
  const pane = h('section', 'hidden'); pane.id = 'settingsPane'; pane.setAttribute('aria-label', 'Settings');
  pane.innerHTML = '<header class="settings-head"><h2>Settings</h2><button id="settingsClose" class="closeX" aria-label="Close settings"></button></header><div class="settings-layout"><nav class="settings-nav" id="settingsNav" aria-label="Settings sections"></nav><div class="settings-content" id="settingsContent"></div></div><p id="settingsFeedback" role="status" aria-live="polite"></p>';
  document.body.append(pane); $('#settingsClose').innerHTML = ICON.xl; $('#settingsClose').onclick = closeSettings; $('#gearBtn').onclick = () => openSettings();
  if (api.getAccess) accessState = await api.getAccess();
  settingsState = await api.getSettings(); preferences = settingsState; applyTheme(settingsState.theme); historyItems = await api.getHistory();
  api.on('history-changed', list => { historyItems = list; if (activeSettingsSection === 'Transfer history' && !pane.classList.contains('hidden')) renderSettings(activeSettingsSection); });
  api.on('update-status', state => { updateState = state; const label = $('#updateDetail'), bar = $('#updateProgress'); if (label) label.textContent = state.text; if (bar) { bar.classList.toggle('hidden', state.percent == null); bar.value = state.percent || 0; } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pane.classList.contains('hidden') && $('#setup').classList.contains('hidden') && $('#ask').classList.contains('hidden')) closeSettings(); });
}
