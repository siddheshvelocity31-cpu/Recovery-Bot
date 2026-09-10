-- T-008: Job queue table and utilities.
-- Run after T-006 (client, contact, ledger tables).

-- Create the job enum if not already created
create type if not exists job_status as enum ('pending', 'running', 'done', 'failed', 'dead');

-- Table: job
create table if not exists job (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}',
  run_after timestamptz not null default now(),
  status job_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  dedupe_key text unique,
  completed_at timestamptz,
  constraint job_dedupe_key_pending unique (dedupe_key) where status in ('pending', 'running')
);

alter table job enable row level security;

create trigger job_updated_at
  before update on job
  for each row execute function set_updated_at();

-- Indexes
create index idx_job_status_run_after on job (status, run_after);
create index idx_job_locked_on on job (status, locked_at);

-- 1. claim_jobs: claim a batch of pending jobs for a worker
create or replace function claim_jobs(limit integer, worker text)
returns table (
  id uuid,
  kind text,
  payload jsonb,
  run_after timestamptz,
  status job_status,
  attempts integer,
  max_attempts integer,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  dedupe_key text,
  completed_at timestamptz
) language sql stable
as $$
  update job set status = 'running', locked_at = now(), locked_by = worker, attempts = attempts + 1
  from (select id from job where status = 'pending' and run_after <= now() order by run_after limit limit for update skip locked) sub
  where job.id = sub.id
  returning job.*;
$$

-- 2. reclaim_stuck_jobs: return running jobs that have been locked too long
create or replace function reclaim_stuck_jobs()
returns table (
  id uuid,
  kind text,
  payload jsonb,
  run_after timestamptz,
  status job_status,
  attempts integer,
  locked_at timestamptz,
  locked_by text
) language sql stable
as $$
  update job set status = 'pending', locked_at = null, locked_by = null
  where status = 'running' and locked_at < now() - interval '10 minutes'
  returning *;
$$

-- 3. fail_job: mark a job as failed with an error message
create or replace function fail_job(error_text text, job_id uuid)
returns void language sql stable
as $$
  update job set status = 'failed', last_error = error_text, attempts = attempts + 1, completed_at = now()
  where id = job_id;
$$