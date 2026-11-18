-- Support tickets created through the Droply AI chat, separate from contact messages.
create table if not exists public.support_tickets (
 id uuid primary key default gen_random_uuid(),
 sender_name text not null check (char_length(btrim(sender_name)) between 1 and 80),
 sender_email text not null check (sender_email=lower(btrim(sender_email)) and char_length(sender_email) between 3 and 254),
 summary text not null check (char_length(btrim(summary)) between 10 and 4000),
 source text not null default 'droply-chat' check (source='droply-chat'),
 status text not null default 'new' check (status in ('new','read','resolved')),
 resolution_note text check (resolution_note is null or char_length(btrim(resolution_note)) between 5 and 2000),
 resolved_by text check (resolved_by is null or resolved_by in ('anil','cenk')),
 resolved_at timestamptz,
 created_at timestamptz not null default now()
);
comment on table public.support_tickets is 'Private support requests submitted explicitly through the Droply AI chat widget; isolated from contact messages.';
alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from public,anon,authenticated;
grant select,insert,update,delete on public.support_tickets to service_role;
create index if not exists support_tickets_inbox_idx on public.support_tickets(status,created_at desc);
