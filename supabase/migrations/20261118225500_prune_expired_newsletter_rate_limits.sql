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

  -- Prune stale, hashed abuse-prevention counters. New requests remove old
  -- buckets without a background scheduler or keeping identifiable IPs.
  delete from public.newsletter_signup_limits
  where expires_at < clock_timestamp() - interval '1 day';

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
