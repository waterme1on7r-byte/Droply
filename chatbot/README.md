# Droply Get help — free guided support

**Status (18 November 2026):** The website Get help widget and the Supabase `droply-chat` Edge Function now use **a built-in, rules-based troubleshooting guide**. No OpenAI API key, model, external inference service or usage-based AI billing is necessary.

The guide is deliberately **not marketed as generative AI**. It can answer common documented Droply questions and suggest safe troubleshooting steps. It cannot freely understand every question or diagnose an unknown device; visitors can always choose **Create support ticket** for a human to review.

## Source and behavior

- `docs/index.html` — loads the Get help widget from static assets and keeps the site's existing strict CSP.
- `docs/chat-widget.js` — floating Get help dialog, chat messages, quick-topic suggestions and separate ticket creation.
- `docs/chat-widget.css` — electric-blue/yellow theme, accessibility and responsive layout.
- `docs/support-privacy.html` — current data-handling notice. Chat text goes to Droply's Supabase support endpoint **only** for transient rule-based replies; no language-model provider receives it.
- `supabase/functions/droply-chat/guide.ts` — deterministic, reviewed product FAQ and safety-oriented troubleshooting replies.
- `supabase/functions/droply-chat/index.ts` — secure chat/ticket endpoint, rate limits and server-side ticket submission. No OpenAI import or external model API call.
- `supabase/functions/droply-chat/instructions.ts` — retained original chatbot guidance from the uploaded handoff as a **reference only**; not loaded or used by the current function.

## Support ticket handling (unchanged)

Chat visitors may press **Create support ticket**, review/edit the summary, supply a name and email, and press **Submit ticket**. Only explicit submission creates a record in the separate private `support_tickets` table.

Admins access tickets under **Support ticket requests** in the private Droply admin portal. The existing two administrator accounts, authentication, resolution notes and ordinary Contact us queue are unchanged.

## Cost and limits

- **No paid AI provider or AI API key required.** No generative inference or token charge.
- Hosting and database usage still depend on the existing **Supabase** project and its plan limits. GitHub Pages and Supabase have their own quotas, so avoid assuming unlimited free requests.
- Existing server-side rate limits, origin checking, restricted database access and honeypot protect the public ticket endpoint. Rate limits help but cannot guarantee resistance to every automated attack.
- Do **not** add a third-party AI key, server secret or service-role credential to GitHub Pages or the widget.

## Testing

- Query the guide with questions about public keys, offline peers, speed, encryption, Windows/macOS installation and file sizes.
- Check that the UI does not claim to be generative AI or send data to OpenAI.
- Test **Create support ticket** and verify it appears under **Support ticket requests**, not Contact messages.
- Test the service's safe error state and responsive layouts.
- Verify Supabase RLS still restricts support ticket reads and edits to authorized administrators.

The Edge Function is deployed. A complete, real-world website/browser-to-Supabase round trip has **not** been independently confirmed in this environment; do one end-to-end test from the public website before treating it as fully verified.

## Updating knowledge

Edit `supabase/functions/droply-chat/guide.ts` when the supported OS, release, installation, pairing, troubleshooting guidance or security information changes, then redeploy the `droply-chat` Edge Function. Rules should avoid guessed protocols, destructive system instructions or promises of file recovery. The supplied original handoff document remains in the repository for comparison.

**Desktop app unaffected:** These changes touch only the website support widget, its privacy text, and the existing dedicated support Edge Function.
