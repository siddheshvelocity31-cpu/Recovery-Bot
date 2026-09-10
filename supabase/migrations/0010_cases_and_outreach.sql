-- Enums
create type case_status as enum ('open', 'awaiting_reply', 'promise_active', 'escalated', 'suppressed', 'resolved');
create type outreach_status as enum ('queued', 'suppressed', 'sent', 'delivered', 'read', 'failed');
create type commitment_status as enum ('proposed', 'confirmed', 'kept', 'partial', 'broken', 'rejected');

-- recovery_case
create table recovery_case (
  id                  uuid         primary key default gen_random_uuid(),
  client_id           uuid         not null references client,
  status              case_status  not null default 'open',
  current_step_number int          not null default 0,
  next_action_at      timestamptz,
  total_open_paise    bigint       not null default 0,
  assigned_to         uuid         references app_user,
  suppressed_until    timestamptz,
  suppression_reason  text,
  opened_at           timestamptz  not null default now(),
  closed_at           timestamptz,
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now()
);

alter table recovery_case enable row level security;

-- Add event.case_id FK reference now that recovery_case exists
alter table event
  add constraint event_case_id_fkey
  foreign key (case_id) references recovery_case(id) on delete set null;

-- At most one non-resolved case per client
create unique index recovery_case_one_live_per_client
  on recovery_case (client_id)
  where status <> 'resolved';

-- Hot query index for scheduler
create index on recovery_case (next_action_at)
  where status not in ('resolved', 'suppressed');

create trigger recovery_case_updated_at
  before update on recovery_case
  for each row execute function set_updated_at();

-- outreach
create table outreach (
  id                    uuid            primary key default gen_random_uuid(),
  case_id               uuid            not null references recovery_case,
  client_id             uuid            not null references client,
  contact_id            uuid            references contact,
  channel               channel         not null,
  cadence_step_number   int             not null,
  template_key          text            not null,
  persona_tone          tone            not null,
  rendered_body         text            not null,
  status                outreach_status not null default 'queued',
  idempotency_key       text            not null unique,
  is_dry_run            boolean         not null default true,
  suppression_reason    text,
  provider              text,
  provider_message_id   text,
  cost_paise            bigint,
  scheduled_for         timestamptz     not null,
  sent_at               timestamptz,
  delivered_at          timestamptz,
  read_at               timestamptz,
  failed_reason         text,
  created_at            timestamptz     not null default now(),
  updated_at            timestamptz     not null default now()
);

alter table outreach enable row level security;

create trigger outreach_updated_at
  before update on outreach
  for each row execute function set_updated_at();

-- reply (written by later LLM phase; structure settled here for FK integrity)
create table reply (
  id                  uuid        primary key default gen_random_uuid(),
  case_id             uuid        not null references recovery_case,
  client_id           uuid        not null references client,
  outreach_id         uuid        references outreach,
  channel             channel     not null,
  raw_text            text        not null,
  received_at         timestamptz not null default now(),
  provider_message_id text,
  created_at          timestamptz not null default now()
);

alter table reply enable row level security;

-- commitment (written by later LLM phase; structure settled here)
create table commitment (
  id                    uuid               primary key default gen_random_uuid(),
  case_id               uuid               not null references recovery_case,
  reply_id              uuid               references reply,
  promised_amount_paise bigint,
  promised_on           date,
  due_at                timestamptz,
  confidence            numeric(3,2),
  extraction_model      text,
  status                commitment_status  not null default 'proposed',
  confirmed_by          uuid               references app_user,
  confirmed_at          timestamptz,
  created_at            timestamptz        not null default now(),
  updated_at            timestamptz        not null default now()
);

alter table commitment enable row level security;

create trigger commitment_updated_at
  before update on commitment
  for each row execute function set_updated_at();
