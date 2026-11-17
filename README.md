# DROPLY secure enrollment

This is a coordinated server/app upgrade. Keep public installer publication disabled until production enrollment and migration are verified. The secure client is version 2.7.0.

## Free hosting layout

Keep the existing Render service. Use a Neon Free PostgreSQL database for durable authentication state; Render Free local files are ephemeral. File bytes continue traveling over WebRTC, not through PostgreSQL. Free services can sleep and have quotas; cold starts may require retrying enrollment.

Server environment:

- DATABASE_URL: Neon PostgreSQL connection string, stored only in Render's secret environment. The server verifies TLS certificates outside localhost. Use a dedicated database/role.
- ADMIN_TOKEN: a cryptographically random administrator token of at least 32 characters, stored only on the host and administrator's machine. Never put it in desktop config, Git, invitation messages or a URL.
- KEY: retain the existing legacy key during migration only.
- ALLOW_LEGACY: defaults to compatibility when KEY is set; set false after all devices migrate. Never enable anonymous legacy access.
- PORT: supplied by Render.

The server creates a single droply_auth_state table and protects state mutations with a PostgreSQL transaction and row lock. Two instances cannot redeem the same invitation. Device tokens and invitations are stored only as SHA-256 hashes. Back up the database. Never replace a damaged or missing production database with a blank one as a recovery shortcut.

AUTH_STORE_FILE is a local development alternative for a single process on persistent storage. Do not use it on Render Free. Do not switch an existing authentication deployment to a different store without migrating its records.

## Rollout without interrupting existing users

1. Configure Neon and ADMIN_TOKEN in Render; retain the existing KEY.
2. Deploy the secure-enrollment server branch. Verify /auth/status reports protocol 2 and enrollment true. Check an existing app can still connect.
3. Build/test a private 2.7.0 app against the updated service. New app builds contain the public server URL and ICE configuration, not KEY or administrator credentials.
4. Each user opens Settings > Device access and copies their existing device code. Generate an invitation bound to exactly that code. Default expiry is 15 minutes; it can be used only once.
5. The user enters the invitation once. The server binds a random credential to their existing installation ID. Their device code, profile and local friends remain unchanged. Once enrolled, that identity cannot be claimed by an old client using the shared legacy key.
6. Test a real transfer, restart the server/app and confirm reconnection. Verify revocation from the admin interface.
7. After all intended users upgrade, set ALLOW_LEGACY=false and remove/retire KEY. Test legacy rejection. Keep the old private build for rollback, but do not publish it.
8. Only then rebuild/review a credential-free installer and re-enable public releases. Do not publish older installers that embed the shared key.

If enrollment succeeds on the server but local credential saving fails, issue a replacement invitation for the same device code. Existing data is not deleted. Uninstalling with app-data deletion loses that installation's identity; keep user data during upgrades.

## Administrator commands

Set DROPLY_ADMIN_URL to the HTTPS service origin and DROPLY_ADMIN_TOKEN in your local shell. Do not paste tokens into shared terminals or chat.

- node admin.js invite DRP-XXXX-XXXX-XXXX
- node admin.js invite DRP-XXXX-XXXX-XXXX --replace (explicitly replaces an existing credential when redeemed)
- node admin.js revoke DRP-XXXX-XXXX-XXXX
- node admin.js devices

The invitation is the only value sent to the intended user, privately. Every invitation is bound to their code. Revocation disconnects their live session and prevents reconnection. Replacement preserves the device identity and invalidates the old token.

## Security scope

This is an invitation-only group service. Authenticated/enrolled group members still receive group presence to maintain the existing client protocol. File requests continue to require accepted friends and receiver approval in the app. Friend-scoped presence and server-persisted friendships are a separate future privacy improvement; do not describe this upgrade as hiding all member identities.

The server fixes signaling sender identity from the authenticated connection, limits connection/message/enrollment/admin rates, bounds payloads and output buffering, uses authentication deadlines, and never accepts a client-supplied sender. Main-process credentials are protected by Electron safeStorage. Unavailable encryption blocks enrollment; there is no plaintext fallback. Device bearer tokens can still be stolen by malware running as the same OS user. Transfer verification codes retain their existing meaning; this change does not add cryptographic signatures to WebRTC offers.

Tests cover file-store persistence, corruption, invitation replay and device binding, unauthorized admin access, identity spoofing, legacy enrollment protection, revocation and legacy compatibility. CI additionally uses real PostgreSQL to test atomic redemption across two store instances. The native app integration test exercises two enrolled Electron devices and a real WebRTC transfer locally.

## Existing Render environment preflight

The inspected service currently has no variable named KEY; its old code therefore permits legacy clients without authentication. Preserve unrelated environment variables. For the controlled migration only, explicitly set ALLOW_LEGACY=true if KEY remains absent; this matches existing connectivity rather than silently rejecting old apps. Enrollment still requires DATABASE_URL and ADMIN_TOKEN. A registered secure identity remains protected from legacy impersonation. This temporary legacy endpoint is unauthenticated: keep public release publication disabled and set ALLOW_LEGACY=false immediately after the intended group migrates. Do not add a guessed KEY value, since that can disconnect existing installations.
