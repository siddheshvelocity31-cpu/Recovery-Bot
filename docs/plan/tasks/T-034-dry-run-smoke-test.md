# T-034 · Seed script and end-to-end dry-run smoke test

**Status:** not started
**Depends on:** T-030, T-032
**Size:** M
**Blocked by:** —

## Goal
One command takes a clean database through the entire flow — import, derive, age, categorise,
evaluate, dispatch, flag — and asserts the whole system produced the right result with zero
messages leaving the building.

## Context to read first
- `docs/plan/00-OVERVIEW.md` § Success criteria for this plan — this task verifies all five
- `supabase/seed.sql` from T-020
- `lib/jobs/queue.ts` — how to drain the queue deterministically in a test

## Files
**Create:** `scripts/dry-run-demo.ts`, `tests/e2e/full-cycle.test.ts`,
`docs/RUNBOOK.md`
**Modify:** `package.json` (`demo` and `test:e2e` scripts), `PROGRESS.md` (final state)
**Do not touch:** any `lib/` file — if this test needs production code changed, that is a
bug in an earlier task and belongs there

## Implementation notes
1. `scripts/dry-run-demo.ts` resets, seeds, imports the fixture, then drains the job queue
   in a loop with an injected clock advancing day by day for 45 simulated days, printing what
   the system decided each day. This script is the demo you show the accounts team, and it is
   worth making the output readable prose rather than log lines.
2. The clock must be injectable through the whole chain. Every pure function in this plan
   takes `now` as a parameter for exactly this reason — if any of them reads the clock
   directly, this task will surface it, and the fix belongs in that task's file.
3. `tests/e2e/full-cycle.test.ts` runs the same sequence and asserts the end state rather
   than printing it. Keep it a single test with a clear failure message per assertion; a
   flaky or opaque end-to-end test gets deleted within a month.
4. **The global fetch spy is the most important assertion in this file.** Install it before
   anything runs and fail the test if it is called at all. That single check is what
   guarantees the dry-run promise across the entire system, and it is far more reliable
   than reviewing each adapter by eye.
5. `docs/RUNBOOK.md` covers the operational questions someone will ask at an awkward moment:
   how to import a ledger, how to read the trail, how to mute a client, how to stop
   everything, what to do when an import fails reconciliation, what the grey unaged flag
   means and why it cannot be cleared by the software, and how to hand a stuck job back to
   `pending`.
6. Finish by updating `PROGRESS.md` with the completion state and a short note on what the
   next phase needs — the vendor credentials and answered questions from `DECISIONS.md`.

## Acceptance criteria
- [ ] `npm run demo` completes on a clean database and prints a readable day-by-day summary
- [ ] `npm test -- tests/e2e/full-cycle.test.ts` passes
- [ ] Asserts 108 `ledger_entry` rows and 104 `open_item` rows for Olectra
- [ ] Asserts `SUM(open_amount_paise) = 669766100n` matching the ledger closing balance
- [ ] Asserts exactly one open `recovery_case` for Olectra
- [ ] Asserts at least one `outreach` row exists, that **every** row has `is_dry_run = true`,
      and that none has a `provider` other than `dry-run`
- [ ] Asserts exactly one `unaged_balance` flag with severity `grey` and no `aged_debt` flag
      referencing the `B/F` item
- [ ] Asserts the trail contains `ledger.imported`, `open_item.created`, `case.opened`,
      `outreach.scheduled` and `outreach.dry_run` events
- [ ] **Asserts the global fetch spy was never called during the entire run**
- [ ] Asserts a simulation run mid-cycle changed no row counts
- [ ] `npm run check` exits 0 and `npm test` passes in full
- [ ] `docs/RUNBOOK.md` answers all seven questions listed in note 5

## Out of scope
Live sending, real providers, real contacts. Load testing. Production rollout — the plan
ends here deliberately, at the last point where a mistake is free.

## Commit
`test(e2e): add full dry-run cycle smoke test and runbook`
