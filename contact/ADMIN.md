# Droply contact inbox — private administration

The contact inbox admin panel is a separate Supabase Edge Function (`contact-admin`). It is deliberately **not linked from the marketing website** and does not use GitHub Pages.

## Administrators

- `anil` — administrator
- `cenk` — administrator

Passwords were provisioned directly into the Supabase database as salted bcrypt hashes (cost 12). **No plaintext passwords are stored in this repository or bundled into the admin page.** Do not add passwords to GitHub files, issues, frontend code, or logs.

## Workflow

Open the private admin link provided to authorized team members. Enter username and password. You can:

- See all contact messages in descending date order.
- Search the loaded list by name, email or message.
- Filter by New, Read or Resolved.
- Open message details and mark a message New / Read / Resolved.
- Refresh or load more older messages.
- Sign out; browser-tab sessions automatically expire within 45 minutes.

Messages remain in `public.contact_messages`. No email forwarding is configured; the admin inbox is the destination for website contact forms.

## Security controls

- `public.contact_admin_users` is an RLS-enabled administrator allowlist, with zero policies for public roles. Anonymous and regular authenticated clients cannot read it.
- `public.contact_messages` remains RLS-protected and cannot be read or modified by anonymous / normal authenticated database clients.
- `contact_admin_check_password` is a SECURITY INVOKER function, executable by `service_role` only, that checks hashed credentials on the server.
- The Edge Function checks user credentials on the server, and signs short-lived HMAC session tokens using a server-side secret. Every inbox API call validates the token and rechecks the active account and session version.
- Login attempts are throttled using private, hashed rate-limit buckets (global and username/IP keyed).
- Browser sessions are held in `sessionStorage`; signing out clears them. No long-lived persistent user tokens are set.
- No cross-origin CORS permission is issued for the admin API. POSTs require same-origin and an explicit custom header.
- An HTML Content Security Policy blocks external scripts and unauthorized network connections; personal messages are rendered with textContent, never as executable HTML.
- The login screen can still be reached by someone who knows the URL. **The inbox data and actions remain inaccessible without authorized credentials.** The public website has no link to this page.

## Account maintenance

To temporarily disable a user, in the Supabase SQL Editor run a parameterized or private query updating `public.contact_admin_users.active=false` for the username. Existing tokens will immediately fail the next authorization check.

To rotate an admin password, run a private SQL update of `password_hash` using `extensions.crypt(new_password, extensions.gen_salt('bf', 12))` and increment `session_version` in the same statement to invalidate existing tokens. Never commit the private query containing the new password.

The originally supplied passwords were shared in chat and are relatively short for administrative access. Rotate them to long, unique passwords soon. For stronger protection, consider adding MFA via Supabase Auth in a future revision.

## Verification

- Both administrator usernames exist and are active, with bcrypt cost-12 hashes.
- Service-role password checking rejected an incorrect password.
- Anonymous roles cannot read contact messages or admin hashes or invoke the credential-check RPC.
- A temporary contact message was successfully changed from New to Read to Resolved and deleted after testing.
- The `contact-admin` Edge Function was deployed as ACTIVE.
- A full external HTTP login / dashboard test has **not** yet been confirmed due environment network restrictions. Verify with a real browser before relying on it.

**Not modified:** marketing website files, newsletter signup, desktop app, installers, signaling server, or Contact us form.