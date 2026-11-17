# Device access

DROPLY 2.8 connects new installations automatically. Users share a device code, add a friend and approve transfers. Invitations and administrator approval are not part of normal onboarding.

The desktop main process generates a random per-device credential and encrypts it with Electron safeStorage before registering with the HTTPS server. The renderer never receives the credential. Existing registrations retain their identity, profile and friends. Registration retries reuse the saved credential; a different credential cannot replace an existing identity or revive a revoked one.

The signaling server lives in server/. PostgreSQL stores credential hashes and recovery invitations in transactions. DATABASE_URL and ADMIN_TOKEN belong only in the server host's environment. Public desktop configuration contains the signaling URL and ICE settings only.

Production currently retains ALLOW_LEGACY=true for older installations. Preserve it during repository migration; changing source locations must not disconnect users. Set it to false after the intended users upgrade. Registered identities already reject legacy impersonation. Do not publish the older installers that embedded the former shared key.

Server tests cover registration, persistence, replay, revocation, sender identity and legacy compatibility. CI additionally exercises concurrent PostgreSQL transactions. See server/README.md for deployment and recovery commands.
