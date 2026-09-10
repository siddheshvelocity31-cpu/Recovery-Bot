# T-005 · Deploy to Vercel with a reachable health endpoint

**Status:** not started
**Depends on:** T-002
**Size:** S
**Blocked by:** needs a Vercel account and a staging Supabase project (owner: you)

## Goal
The application is deployed to Vercel and `/api/health` returns 200 with a confirmed
database connection from the deployed environment.

## Context to read first
- `docs/plan/01-ARCHITECTURE.md` § Environments
- `docs/plan/02-CONTRACTS.md` § API surface → `/api/health`, § Response envelope

## Files
**Create:** `app/api/health/route.ts`, `docs/DEPLOYMENT.md`
**Modify:** `.env.example`, `README.md`
**Do not touch:** `supabase/migrations/`

## Implementation notes
1. Create a **second** Supabase project for staging. Do not point Preview at the local or
   the future production project. See D-10 — this separation is the whole point.
2. `/api/health` runs `select 1` through the service-role client and returns
   `{ status, version, db }` where `version` comes from `process.env.VERCEL_GIT_COMMIT_SHA`.
   It returns 503 with the standard error envelope when the database check fails, so an
   uptime monitor can use it directly.
3. Set environment variables in Vercel for Preview and Production separately. Mark
   `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` as sensitive.
4. `docs/DEPLOYMENT.md` records: which Supabase project maps to which Vercel environment,
   how to apply migrations to each (`supabase link` then `db push`), and how to rotate the
   service-role key. Write it now, while it is fresh — this is the document that is never
   written later and always needed at the worst moment.
5. Confirm and record the Vercel plan's function timeout in PROGRESS.md notes. T-008 and
   T-010 size their batches against it (Q-03).

## Acceptance criteria
- [ ] `curl -s https://<preview-url>/api/health` returns 200 with `"db":"ok"`
- [ ] `curl -s -o /dev/null -w "%{http_code}" https://<preview-url>/api/health` is `200`
- [ ] Health check returns 503 when given a deliberately wrong key (test locally, then revert)
- [ ] Vercel build succeeds from a clean clone
- [ ] `docs/DEPLOYMENT.md` names both Supabase projects and the migration command for each
- [ ] The observed function timeout is recorded in `PROGRESS.md`

## Out of scope
Production deployment and a custom domain. Cron configuration (T-008). Monitoring and
alerting (T-033).

## Commit
`chore(deploy): add health endpoint and vercel staging deployment`
