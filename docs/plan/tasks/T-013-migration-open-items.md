# T-013 · Migration: open_item, receipt, allocation

**Status:** not started
**Depends on:** T-006
**Size:** S
**Blocked by:** —

## Goal
The settlement tables exist with the generated `open_amount_paise` column and the
constraints that keep allocations honest.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § Data model → Open items and settlement; § Enums
- `supabase/migrations/0003_clients_and_ledger.sql`

## Files
**Create:** `supabase/migrations/0007_open_items.sql`, `tests/integration/schema-open-items.test.ts`
**Modify:** `lib/types/database.ts` (regenerate)
**Do not touch:** earlier migrations

## Implementation notes
1. Enums `open_item_status` and `aging_bucket` first.
2. `open_amount_paise` is `GENERATED ALWAYS AS (gross - credits - receipts) STORED`. Making
   it generated means it can never disagree with its components, which is the failure this
   avoids: a settled invoice still showing a balance because one update path forgot to
   recompute.
3. `allocation` gets a CHECK that exactly one of `receipt_id` and `credit_entry_id` is
   non-null, plus a partial unique index on `credit_entry_id` so a credit note cannot be
   allocated twice.
4. Add a CHECK that `open_amount_paise >= 0` is **not** enforced — over-allocation must be
   detectable rather than rejected, because real ledgers do contain over-credits and a hard
   constraint would block the import rather than surface the anomaly. Note this explicitly
   in a SQL comment on the column so the next reader does not "fix" it.
5. `is_unaged BOOLEAN` with `due_date` nullable, for the brought-forward balance.
6. RLS on, no policies. `set_updated_at()` on `open_item`.

## Acceptance criteria
- [ ] `npx supabase db reset` applies 0007 cleanly
- [ ] `npm test -- tests/integration/schema-open-items.test.ts` passes
- [ ] Test proves `open_amount_paise` updates automatically when `receipts_applied_paise`
      changes, without an explicit write to it
- [ ] Test proves an `allocation` with both `receipt_id` and `credit_entry_id` is rejected
- [ ] Test proves an `allocation` with neither is rejected
- [ ] Test proves a second allocation for the same `credit_entry_id` is rejected
- [ ] Test proves an over-allocated open item reaches a negative `open_amount_paise`
      without error
- [ ] `npm run check` exits 0

## Out of scope
Deriving open items (T-014). Allocation logic (T-015, T-016). Aging (T-017).

## Commit
`feat(db): add open item, receipt and allocation tables`
