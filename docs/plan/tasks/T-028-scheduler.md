# T-028 · Scheduler: evaluate cases, resolve policy, apply rails, enqueue

**Status:** not started
**Depends on:** T-026, T-027, T-008
**Size:** L — split at note 6 if it runs long
**Blocked by:** —

## Goal
A tick finds cases due for action, decides what should happen, and queues outreach — or
records a suppression with its reason. This is where the whole system comes together.

## Context to read first
- `docs/plan/01-ARCHITECTURE.md` § Data flow diagram
- `lib/policy/resolve.ts`, `lib/policy/rails.ts`, `lib/cases/state-machine.ts`
- `lib/jobs/queue.ts` from T-008 — enqueue and idempotency semantics
- `docs/plan/02-CONTRACTS.md` § Data model → `outreach`, `recovery_case`

## Files
**Create:** `lib/cases/evaluate.ts`, `lib/cases/open-cases.ts`,
`lib/jobs/handlers/case-evaluate.ts`, `lib/outreach/weekly-count.ts`,
`tests/integration/case-evaluate.test.ts`
**Modify:** `lib/jobs/handlers/index.ts` (register),
`lib/jobs/handlers/aging-recompute.ts` (enqueue case evaluation after aging only)
**Do not touch:** `lib/policy/resolve.ts`, `lib/policy/rails.ts`,
`lib/cases/state-machine.ts` — this task orchestrates them, it does not change them

## Implementation notes
1. Two entry points, both jobs:
   - `case.evaluate` for one client: open a case if open items exist and none is live,
     load everything, resolve policy, decide the transition, check rails, and either insert
     a queued `outreach` row or write a suppression event.
   - a sweep that enqueues `case.evaluate` for every client whose `next_action_at` has
     passed, bounded per tick.
2. **This task writes no message and calls no provider.** It inserts `outreach` rows with
   status `queued` and `is_dry_run` true. T-029 renders and "delivers" them.
3. Insert the `outreach` row with its `idempotency_key` **before** anything else, and treat
   a unique violation as success-already-done rather than an error (D-04). This is the line
   that makes a retried tick safe.
4. `weekly-count.ts` counts non-suppressed outreach for a client in the trailing 7 days in
   `BUSINESS_TZ`, in SQL. Pass the number into `checkRails`; do not let the rails function
   query.
5. Every outcome writes an event: `case.opened`, `case.advanced`, `outreach.scheduled`,
   `outreach.suppressed` with the rails `rule` and reason, `case.escalated`, `case.resolved`.
   A tick that decides to do nothing must still say why — silence in the trail is
   indistinguishable from a broken scheduler.
6. **Split point:** case opening and the sweep first, with events but no outreach insertion;
   then rails application and outreach queuing. Both halves are independently verifiable.
7. Bound the work per tick and respect the elapsed-time budget from T-008. A sweep that
   times out mid-way must be resumable, which it is, because each client's evaluation is
   independent and idempotent.
8. Wrap each client's evaluation so one client's bad data cannot abort the sweep for
   everyone else. Log and continue, counting failures.

## Acceptance criteria
- [ ] `npm test -- tests/integration/case-evaluate.test.ts` passes
- [ ] Test proves importing the fixture then running ticks opens exactly one case for Olectra
- [ ] Test proves a second evaluation in the same window creates no second case and no
      second `outreach` row
- [ ] Test proves an `outreach` row is created with `status = 'queued'` and
      `is_dry_run = true`
- [ ] Test proves a muted client produces an `outreach.suppressed` event naming the mute
      rule and **no** `outreach` row
- [ ] Test proves a client at the weekly cap is suppressed with the cap rule
- [ ] Test proves an evaluation during quiet hours suppresses and reschedules rather than
      dropping the step
- [ ] Test proves a client with zero open items resolves the case and writes `case.resolved`
- [ ] Test proves one client with corrupt data does not prevent the other clients in the
      same sweep from being evaluated
- [ ] `npm run check` exits 0

## Out of scope
Rendering message bodies (T-029). Any provider call — explicitly not in this plan.
Flags (T-031). Human approval queue — later phase.

## Commit
`feat(cases): add case evaluation scheduler with rails enforcement`
