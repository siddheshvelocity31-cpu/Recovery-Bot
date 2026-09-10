# T-018 · Open items tab and aging summary

**Status:** not started
**Depends on:** T-017
**Size:** M
**Blocked by:** —

## Goal
An accounts user opens Olectra and sees what is owed, broken into aged buckets, with the
unaged brought-forward balance visibly separated rather than blended in.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § API surface → `/api/clients/:id/open-items`
- `app/(app)/clients/[clientId]/page.tsx` from T-012 — add a tab, do not restructure
- `lib/ledger/aging.ts` — use `client_aging_summary`, do not recompute in the UI

## Files
**Create:** `components/clients/aging-strip.tsx`, `components/clients/open-items-table.tsx`,
`app/api/clients/[clientId]/open-items/route.ts`, `tests/integration/open-items-api.test.ts`
**Modify:** `app/(app)/clients/[clientId]/page.tsx` (register the tab only),
`components/clients/balance-header.tsx` (add the aging strip)
**Do not touch:** `components/trail/trail-list.tsx`, `lib/ledger/`

## Implementation notes
1. The aging strip is a single horizontal bar segmented by bucket, with amounts and
   percentages. **The unaged segment is rendered in a distinct neutral grey with an explicit
   label**, not as a fifth aging colour. For Olectra it is 77% of the balance, and a viewer
   must not read it as "current" or as "90+".
2. Open items table: doc code, issue date, due date, gross, credits, receipts, open amount,
   bucket, status. Sort by due date ascending with nulls last, so the unaged row does not
   sit at the top pretending to be the most urgent thing.
3. A visible reconciliation line: `sum of open amounts` next to `ledger closing balance`,
   with a warning when they differ. This is the screen the accounts team will use to decide
   whether to trust the system at all, and a silent discrepancy is what loses that trust.
4. Filter by status and by bucket via URL search params, so a filtered view is linkable.
   No client-side state library.
5. Empty state distinguishes "no open items because everything is settled" from "no open
   items because derivation has not run" — they look identical and mean opposite things.

## Acceptance criteria
- [ ] `npm test -- tests/integration/open-items-api.test.ts` passes
- [ ] Test proves the endpoint returns 104 items for Olectra with totals matching
      `client_aging_summary`
- [ ] Test proves `?status=settled` filters correctly
- [ ] Manual, from a clean database: reset, import the fixture, open Olectra's Open Items
      tab, and observe total open **₹66,97,661.00** matching the ledger closing balance
- [ ] The aging strip shows the ₹51,30,687.00 `B/F` amount in the unaged segment, labelled,
      and not inside any dated bucket
- [ ] The reconciliation line shows no warning on the fixture data
- [ ] Deliberately corrupting one `gross_amount_paise` in the database makes the
      reconciliation warning appear
- [ ] `npm run check` exits 0

## Out of scope
Flags and alerts (T-031, T-032). Editing open items or marking disputes (later). Export to
Excel (later). Category display (T-022).

## Commit
`feat(clients): add open items tab with aging summary`
