// Isolated preview: only a validated, published universal TEST prerelease enables the DMG.
(() => {
  'use strict';
  const link = document.getElementById('universal-test-download');
  const status = document.getElementById('test-download-status');
  const version = document.getElementById('build-version');
  const retry = document.getElementById('retry');
  if (!link || !status || !version || !retry) return;

  const releasePrefix = 'https://github.com/waterme1on7r-byte/Droply/releases/download/';
  const tagPattern = /^universal-mac-test-v\d+(?:\.\d+){2,3}-run\d+$/;
  const assetPattern = /^Droply-Universal-Test-\d+(?:\.\d+){2,3}-universal\.dmg$/;
  const assetIsValid = (asset, tag) => !!asset &&
    typeof asset.name === 'string' && assetPattern.test(asset.name) &&
    typeof asset.browser_download_url === 'string' &&
    asset.browser_download_url === releasePrefix + tag + '/' + asset.name;

  function showUnavailable(message) {
    link.removeAttribute('href');
    link.classList.add('is-disabled');
    link.setAttribute('aria-disabled', 'true');
    link.setAttribute('tabindex', '-1');
    link.textContent = 'Universal Mac test download not ready';
    status.textContent = message;
    version.textContent = 'Stable Droply remains unchanged.';
  }

  function showReady(release, asset) {
    link.href = asset.browser_download_url;
    link.classList.remove('is-disabled');
    link.removeAttribute('aria-disabled');
    link.removeAttribute('tabindex');
    link.textContent = 'Download Universal Mac TEST .dmg';
    const size = Number.isFinite(asset.size) && asset.size > 0 ?
      ' · ' + Math.round(asset.size / 1000000) + ' MB' : '';
    version.textContent = release.tag_name + size;
    status.textContent = 'Test pre-release verified. This single installer works on Intel and Apple Silicon Macs.';
  }

  async function checkReleases() {
    retry.disabled = true;
    status.textContent = 'Checking for a verified Universal Mac test build…';
    try {
      const response = await fetch('https://api.github.com/repos/waterme1on7r-byte/Droply/releases?per_page=50', {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('GitHub API unavailable');
      const releases = await response.json();
      if (!Array.isArray(releases)) throw new Error('Invalid release data');
      const match = releases
        .filter(r => r && r.prerelease === true && r.draft === false &&
          typeof r.tag_name === 'string' && tagPattern.test(r.tag_name) &&
          Array.isArray(r.assets))
        .map(r => ({ release: r, asset: r.assets.find(a => assetIsValid(a, r.tag_name)) }))
        .find(item => item.asset);
      if (match) showReady(match.release, match.asset);
      else showUnavailable('No verified Universal Mac test installer has been published yet. Check build status and try again.');
    } catch (_) {
      showUnavailable('Could not check preview builds. Try again or view the GitHub test workflow.');
    } finally {
      retry.disabled = false;
    }
  }
  retry.addEventListener('click', checkReleases);
  checkReleases();
})();
