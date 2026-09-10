# T-015 · Allocate credit notes to their original invoices

**Status:** not started
**Depends on:** T-014
**Size:** M
**Blocked by:** —

## Goal
Each credit note in the ledger is matched to the invoice it reverses and reduces that
invoice's balance, with unmatched credits surfaced rather than absorbed.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § Data model → `allocation`, `open_item`
- `docs/recovery-system-plan.md` § 0 — refunds cross-reference originals via `Remarks`
- `lib/ledger/open-items.ts` from T-014

## Files
**Create:** `lib/ledger/allocate-credits.ts`, `lib/jobs/handlers/ledger-allocate-credits.ts`,
`tests/unit/allocate-credits.test.ts`, `tests/integration/allocate-credits.test.ts`
**Modify:** `lib/jobs/handlers/index.ts` (register), `lib/jobs/handlers/ledger-derive-open-items.ts`
(enqueue allocation on completion only)
**Do not touch:** `lib/ledger/open-items.ts`

## Implementation notes
1. **Matching strategy, in strict order.** Try each and stop at the first hit, recording
   which one matched so the quality of matching is measurable:
   a. `remarks` contains a `doc_code` that exists as an open item for this client.
      This is the primary path: `DR26/554` carries `DW26/304720` in `remarks`.
   b. Same `ticket_no` or `pnr` on a debit entry belonging to an open item.
   c. Same `reference` value, when it resolves to exactly one open item.
2. **Unmatched credits are not absorbed.** Leave them unallocated, count them, and write an
   event. A credit note quietly applied to the wrong invoice, or to the balance generally,
   is how a client gets chased for money they were already refunded — the single most
   damaging error this system can make.
3. Allocation amount is `min(abs(credit_amount), open_item.open_amount_paise)`. Where a
   credit exceeds the remaining balance, allocate what fits, leave the remainder
   unallocated, and flag it for human review rather than allowing a negative balance
   silently.
4. `credits_applied_paise` is increased by the allocation total; `open_amount_paise` follows
   automatically because it is generated (T-013).
5. Set `status = 'settled'` when `open_amount_paise` reaches 0, and emit `open_item.settled`.
6. Idempotent: the partial unique index on `allocation.credit_entry_id` means a re-run
   cannot double-allocate. Handle the conflict rather than letting it throw.
7. In the fixture, `DZ26/700112` reverses `DW26/304858` and `DR26/567` reverses `DS26/2406`,
   both via `remarks`. Use them as named test cases.

## Acceptance criteria
- [ ] `npm test -- tests/unit/allocate-credits.test.ts` passes
- [ ] `npm test -- tests/integration/allocate-credits.test.ts` passes
- [ ] After a full fixture run, all **9** credit entries are accounted for: each is either
      allocated or explicitly counted as unmatched, and the test asserts the split
- [ ] `DR26/554` (−₹7,140) allocates to the open item for `DW26/304720`
- [ ] `DZ26/700112` allocates to `DW26/304858`
- [ ] `DR26/567` allocates to `DS26/2406`
- [ ] `SUM(open_amount_paise)` across all open items equals `669766100n` after allocation,
      matching the ledger's closing balance exactly
- [ ] Test proves an over-sized credit allocates partially and leaves a remainder unallocated
      rather than producing a negative `open_amount_paise`
- [ ] Test proves a second run creates no additional `allocation` rows
- [ ] `npm run check` exits 0

## Out of scope
Receipts (T-016). Aging (T-017). A UI for manually re-allocating a mismatched credit
(later; the counts and events are enough for now).

## Commit
`feat(ledger): allocate credit notes to originating invoices`
