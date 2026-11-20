# DROPLY

**Send files and folders directly to people you know.** Share a device code, accept the friend request, approve the transfer, and Droply sends files over a peer-to-peer connection.

[![Latest release](https://img.shields.io/github/v/release/waterme1on7r-byte/Droply?display_name=tag&label=release)](https://github.com/waterme1on7r-byte/Droply/releases/latest)
[![Server tests](https://github.com/waterme1on7r-byte/Droply/actions/workflows/server-test.yml/badge.svg)](https://github.com/waterme1on7r-byte/Droply/actions/workflows/server-test.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Download:** [Windows](https://github.com/waterme1on7r-byte/Droply/releases/latest) · [macOS](https://github.com/waterme1on7r-byte/Droply/releases/latest)

> The latest public release is available on the [Releases page](https://github.com/waterme1on7r-byte/Droply/releases). macOS downloads are currently unsigned and may require manual approval in macOS. See [Updates and release notes](#updates-and-releases).

## Browser edition (preview)

The web app reuses Droply's desktop interface, friend requests, and peer-to-peer WebRTC transfers. It is publicly accessible at [Use Droply Web](https://waterme1on7r-byte.github.io/Droply/app/), hosted as static files alongside the marketing website.

- Public app: `https://waterme1on7r-byte.github.io/Droply/app/`, built automatically by the GitHub Pages Actions workflow.
- Private test path: `/internal/preview/` on a **separate Render gateway**, still protected by a server-side password. The production signaling service remains unchanged.
- Local preview: `npm run web:dev`, then open `http://localhost:4173/app/`.
- Build and test: `npm run web:build` and `npm run web:test`.

The public web app connects to the existing private Render gateway using a strictly allowlisted GitHub Pages origin, with device-token authentication. GitHub Pages is static hosting; the free-tier gateway and production signaling service can still cause cold-start delays.

Browser identities use IndexedDB/Web Crypto rather than Electron's OS-protected credential storage. Chrome/Edge can stream incoming files into a folder explicitly selected on acceptance; other browsers use a 64 MiB per-transfer download fallback. See [the web app guide](web/README.md) for setup, security differences, browser compatibility, and required end-to-end testing.

## How it works

1. Install Droply and choose a name and optional photo.
2. Share your device code with a friend, or enter theirs in **Add friend**.
3. Accept the friend request on the receiving device.
4. Choose a friend, select files or a folder, and send. The receiver approves the transfer and chooses where files are saved.

Droply does not require a user account, email address, phone number, or administrator approval for normal setup. Device codes identify devices in Droply; they are not passwords.

## Features

- Direct device-to-device file transfers using WebRTC.
- Share individual files or folders while preserving folder structure. Empty folders are not included.
- Review and approve every incoming transfer.
- Choose a default download folder or choose a destination for each transfer.
- See transfer progress, speed, connection status, and transfer history. Retry a failed send while the app is open.
- Friend requests, online status, desktop notifications, and optional notification sounds.
- Profile photo and device code controls, dark and light themes, and optional system tray behavior.
- Automatic update checks with user-controlled download and restart.
- Settings for diagnostics, updates, profile, downloads, notifications, and app behavior.

## Downloads and platforms

Get the current installers from [GitHub Releases](https://github.com/waterme1on7r-byte/Droply/releases/latest).

- **Windows:** installer (`.exe`). Uninstalling preserves the app profile, settings, friends, and encrypted device credential so a reinstall can continue with the same identity.
- **macOS:** universal `.dmg` and `.zip`; macOS 12 Monterey or later is required. Builds are unsigned until Developer ID signing is configured, so macOS automatic installation is not available for unsigned builds.

Official release builds currently target Windows and macOS. Linux packaging is not part of the published release workflow.

## Privacy and security

- File contents travel directly between the two devices over WebRTC; the signaling server is used to connect devices and share presence and connection details, not to store or relay file contents.
- The receiver approves every incoming transfer. WebRTC encrypts the peer-to-peer connection automatically; there is no extra code to compare before sending.
- Device credentials are generated per installation and encrypted using Electron `safeStorage` before they are saved. The renderer does not receive the credential; the server stores a hash.
- The signaling service shares names, photos and online status only between devices that have mutually accepted each other as friends. Friend-code lookup reveals only the matched device ID to the person who entered the code.
- Desktop configuration contains public connection settings only. Server administrator tokens and database credentials belong only in the server host's secret environment and must never be committed or packaged with the desktop app.
- Device codes are identifiers. Share them with people you intend to connect with, and do not share administrator recovery invitations.

See [Device access and security](ACCESS_ROLLOUT.md) and [signaling server documentation](server/README.md) for implementation and deployment details.

## Build from source

### Requirements

- Node.js 22 (used by the desktop build workflow).
- npm.
- Windows or macOS to create the corresponding installer.

### Run the desktop app

```sh
git clone https://github.com/waterme1on7r-byte/Droply.git
cd Droply
npm ci
```

Create the local runtime configuration from the example and set `SERVER_URL` to a WebSocket URL for a compatible Droply signaling server. The example uses a placeholder address:

```sh
cp config.example.js config.js
```

Then start the app:

```sh
npm start
```

`config.js` is local runtime configuration and is not committed. It must contain only the public signaling URL and ICE server configuration; never put `ADMIN_TOKEN`, database passwords, or other server secrets in it.

### Architecture

- **Desktop app:** Electron main process handles saved profile data, OS-protected device credentials, local file operations, notifications, and updates. The interface is built with HTML, CSS, and JavaScript.
- **Signaling service:** Node.js HTTP and WebSocket service handles registration, online presence, friend signaling, and WebRTC connection negotiation. PostgreSQL holds registered-device credential hashes and recovery invitations.
- **File transfer:** WebRTC data channels carry files directly between sender and receiver. The signaling service does not relay file contents.

### Tests and packaging

```sh
npm test              # desktop tests
npm run check-config  # validate runtime configuration
npm run dist          # package for the current operating system
```

The signaling server has a separate test suite:

```sh
cd server
npm ci
npm test
```

Or run it from the repository root after installing server dependencies:

```sh
npm --prefix server ci
npm run server:test
```

## Signaling server

The server enables device registration, friend presence, and WebRTC signaling. It does not relay the file payload. For local setup, required environment variables, Render deployment, database configuration, and operational limits, see [server/README.md](server/README.md).

Production deployments need a persistent PostgreSQL database and server-side secrets such as `DATABASE_URL` and `ADMIN_TOKEN`. Do not use ephemeral local files as the production identity store. Preserve the existing production database and environment when changing deployment settings.

## Administrator device recovery

Recovery is for exceptional cases where an existing device identity is on the server but its local credential is missing or unusable. It is not part of normal friend setup.

With Node.js installed and a clone of this repository, run `Start-Droply-Recovery.cmd` on Windows. From the repository root on another platform, run:

```sh
npm run recovery-tool
```

Enter the affected device code and the private server `ADMIN_TOKEN` in the local page. The tool creates a one-use replacement invitation that expires after 15 minutes. Enter that invitation on the affected device under **Settings → Device access**. Keep the token and invitation private, and close the tool when finished. The tool does not save or print the administrator token.

## Updates and releases

Installed builds check for stable updates after launch and every four hours. You can also check from **Settings → Updates & About**. Droply asks before downloading and restarting; an active or pending transfer postpones a restart.

To prepare a release, update `package.json` and `package-lock.json` to the same new version, run tests, commit and push `main`, and push a matching tag such as `v2.8.9`. The [build workflow](.github/workflows/build.yml) validates the version, runs desktop tests, builds Windows and universal macOS installers, and creates a **draft** GitHub release with the update metadata. Review and test the draft installers before publishing. Keep the installers and `latest.yml` / `latest-mac.yml` metadata together; never reuse a published version.

More details: [UPDATES.md](UPDATES.md) and [release notes](RELEASE_NOTES.md).

## Contributing

Issues and pull requests are welcome. Please include the operating system, app version, and steps to reproduce for bug reports. Do not include device credentials, administrator tokens, database URLs, private logs, or personal files in an issue. Run the relevant desktop or server tests before submitting a change.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for the full text.
