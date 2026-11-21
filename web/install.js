/* Mobile browser Home Screen install affordance.
   Installed apps and desktop clients get no banner; iOS uses manual
   Safari instructions, Chromium Android uses beforeinstallprompt when available.
   The browser installs the existing /app/ manifest, not the marketing page. */
(() => {
  'use strict';

  const ua = navigator.userAgent || '';
  const onIOS = document.documentElement.classList.contains('droply-ios') ||
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const onAndroid = /Android/i.test(ua);
  const onOtherMobile = /Mobi|Mobile/i.test(ua) && navigator.maxTouchPoints > 0;
  if (!onIOS && !onAndroid && !onOtherMobile) return;

  const mode = type => window.matchMedia?.('(display-mode: ' + type + ')').matches === true;
  const installed = () => navigator.standalone === true ||
    mode('standalone') || mode('fullscreen') || mode('minimal-ui') ||
    (document.referrer || '').startsWith('android-app://');

  if (installed()) return;

  let pendingPrompt = null;
  let banner = null;
  let button = null;
  let help = null;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    pendingPrompt = null;
    banner?.remove();
  });

  const safariBrowser = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);

  function showInstructions(message) {
    if (!help || !button) return;
    help.textContent = message || (onIOS
      ? 'In Safari, tap Share (the square with an up arrow), then Add to Home Screen and Add. If offered, enable Open as Web App.' +
        (safariBrowser ? '' : ' If this option is missing, open Droply Web in Safari.')
      : 'Open your browser menu (⋮) and choose Install app or Add to Home Screen, then confirm.');
    const note = document.createElement('small');
    note.textContent = 'The Home Screen app may have its own device code. Keep its app data to preserve that identity.';
    help.append(note);
    help.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
  }

  async function install() {
    if (installed()) {
      banner?.remove();
      return;
    }
    if (!pendingPrompt) {
      const shown = !help.classList.contains('hidden');
      if (shown) {
        help.classList.add('hidden');
        button.setAttribute('aria-expanded', 'false');
      } else showInstructions();
      return;
    }

    // prompt() must run directly from the user's click, before any await.
    const prompt = pendingPrompt;
    pendingPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') {
        if (button) button.textContent = 'Finish installation';
        showInstructions('Follow your browser’s installation confirmation to add Droply to your Home Screen.');
      } else {
        showInstructions('Installation was dismissed. You can try again through your browser menu (⋮) → Install app or Add to Home Screen.');
      }
    } catch (_) {
      showInstructions('Use your browser menu (⋮) → Install app or Add to Home Screen, then confirm.');
    }
  }

  function init() {
    if (installed()) return;
    const header = document.querySelector('main > .head');
    if (!header || document.querySelector('#homeScreenBanner')) return;

    banner = document.createElement('section');
    banner.id = 'homeScreenBanner';
    banner.className = 'web-install-banner';
    banner.setAttribute('aria-label', 'Install Droply Web');
    banner.innerHTML =
      '<div class="web-install-copy"><strong>One-tap access</strong>' +
        '<span>Keep Droply on your Home Screen.</span></div>' +
      '<button id="homeScreenInstall" class="web-install-action" type="button"' +
        ' aria-controls="homeScreenHelp" aria-expanded="false">Add to Home Screen</button>' +
      '<div id="homeScreenHelp" class="web-install-help hidden" role="status" aria-live="polite"></div>';
    header.after(banner);
    button = banner.querySelector('#homeScreenInstall');
    help = banner.querySelector('#homeScreenHelp');
    button.addEventListener('click', install);

    // iOS may switch from a browser tab to installed app mode without reload.
    for (const display of ['standalone', 'fullscreen', 'minimal-ui']) {
      window.matchMedia?.('(display-mode: ' + display + ')')
        .addEventListener?.('change', () => {
          if (installed()) banner?.remove();
        });
    }
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
