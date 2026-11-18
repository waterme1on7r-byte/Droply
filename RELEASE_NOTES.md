# DROPLY 2.8.7

- Keep profile, friends, settings and the encrypted device credential when DROPLY is uninstalled, so reinstalling does not register a new key for the same device identity.
- Add a reusable local administrator recovery tool that accepts any device code and creates a one-time replacement invitation.
- Match the empty receiver tile to the theme accent, use rounded-square profile and friend photos throughout the app, and animate file movement between devices during transfers.

# DROPLY 2.8.5

- Added a Device access recovery screen for one-time replacement invitations when a device's saved connection key is missing or no longer accepted.
- Updated the identity-conflict message to direct users to Settings → Device access. Normal automatic connection and transfer steps are unchanged.

# DROPLY 2.8.2

- Desktop app, signaling server and future releases now share the public Droply repository.
- Removed the historical client shared key from the published Git history. Current installers use per-device credentials stored with OS encryption.
- New installations register automatically. Share your friend code to connect; no invitation is needed.
- Update downloads for new builds now come from this repository. Existing 2.8.1 installations require one manual upgrade.
- Transfer cards offer Clear all when multiple items are present, and the empty friends message points to the Add friend button.
- Existing settings, themes, transfer history, folder transfers and in-session retries are retained.
- Updated the WebSocket dependency to address memory disclosure and denial-of-service advisories.

macOS builds are unsigned until Developer ID credentials are configured; automatic macOS installation requires signing. Never publish older key-bearing installers.
