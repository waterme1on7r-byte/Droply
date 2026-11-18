# Droply website contact inbox

The marketing website now has a blue-and-yellow in-page Contact us form. Visitors do not need to launch an email app.

## Viewing messages

Open https://supabase.com/dashboard/project/zyppzqwqacvdnfiajbpp/editor and choose the **contact_messages** table. Messages are stored privately there, **not forwarded automatically to dev.leonb@gmail.com**. For email notifications, connect an email provider to the server-side backend later.

## Project files

- docs/index.html — contact modal, form logic, inline CSP hashes
- docs/contact-privacy.html — contact privacy notice
- supabase/functions/contact-send/index.ts — deployed Edge Function
- supabase/migrations/20261118233000_create_secure_contact_messages.sql — private inbox and atomic quotas

## Security

- Both contact tables have Row Level Security enabled and deny public reads/writes.
- The browser never receives Supabase privileged keys.
- The server validates names, email and message lengths and rejects oversized JSON.
- HMAC-hashed rate-limit buckets limit global, per-email and per-IP request volume.
- The form uses a hidden honeypot and generic error responses; it does not render message HTML.
- CORS is restricted to the website, but CORS alone does not prevent nonbrowser abuse.
- A real live website submission should still be verified in the Supabase inbox.

The Droply desktop application, installer and signaling service were not modified.