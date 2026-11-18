-- Droply marketing website only. No desktop app or signaling-server tables are touched.
-- Run in the dedicated newsletter Supabase project when it has been created.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'subscribed'
    check (status in ('subscribed', 'unsubscribed')),
  consented_at timestamptz not null default now(),
  consent_version text not null default 'droply-newsletter-v1-2026-11',
  source text not null default 'droply-website',
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint newsletter_email_canonical
    check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  constraint newsletter_unsubscribe_consistency
    check (
      (status = 'subscribed' and unsubscribed_at is null)
      or (status = 'unsubscribed' and unsubscribed_at is not null)
    )
);

comment on table public.newsletter_subscribers is
  'Opt-in newsletter signups for the Droply marketing website; not desktop app users.';

-- The table is in public for PostgREST access *from the server-side function only*.
-- Without an RLS policy, browser anon and authenticated roles have no row access.
alter table public.newsletter_subscribers enable row level security;
revoke all on table public.newsletter_subscribers from public, anon, authenticated;
grant select, insert, update, delete on table public.newsletter_subscribers to service_role;

create index if not exists newsletter_subscribers_status_idx
  on public.newsletter_subscribers (status, created_at desc);
