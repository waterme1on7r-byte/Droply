# Droply Web

The browser edition of Droply is generated from the **same HTML, CSS, and JavaScript renderer** as the desktop app. It connects to the existing signaling server and uses the same friend requests and WebRTC data-channel file transfers. The marketing website in docs/index.html is not changed.

## Run locally

Install Node.js 22+, then run from the repository root:

    npm run web:dev

Open http://localhost:4173/app/. The preview runs only on loopback. It serves the generated browser client without Electron. To test live friend requests and transfers, the signaling service must permit this exact origin (see below), and a second online Droply device must be available.

To build the deployable static files without running the local server:

    npm run web:build
    npm run web:test

The output is docs/app/ (ignored in git). It is **not deployed to public GitHub Pages**. The normal marketing site remains at /, unchanged. An independent Render web service builds and serves this output with access control.

## Private hosted testing on Render

Deploy the feature branch as a **separate Render web service**. Do not modify or replace the existing signaling service, its database, admin credentials or runtime configuration. The test service proxies only authenticated browser registration and WebSocket-signaling traffic to the existing server; file bytes remain peer-to-peer over WebRTC.

Use the following settings for the new Render service:

    Repository: https://github.com/waterme1on7r-byte/Droply
    Branch: feature/droply-web-app
    Runtime: Node
    Build: npm --prefix server ci && DROPLY_PRIVATE_PREVIEW=1 node web/build.mjs
    Start: node web/preview-server.cjs
    Root directory: repository root (.)
    Auto-deploy: off (recommended for stable manual testing)

Set these variables **on the new preview service only**:

    WEB_PREVIEW_PASSWORD=<unique-random-secret-at-least-24-characters>
    SIGNALING_UPSTREAM_URL=wss://droply-server-91kh.onrender.com

The password is server-side only, never committed or placed in client assets. The standalone test gateway exposes a private login page at:

    https://<your-preview-host>.onrender.com/internal/preview/

All HTML, CSS, JS, registration API routes, and WebSocket upgrades require an authenticated, time-limited, HttpOnly SameSite=Strict session cookie. The password is entered into a server-side login form over HTTPS; failed logins are rate limited. The service adds no public `/app/` route, disables indexing and caching and does not publish browser files on GitHub Pages. The WebSocket gateway bridges signaling JSON frames to the existing server and does not carry file data.

**Important:** The preview uses the production signaling server's existing device records. New browser profiles will register against its database and may appear in friends' presence lists, even though the preview hosting and password are separate. Avoid test spam and do not reset the production database. Device identities created on this preview origin will not automatically migrate to any future public domain.

## Signaling server configuration

The standalone private preview uses its own HTTPS origin for the browser and proxies authenticated requests to the existing signaling server, so **no origin or environment changes are necessary on the live signaling service**. The gateway never stores a signaling admin token or database credentials.

If you instead run the local unproxied development server at `http://localhost:4173/app/`, the existing signaling server must explicitly allow that local origin using `WEB_ALLOWED_ORIGINS` (available in the feature branch, not required for private hosted testing). Never allow arbitrary origins.

TURN credentials should be short-lived or provisioned securely; never put administrator tokens or private database URLs in client assets.

## How browser downloads work

Chrome and Edge on compatible devices support the File System Access API: users choose a destination **when accepting each incoming transfer**. Files are written incrementally into a unique Droply received folder to preserve the sent folder structure and prevent overwriting unrelated files.

Browsers without the File System Access API receive transfers of up to 64 MiB in memory. When a file is complete, select its **Download file** link in the transfer list. This fallback is deliberately size-limited to avoid exhausting browser memory. Folder selection and drag-and-drop support vary by browser/device.

The browser supports profiles, device codes, friends, approvals, direct file transfers, history, and themes. Desktop-only features such as the system tray, app updater, OS download picker, and diagnostic log are not available.

## Security and identity

Each browser profile is a *new device identity*, not a synchronized copy of a desktop installation. Its device code stays the same if the browser's site data remains intact. Browser private-credential data is encrypted with Web Crypto AES-GCM and a non-extractable key stored in IndexedDB, but unlike Electron safeStorage it is **not backed by an OS keychain** and scripts allowed to run on the same site origin can access it. Treat the browser as a less-protected device; only use trusted browsers and extensions.

Clearing site data or using private browsing can lose access to the browser identity. If the identity is registered but the key is unavailable, Droply preserves the profile and requires administrator-issued recovery; it must not silently recreate that identity. Profiles, friend lists, and history are local to this browser and are not synced to other devices.

For private hosted testing the browser shares the signaling server's HTTPS origin; local or future separate hosts need their origins allowlisted. The browser client never requests or stores an administrator token.

## Validation

Browser source modules are syntax-checked in CI. Unit tests verify build output, the content-security policy, safe incoming paths, and the signaling server's CORS restrictions. Manual end-to-end validation is still required on the live domain: register a fresh browser profile, exchange friend codes with a desktop/Android client, test file and folder transfers in both directions, reject a transfer, check large-file streaming on Chrome/Edge, and test browser reload/reconnect. Do not claim production readiness until those tests pass.
