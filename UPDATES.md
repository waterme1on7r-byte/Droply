# GitHub Releases updates

The desktop app, server and releases now share the public waterme1on7r-byte/Droply repository. New installers read updates from its GitHub Releases. No GitHub token is embedded in the app. Existing 2.8.1 installations use the previous feed and require one manual upgrade to 2.8.2 or newer.

## Release a version

1. Increase package.json and package-lock.json to the same version.
2. Run desktop and server tests, commit and push main.
3. Push the matching version tag, for example v2.8.2.
4. The build workflow tests and packages Windows and universal macOS installers, then creates a draft release using this repository's GITHUB_TOKEN.
5. Test the installers and publish the draft when ready. Keep installers, blockmaps and latest.yml/latest-mac.yml together. Never reuse an already published version.

Manual workflow dispatch creates Actions build artifacts without creating a release. Older key-bearing installers stay private and must not be copied into public releases. The former DROPLY_RELEASE_TOKEN is no longer needed.

## Runtime configuration

Tracked config.js contains public server and ICE configuration only. npm run check-config rejects shared KEY configuration. Server administrator tokens and database credentials must never be packaged with the desktop app.

macOS automatic installation requires Developer ID signing. Configure CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID in GitHub Actions for signed/notarized macOS distribution. Without signing, manual installation remains necessary. Windows retains the same appId, product name and user-data location so upgrades preserve identity and settings.

## Update behavior

Installed apps check shortly after launch and every four hours. Settings includes a manual check. Users approve downloads and restarts, and active or pending transfers block update restarts. Automatic installation on normal app quit is disabled. Failures are recorded in droply.log.

Unit tests cover update consent, failed checks, development mode and transfer deferral. A real update between two installed releases remains a release validation step.
