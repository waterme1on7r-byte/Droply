# DROPLY 2.6.1

## New
- Settings pane with Profile, Downloads, Notifications, App behavior, Appearance, Updates & About, Transfer history and Troubleshooting.
- Light theme alongside the existing default Dark theme; both use the same layout.
- Configurable download location, open-folder action and optional destination prompt per accepted transfer.
- Notification preferences for friend requests, incoming files and completed transfers, plus optional system sounds.
- Launch at login in installed Windows/macOS builds and optional close-to-tray behavior.
- Version information, update checks and update-download progress.
- Persistent history of the latest 300 transfer events with actions for received files.
- Folder selection and folder drag-and-drop, preserving nested file paths inside a new transfer directory.
- Retry failed outgoing transfers from their transfer cards during the current app session.
- Clearer connection interruption and network failure messages, diagnostic-log access and copyable basic diagnostics.

- Public GitHub Releases update feed, with the source repository kept private.

## Fixes
- Device codes now have a dedicated Add friend popup opened by the sidebar + button.
- Removed the title-bar border beneath the Windows controls.
- Load the app page by its absolute application path.

## Before upgrading
- Existing versions need one manual installer upgrade to gain the updater.
- Folder sharing requires DROPLY 2.6.0 or newer on both devices. Up to 1,000 files per batch; empty folders are omitted.
- Retry starts from the beginning. After restarting DROPLY, select the source files again.
- macOS automatic update installation requires a signed app.
- Incoming transfers still require explicit approval.

## Verification
- 56 behavioral tests pass.
- Browser checks cover Settings navigation, both themes and the minimum window size.
- Real local WebRTC tests verify nested-folder content and retry after a declined request.
- Native Electron checks verify settings persistence and close-to-tray behavior.
- Windows NSIS packaging succeeds. Cross-device and signed macOS update installation remain release validation steps.
