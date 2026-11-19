# Device access

DROPLY 2.8 connects new installations automatically. Users share a device code, add a friend and approve transfers. Invitations and administrator approval are not part of normal onboarding.

The desktop main process generates a random per-device credential and encrypts it with Electron safeStorage before registering with the HTTPS server. The renderer never receives the credential. Existing registrations retain their identity, profile and friends. Registration retries reuse the saved credential; a different credential cannot replace an existing identity or revive a revoked one.

The signaling server lives in server/. PostgreSQL stores credential hashes and recovery invitations in transactions. DATABASE_URL and ADMIN_TOKEN belong only in the server host's environment. Public desktop configuration contains the signaling URL and ICE settings only.

The updated server removes legacy WebSocket access. Roll out a new desktop release to existing users before deploying it: older clients do not send the authenticated friend-list protocol and will lose presence and signaling after the server update. The new server scopes presence and regular signaling to mutual friends. Do not publish older installers that embedded the former shared key.

Server tests cover registration, persistence, replay, revocation, sender identity, friend-scoped presence and rejection of legacy connections. CI additionally exercises concurrent PostgreSQL transactions. See server/README.md for deployment and recovery commands.
