# Secure device access: rollout status

Version 2.7.0 replaces the renderer's shared-key WebSocket connection with a main-process authenticated broker. New client configuration contains SERVER_URL and ICE only. KEY is rejected by config validation and is not emitted by the CI config generator.

Settings > Device access shows the existing device code and accepts one expiring, code-bound invitation. The server issues a random per-device credential, stores its hash, and the app encrypts its copy with Electron safeStorage. The renderer receives connection state and signaling messages, never the credential. Profile IDs and friend data are preserved. Missing/unreadable OS encryption blocks enrollment instead of saving plaintext.

## Server rollout

Server implementation and instructions are in Droply-server branch secure-enrollment. It is deliberately separate from production main. Configure a Neon Free PostgreSQL DATABASE_URL and a server-only ADMIN_TOKEN on Render. Retain the existing server KEY during migration. Deploy/test the server before distributing 2.7.0 clients.

Existing 2.5/2.6 clients remain unchanged while the production server is unchanged. After a device enrolls, the server prevents legacy clients from claiming that identity. Only disable ALLOW_LEGACY and retire KEY after intended users have migrated. Do not publish the older 2.6.1 installer, which still embeds the global key.

The public updater feed and public installer publication remain on hold. No new release tag is created by this implementation. The old private test release is not replaced with an unconfigured production client.

## Validation

App behavioral suite includes TLS/URL validation, no plaintext credential storage, sender checks, identity-binding and renderer credential isolation. Server tests cover invitation binding, expiry/replay, admin authorization, spoofing, revocation, corrupt state and legacy compatibility. CI runs a real PostgreSQL service and concurrent one-use enrollment transactions.

Two native Electron instances were tested against the local secure server: enrollment, an actual WebRTC file transfer to the isolated download directory, reconnection after restarting the app without another invitation, unchanged profile/friends, and admin revocation. PostgreSQL storage logic was also exercised locally with PGlite; production Neon connectivity is still pending account connection.

## Remaining live deployment work

Install/connect the Render and Neon integrations. Then create the Free database, set server-only environment credentials without exposing them in chat, deploy the server branch to a staging/controlled environment, verify real database persistence and the live enrollment flow, and migrate intended devices before disabling the old key. Do not switch the live server blindly.

## 2.8.0: automatic connection

The invitation UI is removed. Fresh installations generate and save their own encrypted credential and register automatically. Friend codes and accepted-friend/receiver approval remain the only user-facing connection steps. Existing enrolled installations reuse their credentials and keep their IDs, codes, profiles and friends.

Registration is idempotent for the same credential and never replaces an existing identity with a different token or revives revoked devices. A failed HTTP response is retried using the already saved pending credential. Administrative recovery is reserved for exceptional lost/corrupt credentials; it is not part of normal onboarding. Public registration is rate- and capacity-limited. Keep legacy access during the older-client transition.
