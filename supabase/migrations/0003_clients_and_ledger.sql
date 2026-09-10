-- T-006: Client, contact, ledger_import, and ledger_entry tables.
-- Run after T-003 (enums). Do not run before T-003.

-- 1. Enums (if not already created by T-003)
create type if not exists relationship_tier as enum ('strategic', 'standard', 'watchlist', 'new');
create type if not exists behaviour_band as enum ('prompt', 'slipping', 'chronic', 'unknown');
create type if not exists import_status as enum ('pending', 'parsing', 'imported', 'failed');
create type if not exists entry_type as enum ('debit', 'credit', 'opening');

-- 2. Table: client
create table if not exists client (
  id uuid primary key default gen_random_uuid(),
  client_code text not null unique,
  name text not null,
  cost_center text,
  credit_terms_days integer not null default 30,
  relationship_tier relationship_tier not null default 'new',
  behaviour_band behaviour_band not null default 'unknown',
  category_id uuid,
  assigned_collector_id uuid references app_user on delete set null,
  is_muted boolean not null default false,
  muted_until timestamptz,
  mute_reason text,
  tier_changed_at timestamptz,
  constraint client_client_code_not_null check (client_code is not null),
  constraint client_name_not_null check (name is not null)
);

alter table client enable row level security;

create trigger client_updated_at
  before update on client
  for each row execute function set_updated_at();

-- 3. Table: contact
create table if not exists contact (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client on delete cascade,
  full_name text not null,
  role_title text,
  phone_e164 text,
  email text,
  escalation_level integer not null default 1,
  is_primary boolean not null default false,
  whatsapp_opt_in boolean not null default false,
  email_opt_in boolean not null default true,
  voice_opt_in boolean not null default false,
  constraint contact_phone_e164_format check (phone_e164 = '' or phone_e164 ~* '^\+[1-9]\d{7,14}$')
);

alter table contact enable row level security;

create trigger contact_updated_at
  before update on contact
  for each row execute function set_updated_at();

-- 4. Table: ledger_import
create table if not exists ledger_import (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client on delete cascade,
  storage_path text not null,
  file_sha256 text not null unique,
  source_filename text not null,
  period_from date,
  period_to date,
  status import_status not null default 'pending',
  cursor_row integer not null default 0,
  row_count_total integer,
  row_count_imported integer not null default 0,
  row_count_rejected not null default 0,
  opening_balance_paise bigint,
  closing_balance_paise bigint,
  uploaded_by uuid references app_user,
  completed_at timestamptz,
  error_message text,
  updated_at timestamptz,
  constraint ledger_import_file_sha256_unique unique (file_sha256)
);

alter table ledger_import enable row level security;

create trigger ledger_import_updated_at
  before update on ledger_import
  for each row execute function set_updated_at();

-- 5. Table: ledger_entry — append-only
create table if not exists ledger_entry (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client on delete cascade,
  ledger_import_id uuid not null references ledger_import on delete cascade,
  natural_key text not null unique,
  row_number integer not null,
  doc_date date not null,
  doc_code text not null,
  entry_type entry_type not null,
  narration text,
  pax_name text,
  airline text,
  ticket_no text,
  pnr text,
  emp_code text,
  travel_date date,
  sector text,
  reference text,
  remarks text,
  bill_amount_paise bigint,
  raw_row jsonb not null default '{}'
);

-- Append-only enforcement: raise on UPDATE or DELETE
create trigger ledger_entry_append_only_trigger
  before update on ledger_entry
  for each row execute function raise_append_only_error();

create trigger ledger_entry_delete_trigger
  before delete on ledger_entry
  for each row execute function raise_append_only_error();

-- Add the raise_append_only_error function if not exists
create or replace function raise_append_only_error()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ledger_entry is append-only: UPDATE and DELETE are not allowed';
end;
$$;

-- Add indexes and constraints per contract
create index idx_ledger_entry_client_id on ledger_entry (client_id);
create index idx_ledger_entry_import_id on ledger_entry (ledger_import_id);
create index idx_ledger_entry_doc_date on ledger_entry (doc_date);
create index idx_ledger_entry_natural_key on ledger_entry (natural_key);

-- 6. RLS policies: enable RLS with no permissive policies (D-05)
-- RLS is enabled above with ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
-- No policies are added — the intent is that access is managed at the application layer
-- via the Supabase auth/RLS setup, not by database policies.