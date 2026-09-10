# T-008 · Job queue: table, claim, retry, cron tick endpoint

**Status:** not started
**Depends on:** T-006
**Size:** M
**Blocked by:** —

## Goal
Work can be enqueued to the database and drained by an authenticated tick endpoint that
claims jobs safely under concurrency, retries failures with backoff, and dead-letters.

## Context to read first
- `docs/plan/01-ARCHITECTURE.md` § 1 — there is no background worker
- `docs/plan/02-CONTRACTS.md` § Data model → `job`; § API surface → `/api/cron/tick`
- `docs/plan/DECISIONS.md` D-02, D-03, D-04

## Files
**Create:** `supabase/migrations/0004_job_queue.sql`, `lib/jobs/queue.ts`,
`lib/jobs/handlers/index.ts`, `app/api/cron/tick/route.ts`,
`tests/integration/job-queue.test.ts`
**Modify:** `lib/types/database.ts` (regenerate), `.env.example` (`CRON_SECRET`)
**Do not touch:** `lib/ledger/`

## Implementation notes
1. `job` table per contract, including the partial unique index on `dedupe_key` where
   status is `pending` or `running`. That index is what stops the same import being queued
   twice by an impatient user clicking upload twice.
2. `claimJobs(limit)` runs a single statement:
   `update job set status='running', locked_at=now(), locked_by=$worker, attempts=attempts+1
    where id in (select id from job where status='pending' and run_after<=now()
    order by run_after limit $limit for update skip locked) returning *`.
   `FOR UPDATE SKIP LOCKED` is required — two overlapping ticks must never claim the same row.
3. Handler registry maps `kind` to an async function. Unknown kinds fail the job with a
   clear error rather than throwing an unhandled exception that loses the job.
4. Retry with exponential backoff: `run_after = now() + interval '30 seconds' * 2^attempts`.
   At `attempts >= max_attempts` the status becomes `dead`, never silently `done`.
5. **Reclaim stuck jobs.** A function that returns rows `running` with
   `locked_at < now() - interval '10 minutes'` to `pending`. Vercel functions get killed
   mid-flight; without this, work stalls permanently and nothing says so.
6. `/api/cron/tick` compares a `Authorization: Bearer <CRON_SECRET>` header in constant
   time and returns 401 otherwise. It claims a bounded batch (default 20, Q-03), runs
   handlers sequentially, and returns counts. It must never exceed the function timeout —
   track elapsed time and stop claiming when 80% of the budget is spent.
7. Register `pg_cron` to POST the endpoint every minute via `pg_net`, in a migration, with
   the secret read from a Postgres setting rather than inlined into the migration SQL.
   Document the fallback to Vercel Cron in `docs/DEPLOYMENT.md`.
8. Register no handlers in this task beyond a `noop` used by the tests.

## Acceptance criteria
- [ ] `npx supabase db reset` applies 0004 cleanly
- [ ] `npm test -- tests/integration/job-queue.test.ts` passes
- [ ] Test proves two concurrent `claimJobs(10)` calls never return the same job id
- [ ] Test proves a failing handler increments `attempts` and pushes `run_after` forward
- [ ] Test proves a job at `max_attempts` becomes `dead`, not `done`
- [ ] Test proves the stuck-job reclaim returns a 15-minute-old `running` job to `pending`
- [ ] Test proves a duplicate `dedupe_key` insert while one is pending is rejected
- [ ] `curl -X POST localhost:3000/api/cron/tick` without the header returns 401
- [ ] `curl -X POST localhost:3000/api/cron/tick -H "Authorization: Bearer $CRON_SECRET"`
      returns 200 with `{claimed,processed,failed}`
- [ ] `npm run check` exits 0

## Out of scope
Any specific job handler (T-010 adds the first). Monitoring and heartbeat alerting (T-033).
A separate worker platform.

## Commit
`feat(jobs): add database job queue with cron tick endpoint`
