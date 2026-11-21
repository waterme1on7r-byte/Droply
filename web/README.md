# Droply Web

The browser edition of Droply is generated from the **same HTML, CSS, and JavaScript renderer** as the desktop app. It connects to the existing signaling server and uses the same friend requests and WebRTC data-channel file transfers. The marketing website in docs/index.html is not changed.

## Mobile Home Screen access

Droply Web shows a small, dismissible Home Screen action beneath the header only in mobile browsers. The prompt never overlays the transfer controls and disappears in installed/standalone mode.

- **iPhone and iPad:** The banner itself immediately shows **Share → Add to Home Screen**; tapping the action expands an icon-based, two-step guide (and indicates Safari's ••• → Share shortcut and optional **Open as Web App** switch). Apple does not expose a web API to open this menu or silently install the site.
- **Android and other supported browsers:** The button calls `navigator.install()` directly when available, otherwise the saved `beforeinstallprompt` event. Both require only the user's tap followed by system confirmation. Where neither is offered, a short in-browser menu guide replaces unsupported fake install buttons.

The build produces genuine 192×192 and 512×512 PNG manifest icons from the **original Droply icon**, alongside the existing Apple touch icon. Installation does not enable offline transfers. Installed app storage may be separate from the browser tab, so an installed copy can have its own device code; keep its app data to retain that identity.

## Run locally

Install Node.js 22+, then run from the repository root:

    npm run web:dev

Open http://localhost:4173/app/. The preview runs only on loopback. It serves the generated browser client without Electron. To test live friend requests and transfers, the signaling service must permit this exact origin (see below), and a second online Droply device must be available.

To build the deployable static files without running the local server:

    npm run web:build
    npm run web:test

The output is docs/app/ (ignored in git). The GitHub Pages workflow now builds it at `https://waterme1on7r-byte.github.io/Droply/app/`, alongside the marketing website at `/Droply/`. For the public build, GitHub Actions sets `DROPLY_PUBLIC_GATEWAY_URL=wss://droply-internal-preview.onrender.com`, allowing browser device registration and signaling through the separately hosted gateway.

## Public GitHub Pages edition

The public website's **Use Droply Web** button opens `https://waterme1on7r-byte.github.io/Droply/app/`. GitHub Pages serves static app files quickly, while a separate gateway handles WebSocket signaling and browser device registration. `web/build.mjs` only appends a public WSS gateway URL, not credentials, to the built app configuration.

Configure the existing gateway service with `WEB_PUBLIC_ALLOWED_ORIGINS=https://waterme1on7r-byte.github.io` (the **origin** without `/Droply` or a trailing slash). The gateway permits only public `POST /auth/register`, `POST /auth/enroll` and `/device` WebSocket signaling with that origin. Private preview files at `/internal/preview/` **remain password protected**. The production signaling server still requires no origin or database changes.

The public release uses a **new browser identity** under the GitHub Pages origin. Identities and friend lists saved while using the private Render preview **do not migrate automatically**, because browser IndexedDB is scoped to its origin. Users should exchange the new public device code with friends.

**Performance caveat:** GitHub Pages removes the preview website's static cold-start, but the public app still connects via a free Render gateway and then to the existing signaling server. If either service sleeps, live friend requests may still be delayed. The current signaling backend also limits the number of sessions per upstream IP, so this arrangement is appropriate for an early public beta, not a high-scale launch. For reliable fast friend requests, host the gateway/signaling server always-on and add durable server-side request delivery later.

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

The **private preview HTML/JS/CSS** and its same-origin API and WebSocket connections require a time-limited HttpOnly SameSite=Lax session cookie. The password is entered into a server-side login form over HTTPS; failed logins are rate limited. The separate **public GitHub Pages client** uses CORS and WebSocket connections only from an explicitly configured `WEB_PUBLIC_ALLOWED_ORIGINS=https://waterme1on7r-byte.github.io` and authenticates to the upstream signaling server with its own device token. The preview password is not embedded in the public app; the gateway never relays file bytes.

**Important:** The preview uses the production signaling server's existing device records. New browser profiles will register against its database and may appear in friends' presence lists, even though the preview hosting and password are separate. Avoid test spam and do not reset the production database. Device identities created on this preview origin will not automatically migrate to any future public domain.

## Signaling server configuration

The standalone private preview uses its own HTTPS origin for the browser and proxies authenticated requests to the existing signaling server, so **no origin or environment changes are necessary on the live signaling service**. The gateway never stores a signaling admin token or database credentials.

If you instead run the local unproxied development server at `http://localhost:4173/app/`, the existing signaling server must explicitly allow that local origin using `WEB_ALLOWED_ORIGINS` (available in the feature branch, not required for private hosted testing). Never allow arbitrary origins.

TURN credentials should be short-lived or provisioned securely; never put administrator tokens or private database URLs in client assets.

## Friend request delivery and timing

Droply's signaling backend routes friend requests through live WebSocket connections. A request entered by code is stored in the sending browser's pending list, but **not in a durable server-side inbox**. The server can resolve the destination code only when that device is connected and has announced its profile. It sends `resolved` immediately for online devices. The sender then transmits the friend request, and the recipient stores and displays it. The sender's "Signaling sent" state is **not a delivery receipt**.

For newly received requests, Droply Web opens the incoming request panel rather than relying only on a short toast, and shows it on tab return if the browser was backgrounded. Initial code lookup has two capped retries at 1.1s and 3.6s. The existing watch subscription handles future device connections. Friend-request signals remain de-duplicated. The private gateway also tests that the production WebSocket is responsive and sends a small application-level heartbeat while the browser is active.

The automated end-to-end tests validate a warm signaling server, a private Web sender, and both native and Web recipients, including the target coming online after the request was registered. These are *local CI tests*, not guarantees for the public internet or evidence of the user's observed latency.

Render Free web services can spin down after 15 idle minutes and take around one minute to wake. A free-tier cold start **cannot meet a strict 10-second deadline**, and a device in a suspended/closed browser tab or offline client cannot receive a live WebSocket push. If a guaranteed 10-second SLA is needed, use an always-on signaling and preview service and, for offline receipt, add a server-side durable inbox or platform push notifications. Neither the production signaling host nor its database is modified by this preview build.

To diagnose a live delay, enable the optional server-side `SIGNALING_DIAGNOSTICS=1` setting **only on the private preview gateway**. Its Render logs include connection and upstream authentication durations, friend-code lookups, resolution, signal sending, and incoming friend requests; they log **no names, IDs, device codes, IPs, private keys or signaling payloads**. Compare these stages when both clients are online. Disable the setting after troubleshooting if event timing metadata is no longer needed.

## How browser downloads work

Chrome and Edge on compatible devices support the File System Access API: users choose a destination **when accepting each incoming transfer**. Files are written incrementally into a unique Droply received folder to preserve the sent folder structure and prevent overwriting unrelated files.

Browsers without the File System Access API receive transfers of up to 64 MiB in memory. When a file is complete, select its **Download file** link in the transfer list. This fallback is deliberately size-limited to avoid exhausting browser memory. Folder selection and drag-and-drop support vary by browser/device.

The browser supports profiles, device codes, friends, approvals, direct file transfers, history, and themes. In **Add friend**, choose **Show my QR code** to present your public friend code as a QR, or **Scan a QR code** to read one through the camera (where available) or from an image. QR scanning runs locally and populates the existing code input; sending the request still requires pressing **Add** and approval from the recipient. **Share my QR code**, under the displayed QR, uses the native iOS/browser share sheet to send a PNG image to messaging or email apps where supported. On browsers without image sharing, Droply saves a PNG that can be attached manually; the native Android APK has its own Android system share chooser after rebuilding. QR generation and scanning stay local. Desktop-only features such as the system tray, app updater, OS download picker, and diagnostic log are not available.

## Security and identity

Each browser profile is a *new device identity*, not a synchronized copy of a desktop installation. Its device code stays the same if the browser's site data remains intact. Browser private-credential data is encrypted with Web Crypto AES-GCM and a non-extractable key stored in IndexedDB, but unlike Electron safeStorage it is **not backed by an OS keychain** and scripts allowed to run on the same site origin can access it. Treat the browser as a less-protected device; only use trusted browsers and extensions.

Clearing site data or using private browsing can lose access to the browser identity. If the identity is registered but the key is unavailable, Droply preserves the profile and requires administrator-issued recovery; it must not silently recreate that identity. Profiles, friend lists, and history are local to this browser and are not synced to other devices.

For private hosted testing the browser shares the private preview gateway's HTTPS origin, which securely proxies to the signaling backend; local or future separate hosts may need their origins allowlisted. The browser client never requests or stores an administrator token.

## Validation

Browser source modules are syntax-checked in CI. Unit tests verify build output, the content-security policy, safe incoming paths, and the signaling server's CORS restrictions. Manual end-to-end validation is still required on the live domain: register a fresh browser profile, exchange friend codes with a desktop/Android client, test file and folder transfers in both directions, reject a transfer, check large-file streaming on Chrome/Edge, and test browser reload/reconnect. Do not claim production readiness until those tests pass.
