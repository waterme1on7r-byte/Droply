# Droply contact inbox — private administration

The admin panel now uses an **unlinked, noindex HTML login screen** on GitHub Pages with a protected Supabase Edge Function (`contact-admin`) for API requests. The earlier Supabase-hosted URL redirects to the corrected web page.

Open: https://waterme1on7r-byte.github.io/Droply/portal/contact-inbox.html

**Security boundary:** The HTML login screen is technically public because GitHub Pages and the GitHub repository are public. Only users who pass server-side authentication can read or update inbox data. Keeping a link unlisted does not make its contents private.

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
- The admin API permits browser requests from only the exact GitHub Pages origin, requires a custom header, and verifies authenticated bearer tokens for every inbox data operation. CORS is not used as a substitute for authentication.
- The static login HTML uses a SHA-256 Content Security Policy for its inline styles and scripts, and allows network requests only to the Supabase admin API. Personal messages are rendered with textContent, never as executable HTML.
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
- The `contact-admin` Edge Function is ACTIVE at version 2; it redirects HTML page requests to GitHub Pages and handles authenticated API requests.
- A full live login test and GitHub Pages publication have **not** been independently verified from this environment. Verify the workflow and open the page in a browser.

**Not modified:** marketing website files, newsletter signup, desktop app, installers, signaling server, or Contact us form.