/* macOS download recommendations. UA strings never prove Intel vs Apple silicon. */
(() => {
  'use strict';

  const hero = document.getElementById('hero-mac');
  const armLink = document.getElementById('download-mac');
  const intelLink = document.getElementById('download-mac-intel');
  const status = document.getElementById('mac-download-status');
  if (!hero || !armLink || !intelLink || !status) return;

  const options = { arm64: armLink, x64: intelLink };
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  // iPadOS can identify as "MacIntel" when requesting a desktop website.
  const isIPad = /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMac = !isIPad && !/Android/i.test(ua) &&
    (/Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua));
  let detectedArchitecture = null;
  let universalUrl = null;

  function applyRecommendation() {
    for (const [architecture, link] of Object.entries(options)) {
      const recommended = architecture === detectedArchitecture;
      link.classList.toggle('btn-primary', recommended);
      link.classList.toggle('btn-outline', !recommended);
      const label = link.querySelector('[data-mac-recommended]');
      if (label) label.hidden = !recommended;
    }

    // Keep the hero download direct; the Mac card now exposes both direct installers.
    // When architecture cannot be read, prefer a Universal build if published; until
    // then use the Intel build, which can run on Apple Silicon using macOS Rosetta.
    const selectedUrl = detectedArchitecture
      ? options[detectedArchitecture].href
      : (universalUrl || intelLink.href);
    hero.href = selectedUrl;

    if (detectedArchitecture) {
      const name = detectedArchitecture === 'arm64' ? 'Apple Silicon' : 'Intel';
      hero.setAttribute('aria-label', `Download Droply for ${name} Mac`);
      status.textContent = `Your browser reports ${name}. The matching installer is highlighted above; both buttons download directly.`;
    } else {
      // Never treat "MacIntel" as Intel CPU proof: Safari uses it on Apple Silicon too.
      hero.setAttribute('aria-label', 'Download Droply for Mac');
      status.textContent = isMac
        ? 'Choose Apple Silicon or Intel above. Not sure? Check Apple menu → About This Mac. Each button starts a download.'
        : 'Downloading for a Mac? Choose Apple Silicon or Intel above. Each button starts a download.';
    }
  }

  async function detectArchitecture() {
    if (!isMac || typeof navigator.userAgentData?.getHighEntropyValues !== 'function') return null;
    try {
      const hints = await navigator.userAgentData.getHighEntropyValues(['architecture']);
      const architecture = String(hints?.architecture || '').toLowerCase();
      if (/^(arm|arm64|aarch64)$/.test(architecture)) return 'arm64';
      if (/^(x86|x86_64|amd64)$/.test(architecture)) return 'x64';
    } catch (_) {
      // Safari, privacy settings and unsupported browsers use the compatible fallback.
    }
    return null;
  }

  function downloadUrl(asset) {
    const url = asset?.browser_download_url;
    return typeof url === 'string' &&
      url.startsWith('https://github.com/waterme1on7r-byte/Droply/releases/download/')
      ? url : null;
  }

  async function refreshLatestRelease() {
    try {
      const response = await fetch('https://api.github.com/repos/waterme1on7r-byte/Droply/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!response.ok) return;
      const release = await response.json();
      if (!Array.isArray(release.assets)) return;
      const armAsset = release.assets.find(asset => /^Droply-[0-9][0-9A-Za-z.\-]*-arm64\.dmg$/i.test(asset.name));
      const intelAsset = release.assets.find(asset => /^Droply-[0-9][0-9A-Za-z.\-]*\.dmg$/i.test(asset.name) && !/-arm64\.dmg$/i.test(asset.name));
      const armUrl = downloadUrl(armAsset);
      const intelUrl = downloadUrl(intelAsset);
      const universalAsset = release.assets.find(asset => /^Droply-[0-9][0-9A-Za-z.\-]*-universal\.dmg$/i.test(asset.name));
      const nextUniversalUrl = downloadUrl(universalAsset);
      // Only replace known-good fallback URLs if both architecture-specific files exist.
      if (!armUrl || !intelUrl) return;
      armLink.href = armUrl;
      intelLink.href = intelUrl;
      universalUrl = nextUniversalUrl;
      if (/^v?[0-9]+(?:\.[0-9]+){1,3}$/.test(release.tag_name || '')) {
        const version = release.tag_name.replace(/^v/, '');
        const versionLabel = document.getElementById('mac-release-version');
        const heroVersion = document.getElementById('hero-mac-version');
        if (versionLabel) versionLabel.textContent = `v${version}`;
        if (heroVersion) heroVersion.textContent = `Free · Version ${version}`;
      }
      for (const [asset, id] of [[armAsset, 'mac-arm-size'], [intelAsset, 'mac-intel-size']]) {
        const label = document.getElementById(id);
        if (label && Number.isFinite(asset.size) && asset.size > 0)
          label.textContent = `${Math.round(asset.size / 1e6)} MB`;
      }
      applyRecommendation();
    } catch (_) {
      // Offline, rate-limited or blocked: the known published release links still work.
    }
  }

  applyRecommendation();
  detectArchitecture().then(architecture => {
    detectedArchitecture = architecture;
    applyRecommendation();
  });
  refreshLatestRelease();
})();
