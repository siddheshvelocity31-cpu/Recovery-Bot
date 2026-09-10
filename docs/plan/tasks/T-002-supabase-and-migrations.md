# T-002 · Supabase local, migration tooling, generated types

**Status:** not started
**Depends on:** T-001
**Size:** M
**Blocked by:** —

## Goal
A local Supabase instance starts, an initial migration applies, and typed database access
works from both a session-bound and a service-role client.

## Context to read first
- `docs/plan/03-CONVENTIONS.md` § Database work, § Folder structure
- `docs/plan/01-ARCHITECTURE.md` § Security model
- `docs/plan/02-CONTRACTS.md` § IDs, § Naming

## Files
**Create:** `supabase/config.toml` (via CLI init), `supabase/migrations/0001_extensions_and_helpers.sql`,
`lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/types/database.ts` (generated),
`tests/integration/db.test.ts`
**Modify:** `package.json` (add `db:types`, `db:reset`), `.env.example`
**Do not touch:** `app/`, anything from T-001 beyond package.json

## Implementation notes
1. `npx supabase init`, then `npx supabase start`. Record the pinned CLI version in
   PROGRESS.md notes — version drift between machines causes migration surprises.
2. Migration `0001` contains only foundations, no domain tables:
   - `create extension if not exists pgcrypto;` (for `gen_random_uuid()`)
   - `create extension if not exists pg_cron;` and `pg_net` — needed in T-008. If either
     is unavailable locally, note it and proceed; they exist on hosted Supabase.
   - the shared trigger function `set_updated_at()` returning `new` with
     `new.updated_at = now()`
3. `lib/supabase/server.ts` uses `@supabase/ssr` `createServerClient` with cookie handling,
   for the logged-in user's session.
4. `lib/supabase/admin.ts` uses the service-role key and starts with
   `import 'server-only'`. If that import is ever missing, the key can reach the browser.
   This is the single most dangerous file in the repository.
5. `db:types` runs `supabase gen types typescript --local > lib/types/database.ts`.
   Commit the generated file. Never hand-edit it.
6. The integration test connects with the service-role client and asserts
   `select now()` succeeds. It is proving the wiring, not the schema.

## Acceptance criteria
- [ ] `npx supabase start` brings the stack up and reports a local API URL
- [ ] `npx supabase db reset` applies migration 0001 with no errors
- [ ] `npm run db:types` regenerates `lib/types/database.ts` and the file is non-empty
- [ ] `npm test -- tests/integration/db.test.ts` passes against local Supabase
- [ ] `npm run check` exits 0
- [ ] `grep -r "SUPABASE_SERVICE_ROLE_KEY" app/ components/` returns nothing
- [ ] `lib/supabase/admin.ts` first line is `import 'server-only'`

## Out of scope
Any domain table (T-006 onward). RLS policies (each table's own migration enables RLS).
Auth flows (T-004).

## Commit
`chore(db): add supabase local setup, migration tooling and typed clients`
