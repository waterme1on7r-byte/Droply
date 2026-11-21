/* Lightweight mobile Home Screen install affordance.
   iOS cannot open the system Add to Home Screen action from JavaScript.
   Android / supported browsers get the native install sheet on one tap. */
(() => {
  'use strict';

  const ua = navigator.userAgent || '';
  const ios = document.documentElement.classList.contains('droply-ios') ||
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const mobile = ios || android || (/Mobi|Mobile/i.test(ua) && navigator.maxTouchPoints > 0);
  if (!mobile) return;

  const matchMode = mode => window.matchMedia?.('(display-mode: ' + mode + ')').matches === true;
  const installed = () => navigator.standalone === true ||
    matchMode('standalone') || matchMode('fullscreen') || matchMode('minimal-ui') ||
    (document.referrer || '').startsWith('android-app://');

  if (installed()) return;

  const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
  const shareIcon = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V2m0 0L8 6m4-4 4 4M5 11H3v10h18V11h-2"/></svg>';
  const homeIcon = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8m-4-4h8"/></svg>';

  let promptEvent = null, panel, button, guide, caption;
  let busy = false;
  let dismissed = false;

  function updateButton() {
    if (!button) return;
    button.textContent = !ios && (typeof navigator.install === 'function' || promptEvent)
      ? 'Install Droply' : 'Add to Home Screen';
  }

  function hideBanner() {
    panel?.remove();
    panel = null;
  }

  function instructions() {
    const iOSFirst = safari ? 'Share' : 'Share';
    if (ios) {
      guide.innerHTML =
        '<div class="web-install-steps">' +
        '<span class="web-install-step"><b>1</b>' + shareIcon + '<span>Tap <strong>' + iOSFirst + '</strong>' +
          '<small>or ••• then Share</small></span></span>' +
        '<span class="web-install-arrow" aria-hidden="true">→</span>' +
        '<span class="web-install-step"><b>2</b>' + homeIcon +
          '<span><strong>Add to Home Screen</strong><small>then Add</small></span></span></div>' +
        '<p class="web-install-tip">Choose <strong>Open as Web App</strong> if prompted.' +
          (safari ? '' : ' If missing, open this page in Safari.') + '</p>';
    } else {
      guide.innerHTML =
        '<div class="web-install-steps">' +
        '<span class="web-install-step"><b>1</b><span class="web-install-menu-icon" aria-hidden="true">⋮</span><span><strong>Browser menu</strong></span></span>' +
        '<span class="web-install-arrow" aria-hidden="true">→</span>' +
        '<span class="web-install-step"><b>2</b>' + homeIcon + '<span><strong>Install app</strong><small>or Add to Home Screen</small></span></span></div>';
    }
    guide.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
  }

  function toggleInstructions() {
    if (guide.classList.contains('hidden')) instructions();
    else {
      guide.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');
    }
  }

  async function onInstall() {
    if (busy || installed()) {
      if (installed()) hideBanner();
      return;
    }
    // The API and event prompt require transient activation. Call them
    // synchronously in this click handler, before any awaited operation.
    if (!ios && typeof navigator.install === 'function') {
      busy = true;
      try {
        await navigator.install();
        hideBanner();
      } catch (error) {
        if (error?.name !== 'AbortError') instructions();
      } finally {
        busy = false;
      }
      return;
    }
    if (!ios && promptEvent) {
      busy = true;
      const saved = promptEvent;
      promptEvent = null;
      updateButton();
      try {
        await saved.prompt();
        const choice = await saved.userChoice;
        if (choice?.outcome === 'accepted') {
          button.textContent = 'Adding Droply…';
          // appinstalled removes the banner when the browser finishes.
        } else {
          instructions();
        }
      } catch (_) {
        instructions();
      } finally {
        busy = false;
      }
      return;
    }
    toggleInstructions();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    updateButton();
  });
  window.addEventListener('appinstalled', hideBanner);
  window.addEventListener('pageshow', () => { if (installed()) hideBanner(); });

  function init() {
    if (installed() || dismissed) return;
    const header = document.querySelector('main > .head');
    if (!header || document.querySelector('#homeScreenBanner')) return;

    panel = document.createElement('section');
    panel.id = 'homeScreenBanner';
    panel.className = 'web-install-banner';
    panel.setAttribute('aria-label', 'Add Droply Web to your Home Screen');
    panel.innerHTML =
      '<div class="web-install-mark" aria-hidden="true">' + homeIcon + '</div>' +
      '<div class="web-install-copy"><strong>Droply on your Home Screen</strong>' +
      '<span>' + (ios ? 'Tap Share → Add to Home Screen' : 'Open Droply like an app.') + '</span></div>' +
      '<button id="homeScreenInstall" class="web-install-action" type="button"' +
      ' aria-controls="homeScreenHelp" aria-expanded="false">Add to Home Screen</button>' +
      '<button id="homeScreenDismiss" class="web-install-dismiss" type="button" aria-label="Hide Home Screen tip">×</button>' +
      '<div id="homeScreenHelp" class="web-install-help hidden" role="region" aria-label="Home Screen installation steps"></div>';
    header.after(panel);
    button = panel.querySelector('#homeScreenInstall');
    guide = panel.querySelector('#homeScreenHelp');
    caption = panel.querySelector('.web-install-copy span');
    button.addEventListener('click', onInstall);
    panel.querySelector('#homeScreenDismiss').addEventListener('click', () => {
      dismissed = true;
      hideBanner();
    });
    updateButton();
    for (const display of ['standalone', 'fullscreen', 'minimal-ui'])
      window.matchMedia?.('(display-mode: ' + display + ')')?.addEventListener?.('change', () => {
        if (installed()) hideBanner();
      });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
