-- Isolated abuse-control quota for the Droply newsletter endpoint.
-- Store opaque HMAC fingerprints only (never raw IP addresses).
create table if not exists public.newsletter_signup_limits (
  bucket_hash text primary key check (bucket_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.newsletter_signup_limits enable row level security;
revoke all on public.newsletter_signup_limits from public, anon, authenticated;
grant select, insert, update, delete on public.newsletter_signup_limits to service_role;

create index if not exists newsletter_signup_limits_expiry_idx
  on public.newsletter_signup_limits (expires_at);

-- Atomic quota for concurrent requests. SECURITY INVOKER and explicit grants:
-- public, anon and authenticated can neither run this RPC nor access its table.
create or replace function public.newsletter_take_quota(
  p_bucket text,
  p_max_attempts integer,
  p_ttl_seconds integer
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_allowed boolean;
begin
  if p_bucket is null
      or p_bucket !~ '^[a-f0-9]{64}$'
      or p_max_attempts is null
      or p_max_attempts not between 1 and 200
      or p_ttl_seconds is null
      or p_ttl_seconds not between 60 and 86400 then
    return false;
  end if;

  insert into public.newsletter_signup_limits
    (bucket_hash, attempts, expires_at)
  values
    (p_bucket, 1, clock_timestamp() + make_interval(secs => p_ttl_seconds))
  on conflict (bucket_hash) do update set
    attempts = case
      when public.newsletter_signup_limits.expires_at <= clock_timestamp() then 1
      else public.newsletter_signup_limits.attempts + 1 end,
    expires_at = case
      when public.newsletter_signup_limits.expires_at <= clock_timestamp()
        then clock_timestamp() + make_interval(secs => p_ttl_seconds)
      else public.newsletter_signup_limits.expires_at end
  where public.newsletter_signup_limits.attempts < p_max_attempts
     or public.newsletter_signup_limits.expires_at <= clock_timestamp()
  returning true into v_allowed;

  return coalesce(v_allowed, false);
end;
$$;

revoke all on function public.newsletter_take_quota(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.newsletter_take_quota(text, integer, integer)
  to service_role;

comment on table public.newsletter_signup_limits is
  'Private, pseudonymous short-lived rate-limit state for marketing newsletter signups.';
comment on function public.newsletter_take_quota(text, integer, integer) is
  'Service-role-only, atomic quota consumption for the newsletter Edge Function.';