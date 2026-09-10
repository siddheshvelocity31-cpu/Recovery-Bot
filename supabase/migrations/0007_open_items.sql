-- T-013: open_item, receipt, and allocation tables.
-- Run after T-006 (client, contact, ledger_import, ledger_entry).

-- 1. Enums
create type if not exists open_item_status as enum (
  'open',
  'part_paid',
  'settled',
  'disputed',
  'written_off'
);

create type if not exists aging_bucket as enum (
  'current',
  'd1_30',
  'd31_60',
  'd61_90',
  'd90_plus',
  'unknown'
);

-- 2. Table: open_item
create table if not exists open_item (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client on delete cascade,
  source_doc_code text not null,
  source_reference text,
  issue_date date not null,
  due_date date,
  gross_amount_paise bigint not null,
  credits_applied_paise bigint not null default 0,
  receipts_applied_paise bigint not null default 0,
  open_amount_paise bigint generated always as (
    gross_amount_paise - credits_applied_paise - receipts_applied_paise
  ) stored,
  status open_item_status not null default 'open',
  aging_bucket aging_bucket not null default 'unknown',
  is_unaged boolean not null default false,
  dispute_reason text,
  updated_at timestamptz not null default now()
);

alter table open_item enable row level security;

create trigger open_item_updated_at
  before update on open_item
  for each row execute function set_updated_at();

-- Indexes
create index idx_open_item_client_id on open_item (client_id);
create index idx_open_item_status on open_item (status);
create index idx_open_item_due_date on open_item (due_date);

-- 3. Table: receipt
create table if not exists receipt (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client on delete cascade,
  receipt_date date not null,
  amount_paise bigint not null check (amount_paise > 0),
  instrument text,
  reference text,
  external_ref text unique,
  unallocated_paise bigint not null default 0
);

alter table receipt enable row level security;

create trigger receipt_updated_at
  before update on receipt
  for each row execute function set_updated_at();

-- Index
create index idx_receipt_client_id on receipt (client_id);
create unique index idx_receipt_external_ref on receipt (external_ref);

-- 4. Table: allocation
create table if not exists allocation (
  id uuid primary key default gen_random_uuid(),
  open_item_id uuid not null references open_item on delete cascade,
  receipt_id uuid references receipt,
  credit_entry_id uuid references ledger_entry,
  amount_paise bigint not null check (amount_paise > 0),
  constraint allocation_exactly_one check (
    (receipt_id is not null and credit_entry_id is null) or
    (receipt_id is null and credit_entry_id is not null)
  ),
  constraint allocation_credit_entry_unique unique (credit_entry_id) where credit_entry_id is not null
);

alter table allocation enable row level security;

create trigger allocation_updated_at
  before update on allocation
  for each row execute function set_updated_at();

-- Indexes
create index idx_allocation_open_item_id on allocation (open_item_id);
create index idx_allocation_receipt_id on allocation (receipt_id);