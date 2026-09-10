# T-017 · Due dates and aging buckets

**Status:** not started
**Depends on:** T-014
**Size:** M
**Blocked by:** Q-01 unresolved — proceed on the interim assumption, recorded in DECISIONS.md

## Goal
Every open item has a due date derived from the client's credit terms and an aging bucket
recomputed daily, with the brought-forward balance correctly excluded as unaged.

## Context to read first
- `docs/plan/DECISIONS.md` Q-01 — the interim assumption you are building on
- `docs/plan/02-CONTRACTS.md` § Dates and time, § Enums → `aging_bucket`
- `lib/dates.ts` from T-003 — all arithmetic goes through `BUSINESS_TZ`

## Files
**Create:** `supabase/migrations/0008_aging_cron.sql`, `lib/ledger/aging.ts`,
`lib/jobs/handlers/aging-recompute.ts`, `tests/unit/aging.test.ts`,
`tests/integration/aging.test.ts`
**Modify:** `lib/jobs/handlers/index.ts` (register the handler only)
**Do not touch:** `lib/ledger/open-items.ts`, `lib/ledger/allocate-credits.ts`

## Implementation notes
1. `due_date = issue_date + client.credit_terms_days` calendar days, evaluated in
   `BUSINESS_TZ`. Calendar days, not working days — note the choice in a comment so a future
   reader knows it was a decision rather than an oversight.
2. **Skip anything with `is_unaged = true`.** The `B/F` item keeps `due_date = NULL` and
   `aging_bucket = 'unknown'` forever. Any code path that assigns it a bucket is a bug, and
   T-031 raises a distinct grey flag for it instead.
3. Buckets, computed against "today" in `BUSINESS_TZ`, from `due_date`:
   `current` (not yet due) · `d1_30` · `d31_60` · `d61_90` · `d90_plus` · `unknown` (no due date).
   Boundaries are inclusive at the lower end: 30 days overdue is `d1_30`, 31 is `d31_60`.
   Write that boundary into the tests explicitly — off-by-one here shifts a client between
   an amber and a red flag.
4. Settled items are excluded from aging recomputation entirely; they are history.
5. The nightly job recomputes all non-settled items. It must be safe to run repeatedly on
   the same day — aging is a function of the date, so idempotency is free if nothing else
   is mutated.
6. Expose an rpc `client_aging_summary(client_id)` returning totals per bucket in paise, for
   T-018 to render. Aggregation in SQL, per § Money.
7. Because the fixture spans 17–28 Aug 2026 with 30-day terms, tests must inject a fixed
   "today" rather than using the real clock. A time-dependent test that passes today and
   fails in November is worse than no test.

## Acceptance criteria
- [ ] `npm test -- tests/unit/aging.test.ts` passes
- [ ] `npm test -- tests/integration/aging.test.ts` passes
- [ ] Unit tests assert every bucket boundary with an injected clock: 0, 1, 30, 31, 60, 61,
      90 and 91 days past due
- [ ] Test proves the `B/F` item retains `due_date IS NULL` and `aging_bucket = 'unknown'`
      after a recompute
- [ ] Test proves an item due 2026-09-16 (issue 2026-08-17 + 30) is `current` when today is
      2026-09-01 and `d1_30` when today is 2026-09-20
- [ ] Test proves changing `client.credit_terms_days` from 30 to 15 and recomputing shifts
      buckets accordingly
- [ ] Test proves `settled` items are not touched by a recompute
- [ ] `client_aging_summary` totals across buckets equal `SUM(open_amount_paise)` for
      non-settled items
- [ ] Running the recompute twice on the same injected date changes nothing
- [ ] `npm run check` exits 0

## Out of scope
Flags (T-031). The aging UI (T-018). Per-booking-type credit terms — that is the rework
path if Q-01 comes back differently, and it is a new task.

## Commit
`feat(ledger): add due date derivation and aging buckets`
