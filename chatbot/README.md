# Droply Get help chatbot + support ticket requests

**Scope:** Marketing website and private administration only. Electron desktop files, file transfers, installers and signaling server are unchanged.

This integration is based on the uploaded `droply-chatbot-handoff.zip` (widget, Supabase Edge Function, support instructions). The provided handoff originally sent Create support ticket to the general Contact us form. That behavior was deliberately changed at the user's request: **chat-created tickets now use a separate Supabase `support_tickets` table and the admin panel's `Support ticket requests` tab**.

## Website

- `docs/index.html` loads `docs/chat-widget.css` and `docs/chat-widget.js` and authorizes only same-origin scripts and styles (plus existing hashed inline CSS/JS) through CSP.
- A floating **Get help** button opens a responsive AI chat.
- **Create support ticket** opens a reviewable form (name, email, issue summary).
- If the visitor has chatted, the summary is prefilled from **the visitor's own messages** for editing. The complete AI dialogue is **not** silently submitted.
- Only when they press **Submit ticket** does it POST to the Supabase Edge Function and create a ticket.
- The website shows a ticket reference if creation succeeds.
- Ticket submission is independent of AI chat and works even when the AI API isn't configured.
- Data collection / AI processing disclosure: `docs/support-privacy.html`.

## Supabase backend

- `supabase/migrations/20261119004500_create_droply_support_tickets.sql` — RLS-protected `public.support_tickets` with no public read or write permissions, separate from `contact_messages`.
- `supabase/functions/droply-chat/index.ts` — public `droply-chat` Edge Function, deployed with `verify_jwt=false`.
- `supabase/functions/droply-chat/instructions.ts` — safety and troubleshooting instructions adapted from the uploaded chatbot instructions.
- Chat action: `POST { "action": "chat", "messages": [...] }`.
- Ticket action: `POST { "action": "ticket", "name": "Example", "email": "name@example.com", "summary": "Describe the issue", "website": "" }`.
- Both flows use validation, an Origin allowlist, server-side rate limits via the existing private `contact_take_quota` RPC, HMAC-derived fingerprints, and server-only Supabase credentials.
- The server makes OpenAI Responses API requests with `store:false` when model credentials are configured. **This does not guarantee zero processing/retention by the provider.**
- Do not embed `OPENAI_API_KEY`, Supabase secret keys, or any other private credentials in GitHub Pages or client JavaScript.

## Private admin panel

- URL: https://waterme1on7r-byte.github.io/Droply/portal/contact-inbox.html
- `docs/portal/contact-inbox.html` now has two switchable tabs: **Contact messages** and **Support ticket requests**.
- The existing signed-login access controls for anil/cenk remain in place.
- `supabase/functions/contact-admin/index.ts` exposes **authenticated** `mode=tickets` and `mode=ticket-status` API operations in addition to the original contact modes.
- Both tabs let admins search, filter, mark Read or New, and Resolve with a required resolution note. The ticket table stores the note, admin identity and timestamp.
- Unauthenticated visitors cannot read support tickets or contact messages directly; the login UI file itself is public because GitHub Pages is public.

## Required AI configuration (not yet completed)

The Edge Function and widget have been deployed, but AI replies **require your own OpenAI API credentials**:

1. In the Supabase Dashboard for project `zyppzqwqacvdnfiajbpp`, open Edge Functions → Secrets.
2. Set `OPENAI_API_KEY` to an API key with appropriate account permissions.
3. Set `CHAT_OPENAI_MODEL` to a Responses-compatible model available to your API account.
4. Review API billing/usage/spend limits, abuse logs, and the applicable provider privacy policies.
5. Do not share the secret key in chat, source code, GitHub issues, screenshots, or commits.
6. Test AI conversation from the actual published website after configuring secrets.

Without those secrets, the chat responds that AI is unavailable; the separate support ticket submission should still work.

## Verification and remaining checks

- Applied the separate `support_tickets` migration; no existing messages or desktop app data were migrated.
- SQL integration test: inserted a temporary ticket, verified New → Read → Resolved with a required resolution note and the resolver's identity, then deleted the temporary record.
- Database access checks: `anon` and `authenticated` roles have **no direct table read permission** for support tickets; the backend service role can insert.
- AI and admin Edge Functions deployed and ACTIVE. The admin route checks signed sessions before exposing either inbox.
- GitHub JavaScript syntax checked and CSP hashes of the admin site should be verified on changes.
- **A real public browser POST and a real AI provider request have not been independently verified here.** Confirm one test ticket appears only under Support ticket requests before advertising the feature.

## Future improvements

Optional managed bot verification (e.g. Turnstile) can strengthen the request limits; the chat endpoint includes a token-verification hook for tickets when CHAT_TURNSTILE_SECRET_KEY is configured. If enabled, add the corresponding frontend widget first.

Support tickets are private, and email notifications are **not** automatically sent. Admins review and resolve them in the portal. For automatic emails or ticket reference lookups, add a carefully authenticated notification/lookup flow later.
