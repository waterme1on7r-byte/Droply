-- Add resolution details for the private contact inbox only.
-- Existing resolved messages are preserved with null notes.
alter table public.contact_messages
  add column if not exists resolution_note text,
  add column if not exists resolved_by text,
  add column if not exists resolved_at timestamptz;

alter table public.contact_messages
  add constraint contact_messages_resolution_note_length
    check (resolution_note is null or (char_length(btrim(resolution_note)) between 5 and 2000)),
  add constraint contact_messages_resolved_by_allowlist
    check (resolved_by is null or resolved_by in ('anil','cenk'));

comment on column public.contact_messages.resolution_note is
  'Private note entered by an authorized contact administrator when resolving a message.';
comment on column public.contact_messages.resolved_by is
  'Validated administrator username assigned by the authenticated Edge Function.';
comment on column public.contact_messages.resolved_at is
  'Server-side timestamp when the latest resolution note was saved.';

-- Never relax Row Level Security to expose private notes.
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from public, anon, authenticated;
grant select, insert, update, delete on public.contact_messages to service_role;