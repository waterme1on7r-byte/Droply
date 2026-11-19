# Droply Web

The browser edition of Droply is generated from the **same HTML, CSS, and JavaScript renderer** as the desktop app. It connects to the existing signaling server and uses the same friend requests and WebRTC data-channel file transfers. The marketing website in docs/index.html is not changed.

## Run locally

Install Node.js 22+, then run from the repository root:

    npm run web:dev

Open http://localhost:4173/app/. The preview runs only on loopback. It serves the generated browser client without Electron. To test live friend requests and transfers, the signaling service must permit this exact origin (see below), and a second online Droply device must be available.

To build the deployable static files without running the local server:

    npm run web:build
    npm run web:test

The output is docs/app/ (ignored in git). GitHub Actions builds that folder before publishing docs/ to GitHub Pages. The normal marketing website remains at /; the web app is at /app/.

## Signaling server configuration

Add your *actual* website origin to WEB_ALLOWED_ORIGINS on the existing Droply server, then redeploy without resetting the database. For example:

    WEB_ALLOWED_ORIGINS=https://waterme1on7r-byte.github.io,http://localhost:4173

For a custom domain, replace or add that exact HTTPS origin. Do not include a path such as /Droply/app, a trailing slash, a wildcard, or untrusted origins.

Only the browser auth endpoints (/auth/status, /auth/register and /auth/enroll) receive CORS headers. Browser WebSocket upgrades are also restricted by Origin. Desktop and Android connections continue to work without an Origin header. The server still stores credential hashes; file data remains device-to-device over WebRTC.

config.js must contain only the public SERVER_URL and ICE settings. TURN credentials should be short-lived or provisioned securely; never put administrator tokens, private database URLs, or static secrets in client assets.

## How browser downloads work

Chrome and Edge on compatible devices support the File System Access API: users choose a destination **when accepting each incoming transfer**. Files are written incrementally into a unique Droply received folder to preserve the sent folder structure and prevent overwriting unrelated files.

Browsers without the File System Access API receive transfers of up to 64 MiB in memory. When a file is complete, select its **Download file** link in the transfer list. This fallback is deliberately size-limited to avoid exhausting browser memory. Folder selection and drag-and-drop support vary by browser/device.

The browser supports profiles, device codes, friends, approvals, direct file transfers, history, and themes. Desktop-only features such as the system tray, app updater, OS download picker, and diagnostic log are not available.

## Security and identity

Each browser profile is a *new device identity*, not a synchronized copy of a desktop installation. Its device code stays the same if the browser's site data remains intact. Browser private-credential data is encrypted with Web Crypto AES-GCM and a non-extractable key stored in IndexedDB, but unlike Electron safeStorage it is **not backed by an OS keychain** and scripts allowed to run on the same site origin can access it. Treat the browser as a less-protected device; only use trusted browsers and extensions.

Clearing site data or using private browsing can lose access to the browser identity. If the identity is registered but the key is unavailable, Droply preserves the profile and requires administrator-issued recovery; it must not silently recreate that identity. Profiles, friend lists, and history are local to this browser and are not synced to other devices.

Because the signaling service is a separate origin from GitHub Pages, browser registration cannot succeed until WEB_ALLOWED_ORIGINS is configured. The browser client does not request or store an administrator token.

## Validation

Browser source modules are syntax-checked in CI. Unit tests verify build output, the content-security policy, safe incoming paths, and the signaling server's CORS restrictions. Manual end-to-end validation is still required on the live domain: register a fresh browser profile, exchange friend codes with a desktop/Android client, test file and folder transfers in both directions, reject a transfer, check large-file streaming on Chrome/Edge, and test browser reload/reconnect. Do not claim production readiness until those tests pass.
