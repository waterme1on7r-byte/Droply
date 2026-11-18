-- Contact form only. No changes to desktop app or newsletter.
create table if not exists public.contact_messages (
 id uuid primary key default gen_random_uuid(),
 sender_name text not null check (char_length(btrim(sender_name)) between 1 and 80),
 sender_email text not null check (sender_email = lower(btrim(sender_email)) and char_length(sender_email) between 3 and 254),
 body text not null check (char_length(btrim(body)) between 10 and 3000),
 status text not null default 'new' check (status in ('new','read','resolved')),
 created_at timestamptz not null default now()
);
comment on table public.contact_messages is 'Private messages from the Droply marketing contact dialog.';
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from public, anon, authenticated;
grant select, insert, update, delete on public.contact_messages to service_role;
create index if not exists contact_messages_inbox_idx on public.contact_messages (status, created_at desc);

create table if not exists public.contact_message_limits (
 bucket_hash text primary key check (bucket_hash ~ '^[0-9a-f]{64}$'),
 attempts integer not null default 0 check (attempts >= 0),
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
comment on table public.contact_message_limits is 'Short-lived HMAC fingerprints for contact-form throttling; raw IP addresses are not saved.';
alter table public.contact_message_limits enable row level security;
revoke all on public.contact_message_limits from public, anon, authenticated;
grant select, insert, update, delete on public.contact_message_limits to service_role;
create index if not exists contact_message_limits_expiry_idx on public.contact_message_limits (expires_at);

create or replace function public.contact_take_quota(p_bucket text,p_max_attempts integer,p_ttl_seconds integer)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare allowed boolean;
begin
 if p_bucket is null or p_bucket !~ '^[0-9a-f]{64}$'
   or p_max_attempts is null or p_max_attempts not between 1 and 200
   or p_ttl_seconds is null or p_ttl_seconds not between 60 and 86400
 then return false; end if;

 delete from public.contact_message_limits
 where expires_at < clock_timestamp() - interval '1 day';

 insert into public.contact_message_limits (bucket_hash, attempts, expires_at)
 values (p_bucket, 1, clock_timestamp() + make_interval(secs => p_ttl_seconds))
 on conflict (bucket_hash) do update
 set attempts = case when public.contact_message_limits.expires_at <= clock_timestamp()
          then 1 else public.contact_message_limits.attempts + 1 end,
     expires_at = case when public.contact_message_limits.expires_at <= clock_timestamp()
          then clock_timestamp() + make_interval(secs => p_ttl_seconds)
          else public.contact_message_limits.expires_at end
 where public.contact_message_limits.attempts < p_max_attempts
    or public.contact_message_limits.expires_at <= clock_timestamp()
 returning true into allowed;
 return coalesce(allowed,false);
end;
$$;
revoke all on function public.contact_take_quota(text,integer,integer) from public,anon,authenticated;
grant execute on function public.contact_take_quota(text,integer,integer) to service_role;
