# Droply newsletter — connected backend and marketing website

**Status (18 November 2026):** The Supabase database and hardened `newsletter-subscribe` Edge Function (version 2) are deployed. The marketing page at `docs/index.html` now POSTs signups to that endpoint, and `docs/newsletter-privacy.html` is published in the repository. The Electron desktop app is unchanged.

## Security checks completed

- Both newsletter tables have RLS enabled, with no public table access.
- Anonymous users cannot call the service-only atomic rate-limit SQL function.
- Each signup requires an email and explicit opt-in, rejects honeypot submissions, and uses strict origin/CORS checks.
- Server-side abuse controls limit global volume, per-email submissions, and per-IP requests when a gateway IP is available. Only hashed fingerprints are stored, with cleanup on subsequent requests.
- Server-only privileged Supabase keys are not exposed in the marketing page. Its Content Security Policy restricts scripts, fonts and network requests.
- Browser tests at 375, 768 and 1280 pixels passed using simulated API responses; no JavaScript/CSP errors or horizontal overflow were detected.
- The original animated desktop preview, app downloads, contact links and design are unchanged.

## Outstanding production checks

- **Live end-to-end HTTP testing from GitHub Pages is still required.** The tests above used a mocked response, not an actual Supabase signup. Try one voluntary test signup and inspect the Supabase Table Editor afterward.
- GitHub Pages must be deployed/enabled for the updated marketing site to be public.
- Signup currently stores explicit consent without confirming email ownership; implement double opt-in and an unsubscribe email workflow before sending bulk newsletters.
- For stronger protection against distributed bots, add managed bot verification such as Cloudflare Turnstile. An optional server verification hook is already implemented; configure the frontend widget before setting its private secret.
- The site's general Terms page is still a placeholder; the newsletter privacy page is linked and active.

## Project reference

Supabase project: `zyppzqwqacvdnfiajbpp`

Public endpoint: `https://zyppzqwqacvdnfiajbpp.supabase.co/functions/v1/newsletter-subscribe`

The desktop application, signaling server and their settings were not modified.

---

## Original deployment notes (retained for reference; stages already completed where noted)


STATUS (2026-11-18): Supabase project `zyppzqwqacvdnfiajbpp` is connected and healthy. The `create_newsletter_subscribers` migration has been applied, the empty `public.newsletter_subscribers` table is protected by RLS, and the `newsletter-subscribe` Edge Function is deployed and ACTIVE (version 1). The marketing website remains unchanged and still uses the email-app signup flow. A complete live HTTP signup test has NOT been performed yet.

## Files prepared

- supabase/config.toml — public newsletter function settings only
- supabase/migrations/20261118093000_create_newsletter_subscribers.sql — private subscriber records with RLS
- supabase/functions/newsletter-subscribe/index.ts — Edge Function endpoint that validates form submissions and inserts subscribers
- supabase/functions/_shared/newsletter.ts — input and consent validation
- supabase/functions/.env.example — non-secret sample configuration
- newsletter/site-handler.mjs — ready-to-use browser integration; not loaded by the website yet
- newsletter/tests/validation.test.mjs — local validation tests

The desktop application's root index.html, package.json, JavaScript, configuration, signaling server, release workflows, and marketing website docs/index.html have NOT been changed. The current website continues its email-app-based signup until we deliberately connect Supabase.

## Stage 1: existing Supabase project — completed

Use the existing Supabase project reference `zyppzqwqacvdnfiajbpp` for marketing newsletter email collection. Ensure the project is appropriate for this use, and do not point Droply's existing desktop app or signaling server at it.

From the root of a local clone of this repository, run:

    npx supabase login
    npx supabase link --project-ref zyppzqwqacvdnfiajbpp
    npx supabase db push
    npx supabase functions deploy newsletter-subscribe --no-verify-jwt

These commands use the existing new files only. You may also run the SQL migration in Supabase SQL Editor and deploy the Edge Function via the dashboard, though the CLI is recommended for repeatable deployment.

In the Supabase dashboard, verify that public.newsletter_subscribers exists with Row Level Security enabled. It must have no policies granting data access to anon or authenticated roles.

## Stage 2: function environment and security — verify before launch

Edge Functions automatically receive SUPABASE_URL and a server-side secret key (new SUPABASE_SECRET_KEYS or legacy SUPABASE_SERVICE_ROLE_KEY). These are **server-side only**. Do not place secret keys in docs/index.html, public JavaScript, GitHub repository files, issues or Pages settings.

The Edge Function defaults to the website origin:

    https://waterme1on7r-byte.github.io

If you add a custom domain, set NEWSLETTER_ALLOWED_ORIGINS to its origin (https://host, without any /path) in Supabase Edge Function secrets and redeploy. Multiple origins may be comma separated. CORS is not a substitute for bot or rate-limit protection.

For stronger public signup abuse resistance, configure Cloudflare Turnstile or equivalent edge rate limiting. The function supports an optional TURNSTILE_SECRET_KEY; when that secret is set, a valid turnstileToken becomes required on each request. Add a visible Turnstile widget to the website in that case.

No IP address is stored by this implementation. Only email, time of opt-in, consent version, source, subscription status, and an optional unsubscribe timestamp are stored.

## Stage 3: test the backend before changing the website — pending

Send this request after deployment (replace zyppzqwqacvdnfiajbpp):

    curl -i -X POST https://zyppzqwqacvdnfiajbpp.supabase.co/functions/v1/newsletter-subscribe \
      -H 'Origin: https://waterme1on7r-byte.github.io' \
      -H 'Content-Type: application/json' \
      --data '{"email":"test@example.com","consent":true,"website":""}'

Expected response: HTTP 200, ok: true. Inspect the row in Supabase Table Editor, then remove the test subscriber. Submitting the same email again should not create a duplicate. Test invalid emails and missing consent too. Never use a real person's email for tests without their permission.

## Stage 4: website connection (already completed)

The integration described below is already live in docs/index.html and must not be installed again:

1. In docs/index.html, remove the existing newsletterForm.addEventListener submit handler that opens a mailto: request. Keeping it alongside a new handler will trigger both flows.
2. Copy newsletter/site-handler.mjs to docs/newsletter-site-handler.mjs.
3. Add this import near the bottom of the marketing page:

       <script type="module">
         import { attachNewsletterForm } from "./newsletter-site-handler.mjs";
         attachNewsletterForm({
           endpoint: "https://zyppzqwqacvdnfiajbpp.supabase.co/functions/v1/newsletter-subscribe"
         });
       </script>

4. Add an optional honeypot input called website (hidden from humans and assistive technology) for basic bot protection. Only configure Turnstile after its browser widget is present.
5. Update the newsletter-note text that currently says the email app opens. Link an accurate newsletter privacy policy; the current Privacy footer URL is a placeholder.
6. Test success, duplicates, no consent, mobile layouts, offline/network failures, timeouts and reduced-motion settings before publication.

The public endpoint URL is safe to include in browser code. The privileged Supabase key is not.

## Consent, email sending and future work

This release captures an explicit checkbox opt-in and stores the consent timestamp, but **does not implement double opt-in confirmation**. It also does not send newsletters, verify ownership of email addresses, send confirmation emails, generate unsubscribe links, or manage campaigns.

Before sending campaigns, choose an email provider, build a confirmation and unsubscribe flow, publish a privacy notice, and decide how to honor data deletion/access requests (contact: dev.leonb@gmail.com). A repeated signup will not automatically reactivate a previously unsubscribed email.

The table has an unsubscribe status and timestamp for future use. Maintain these fields server-side; do not give the public browser direct table access.

## Local validation test

Requires Node 22.16 or later:

    node --experimental-strip-types --test newsletter/tests/validation.test.mjs

This only validates the email/consent helper. Database and endpoint integration tests require a running Supabase project and have not been run.

## References

- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/guides/functions/deploy
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/database/postgres/row-level-security
