-- Droply contact admin: isolated from newsletter and desktop application.
-- Hashes are seeded privately after migration; NEVER put plaintext passwords here.
create table if not exists public.contact_admin_users (
  username text primary key check (username in ('anil', 'cenk')),
  password_hash text not null check (char_length(password_hash) >= 50),
  active boolean not null default true,
  session_version integer not null default 1 check (session_version >= 1),
  created_at timestamptz not null default now()
);

comment on table public.contact_admin_users is
  'Private allowlist of contact inbox administrators. Only salted password hashes are stored.';
alter table public.contact_admin_users enable row level security;
revoke all on public.contact_admin_users from public, anon, authenticated;
grant select, insert, update on public.contact_admin_users to service_role;

-- Service role only. SECURITY INVOKER does not bypass RLS.
-- A real user must still prove the plaintext password server-side.
create or replace function public.contact_admin_check_password(
  p_username text, p_password text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select u.active and u.password_hash = extensions.crypt(p_password, u.password_hash)
    from public.contact_admin_users u
    where u.username = p_username
  ), false)
$$;

revoke all on function public.contact_admin_check_password(text, text)
  from public, anon, authenticated;
grant execute on function public.contact_admin_check_password(text, text)
  to service_role;
