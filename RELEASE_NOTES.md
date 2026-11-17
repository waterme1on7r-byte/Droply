# DROPLY 2.8.2

- Desktop app, signaling server and future releases now share the public Droply repository.
- Removed the historical client shared key from the published Git history. Current installers use per-device credentials stored with OS encryption.
- New installations register automatically. Share your friend code to connect; no invitation is needed.
- Update downloads for new builds now come from this repository. Existing 2.8.1 installations require one manual upgrade.
- Transfer cards offer Clear all when multiple items are present, and the empty friends message points to the Add friend button.
- Existing settings, themes, transfer history, folder transfers and in-session retries are retained.
- Updated the WebSocket dependency to address memory disclosure and denial-of-service advisories.

macOS builds are unsigned until Developer ID credentials are configured; automatic macOS installation requires signing. Never publish older key-bearing installers.
