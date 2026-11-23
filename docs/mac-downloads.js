/* One native macOS installer for both Apple Silicon and Intel. No CPU sniffing. */
(() => {
  'use strict';
  const hero = document.getElementById('hero-mac');
  const macDownload = document.getElementById('download-mac');
  const status = document.getElementById('mac-download-status');
  if (!hero || !macDownload || !status) return;

  // Keep this published release as a working fallback when GitHub's API is unavailable.
  // The static href values in docs/index.html point to this same Universal DMG.
  const releaseBase = 'https://github.com/waterme1on7r-byte/Droply/releases/download/';
  const fallbackUrl = releaseBase + 'v2.8.19/Droply-2.8.19-universal.dmg';

  function apply(url, version, size) {
    hero.href = url;
    macDownload.href = url;
    hero.setAttribute('aria-label', 'Download Universal Droply for Apple Silicon or Intel Mac');
    macDownload.setAttribute('aria-label', 'Download Universal Droply for Apple Silicon or Intel Mac');
    status.textContent = 'One download for Apple Silicon (M1–M5) and Intel. macOS runs the native version automatically.';
    const heroVersion = document.getElementById('hero-mac-version');
    const cardVersion = document.getElementById('mac-release-version');
    const sizeLabel = document.getElementById('mac-universal-size');
    if (heroVersion) heroVersion.textContent = 'Free · Version ' + version;
    if (cardVersion) cardVersion.textContent = 'v' + version;
    if (sizeLabel && Number.isFinite(size) && size > 0)
      sizeLabel.textContent = Math.round(size / 1e6) + ' MB';
  }

  apply(fallbackUrl, '2.8.19', null);

  async function refreshLatestRelease() {
    try {
      const response = await fetch('https://api.github.com/repos/waterme1on7r-byte/Droply/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!response.ok) return;
      const release = await response.json();
      if (!release || !/^v\d+\.\d+\.\d+$/.test(release.tag_name || '') ||
          !Array.isArray(release.assets)) return;
      const version = release.tag_name.slice(1);
      const filename = 'Droply-' + version + '-universal.dmg';
      const url = releaseBase + release.tag_name + '/' + filename;
      const asset = release.assets.find(item => item?.name === filename &&
        item.browser_download_url === url);
      // New stable versions may publish before their Universal DMG is ready:
      // never replace a working link with an Intel-only download or a 404.
      if (!asset) return;
      apply(url, version, asset.size);
    } catch (_) {
      // Offline/rate-limited/API blocked: the known published Universal DMG remains usable.
    }
  }
  refreshLatestRelease();
})();
