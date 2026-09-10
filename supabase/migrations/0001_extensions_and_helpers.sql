-- Extensions and shared helpers. No domain tables.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Exposed over PostgREST so integration tests can prove a client reaches a
-- live Postgres without depending on any domain table.
create or replace function health_check()
returns timestamptz
language sql
stable
as $$
  select now();
$$;
