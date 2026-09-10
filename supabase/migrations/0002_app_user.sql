-- User role enum and app_user table with auto-create trigger from auth.users.

create type user_role as enum ('admin', 'collector', 'viewer');

create table app_user (
  id            uuid        primary key references auth.users on delete cascade,
  email         text        not null unique,
  full_name     text        not null,
  role          user_role   not null default 'viewer',
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table app_user enable row level security;

create trigger app_user_updated_at
  before update on app_user
  for each row execute function set_updated_at();

-- Auto-create an app_user row when auth.users is inserted.
-- New users start with the least privilege (viewer).
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.app_user (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();
