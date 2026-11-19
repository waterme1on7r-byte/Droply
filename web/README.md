# Droply Web

The browser edition of Droply is generated from the **same HTML, CSS, and JavaScript renderer** as the desktop app. It connects to the existing signaling server and uses the same friend requests and WebRTC data-channel file transfers. The marketing website in docs/index.html is not changed.

## Run locally

Install Node.js 22+, then run from the repository root:

    npm run web:dev

Open http://localhost:4173/app/. The preview runs only on loopback. It serves the generated browser client without Electron. To test live friend requests and transfers, the signaling service must permit this exact origin (see below), and a second online Droply device must be available.

To build the deployable static files without running the local server:

    npm run web:build
    npm run web:test

The output is docs/app/ (ignored in git). It is **not deployed to public GitHub Pages**. The normal marketing site remains at /, unchanged. The production signaling server builds this output on startup only when its private preview has been explicitly enabled.

## Private hosted testing

The web app is **private by default**: there is no public Pages route. The existing signaling server offers a separate password-protected route, `/internal/preview/`, but returns 404 until both variables below are set in its **server-side secrets** on Render (never commit them):

    WEB_PREVIEW_ORIGIN=https://droply-server-91kh.onrender.com
    WEB_PREVIEW_PASSWORD=<random-secret-of-at-least-24-characters>

Use a random, unique secret generated in a secure password manager or using `openssl rand -base64 36`. Give it only to invited testers, using a secure channel; the browser login name is `droply`. The server applies HTTP Basic authentication over HTTPS to the HTML and **every JavaScript/CSS asset**. The secret is never included in generated client files. No public GitHub Pages copy is created.

Once the feature PR has been merged, configure these values in the **existing** Render service and redeploy it, retaining its current `DATABASE_URL`, `ADMIN_TOKEN` and database. Then visit:

    https://droply-server-91kh.onrender.com/internal/preview/

If the Render service uses a different hostname, use its real HTTPS origin. With no preview secret, the route is not exposed. With only one value set or a weak password, the server fails startup rather than serving an insecure preview.

**Important:** Testing on the production signaling service may register new browser identities, use its rate limits and affect presence. Test with separate device profiles; this is not an isolated staging database. The preview URL's browser identity belongs to the server's origin and will **not** automatically migrate when a public app is launched later.

The public site and eventual public browser rollout should be handled in a separate release. Do not publish `docs/app/` or add `/app/` to GitHub Pages while the preview is private.

## Signaling server configuration

The private preview origin is permitted automatically for browser registration and WebSocket signaling **only while the private preview is enabled**. Local development from `http://localhost:4173` needs to be explicitly listed in `WEB_ALLOWED_ORIGINS` on the signaling server. Public sites will need their exact HTTPS origins allowlisted at launch.

Do not include paths, trailing slashes, wildcards or untrusted origins.

Only the browser auth endpoints (/auth/status, /auth/register and /auth/enroll) receive CORS headers. Browser WebSocket upgrades are also restricted by Origin. Desktop and Android connections continue to work without an Origin header. The server still stores credential hashes; file data remains device-to-device over WebRTC.

config.js must contain only the public SERVER_URL and ICE settings. TURN credentials should be short-lived or provisioned securely; never put administrator tokens, private database URLs, or static secrets in client assets.

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
