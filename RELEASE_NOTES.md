# DROPLY 2.8.18

- Add Show QR, Copy QR, and Save QR actions to accepted friends profiles across Windows, macOS, Android, and Web.
- Keep the three QR actions together in one compact row; the QR can be expanded inline from the friend profile.
- Use the friends public device code in their QR image; friend request acceptance and transfer approval remain unchanged.
- Include the latest shared renderer and Android clipboard/Downloads QR image support in the combined platform release.
- Scale the macOS app icon to match the visual size of other Dock icons.
- Add macOS startup checkpoints to the diagnostic log to help identify launch failures.

# DROPLY 2.8.16

- Align profile identity and connection status across Windows, macOS, Android, and Web.
- Remove device badges from profile and friend photos; device names remain available in profile and friend details.
- Improve friend photo spacing, sender/receiver card alignment, and QR-code instructions spacing.
- Add the paired Add Friend / Select File panel to the Web app and prevent Web text fields from opening the keyboard automatically.
- Align the Android tablet and TV wordmark with the app icon.
- Include Windows, macOS, and a signed Android APK in one GitHub release. The Android APK installs side-by-side with the existing app and has a separate device code.

# DROPLY 2.8.12

- Restore the main window correctly from the system tray, including minimized and hidden windows.
- Move received and sent friend requests into a dedicated themed popup opened from the Friends button; keep requests out of the person picker.
- Reset the transfer animation to idle after clearing completed transfers.
- Fix file sending by retaining the sender’s WebRTC data channel when a transfer starts.

# DROPLY 2.8.11

- Fix file sending by retaining the sender's WebRTC data channel when a transfer starts.

# DROPLY 2.8.10

- Remove the manual six-digit connection-code step. Transfers start after the receiver accepts; WebRTC still encrypts the peer-to-peer connection.
- Keep the `DRP-` friend-code prefix fixed in the entry field and add separators automatically as the code is typed.
- Send the authenticated device identity before announcing a live connection, so pending friend requests are subscribed to immediately on desktop and Android.
- Fix Android tablet settings and dialog layouts so content fits the screen and long dialogs can scroll.
- Use a solid `#3c7fe8` background with a white initial for default avatars, and add a one-click remove-photo control to profile editing.
- Keep the transfer animation moving while idle in blue, during transfers in green, and after errors in red.

# DROPLY 2.8.9

- Require both people to compare and confirm the six-digit WebRTC connection code before file data is sent.
- Limit online names, photos, and regular signaling to mutually accepted friends. Device-code lookup returns only the matching device ID.
- Remove legacy unauthenticated signaling connections; all server connections require a registered device credential.
- Keep large friend lists within the signaling message limit by omitting photos from oversized updates while retaining saved friend photos.
- Fix receive-save metadata so incoming files retain their expected size through the desktop bridge.
- Prevent failed challenges and exhausted per-caller limits from consuming shared contact, newsletter, support, and admin-login quotas.
- Stream-cap newsletter and contact-admin request bodies before buffering them in memory.

# DROPLY 2.8.8

- Move the animated file packets along an arc above the shield so they stay clear of it in every transfer state.
- Shorten the light title-bar divider before the window controls and add blue hover feedback to Windows minimize and maximize/restore buttons.

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
