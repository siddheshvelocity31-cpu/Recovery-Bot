-- New enums (relationship_tier and behaviour_band already exist from 0003)
create type channel as enum ('whatsapp', 'email', 'voice', 'human');
create type tone as enum ('courteous', 'neutral', 'firm');

-- category
create table category (
  id                uuid              primary key default gen_random_uuid(),
  code              text              not null unique,
  display_name      text              not null,
  relationship_tier relationship_tier not null,
  behaviour_band    behaviour_band    not null,
  is_default        boolean           not null default false,
  is_active         boolean           not null default true,
  created_at        timestamptz       not null default now(),
  updated_at        timestamptz       not null default now(),
  constraint category_tier_band_unique unique (relationship_tier, behaviour_band)
);

alter table category enable row level security;

-- Only one default category
create unique index category_one_default on category (is_default) where is_default = true;

create trigger category_updated_at
  before update on category
  for each row execute function set_updated_at();

-- Add category FK to client (column already exists as nullable stub from 0003)
alter table client
  add constraint client_category_id_fkey
  foreign key (category_id) references category on delete set null;

-- cadence_policy
create table cadence_policy (
  id                      uuid        primary key default gen_random_uuid(),
  category_id             uuid        not null unique references category on delete cascade,
  max_messages_per_week   int         not null default 2
                            check (max_messages_per_week between 0 and 7),
  is_active               boolean     not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table cadence_policy enable row level security;

create trigger cadence_policy_updated_at
  before update on cadence_policy
  for each row execute function set_updated_at();

-- cadence_step
create table cadence_step (
  id                    uuid      primary key default gen_random_uuid(),
  cadence_policy_id     uuid      not null references cadence_policy on delete cascade,
  step_number           int       not null check (step_number > 0),
  channel               channel   not null,
  offset_days_from_due  int       not null check (offset_days_from_due >= 0),
  template_key          text      not null,
  escalation_level      int       not null default 1,
  created_at            timestamptz not null default now(),
  constraint cadence_step_policy_step_unique unique (cadence_policy_id, step_number)
);

alter table cadence_step enable row level security;

-- persona
create table persona (
  id                       uuid        primary key default gen_random_uuid(),
  category_id              uuid        not null unique references category on delete cascade,
  tone                     tone        not null default 'neutral',
  salutation               text        not null default 'Dear {contact_name},',
  language                 text        not null default 'en',
  signature                text        not null,
  voice_script_style       text,
  requires_human_approval  boolean     not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- firm tone must require human approval
  constraint persona_firm_requires_approval
    check (tone <> 'firm' or requires_human_approval = true)
);

alter table persona enable row level security;

create trigger persona_updated_at
  before update on persona
  for each row execute function set_updated_at();

-- threshold_set
create table threshold_set (
  id                  uuid        primary key default gen_random_uuid(),
  category_id         uuid        not null unique references category on delete cascade,
  amber_days          int         not null default 30,
  red_days            int         not null default 60,
  amber_amount_paise  bigint,
  red_amount_paise    bigint,
  quiet_hours_start   time        not null default '19:00',
  quiet_hours_end     time        not null default '10:00',
  promise_grace_hours int         not null default 24,
  silence_attempts    int         not null default 3,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint threshold_red_gt_amber check (red_days > amber_days)
);

alter table threshold_set enable row level security;

create trigger threshold_set_updated_at
  before update on threshold_set
  for each row execute function set_updated_at();

-- setting_change (audit log)
create table setting_change (
  id         uuid        primary key default gen_random_uuid(),
  actor_id   uuid        not null references app_user,
  scope      text        not null,
  scope_id   uuid,
  field      text        not null,
  old_value  jsonb,
  new_value  jsonb,
  reason     text,
  changed_at timestamptz not null default now()
);

alter table setting_change enable row level security;
