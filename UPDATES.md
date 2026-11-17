# GitHub Releases updates

DROPLY 2.6.0 introduces electron-updater. Install this version manually once on existing devices; versions without the updater cannot discover it automatically.

Installed builds check 15 seconds after page load and every four hours. Profile > Check for updates triggers a manual check. Users approve downloads and restarts. Automatic installation on normal app quit is disabled. Active or pending transfers block update restarts. Failed checks are logged in droply.log.

## Release a version

1. Increase package.json version and refresh package-lock.json with npm install --package-lock-only.
2. Commit and push the version change.
3. Create and push the matching tag, for example git tag v2.6.0 and git push origin v2.6.0.
4. The Droply build workflow runs tests and builds both platforms. Only after both builds succeed does it create a draft GitHub Release with installers, blockmaps and latest.yml/latest-mac.yml.
5. Inspect and test the draft installers, then publish the release in GitHub. Drafts are invisible to installed clients. Keep stable releases out of prerelease mode.

Manual workflow dispatch builds downloadable Actions artifacts without creating a release. Never replace an existing release's version: ship a higher version for corrections. Keep metadata and its matching installers together.

## Configuration

Update source: public GitHub Releases at waterme1on7r-byte/Droply. No GitHub token is embedded in clients. The release job uses the workflow's temporary GITHUB_TOKEN with contents:write. Repository Actions must be enabled.

The existing tracked config.js remains supported. For secret-managed builds, remove it from Git tracking separately and configure DROPLY_SERVER_URL, DROPLY_KEY and optionally DROPLY_ICE_JSON in repository Actions secrets. Values shipped to desktop clients are accessible to their users.

macOS auto-updates require Developer ID signing. Configure CSC_LINK and CSC_KEY_PASSWORD with a macOS signing certificate, plus APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID for notarization. Both universal DMG and ZIP are generated. Without signing, a macOS build can be produced but automatic installation will not work. Use platform-specific signing configuration if adding a Windows certificate; the shared CSC_LINK here is intended for the existing macOS signing setup and should be scoped to the macOS environment.

Windows uses the existing NSIS installation. Preserve appId, productName and user-data location across versions. Signing Windows builds is recommended for trust; do not disable signature verification to bypass a signing mismatch.

## Validation and remaining deployment steps

Unit tests cover consent, manual/background checks, failures, development mode and transfer deferral. A real update still needs testing between two installed release versions on Windows and signed macOS builds. The source setup alone does not activate updates in older installations.
