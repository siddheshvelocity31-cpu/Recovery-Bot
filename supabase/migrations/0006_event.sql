-- T-011: Event trail table.
-- Run after T-006 (client, contact, ledger tables).

-- Create the event type union if not already created
create type if not exists event_type as enum (
  'ledger.imported',
  'ledger.import_failed',
  'open_item.created',
  'open_item.settled',
  'open_item.disputed',
  'case.opened',
  'case.advanced',
  'case.suppressed',
  'case.escalated',
  'case.resolved',
  'outreach.scheduled',
  'outreach.suppressed',
  'outreach.dry_run',
  'outreach.sent',
  'outreach.delivered',
  'outreach.failed',
  'reply.received',
  'commitment.proposed',
  'commitment.confirmed',
  'commitment.kept',
  'commitment.broken',
  'flag.raised',
  'flag.acknowledged',
  'flag.resolved',
  'client.categorised',
  'client.muted',
  'client.unmuted',
  'settings.changed'
);

-- Table: event
create table if not exists event (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client on delete cascade,
  case_id uuid,
  actor_type actor_type not null,
  actor_id uuid,
  type event_type not null,
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

alter table event enable row level security;

create trigger event_updated_at
  before update on event
  for each row execute function set_updated_at();

-- Block UPDATE and DELETE on event (append-only)
create trigger event_append_only_update_trigger
  before update on event
  for each row execute function raise_append_only_error();

create trigger event_append_only_delete_trigger
  before delete on event
  for each row execute function raise_append_only_error();

-- Index for trail queries
create index idx_event_client_occurred on event (client_id, occurred_at desc);
create index idx_event_type on event (type);

-- The raise_append_only_error function (if not already created by T-006)
create or replace function raise_append_only_error()
returns trigger
language plpgsql
as $$
begin
  raise exception 'event is append-only: UPDATE and DELETE are not allowed';
end;
$$;