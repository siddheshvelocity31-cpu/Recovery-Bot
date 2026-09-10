# T-014 · Derive open items from ledger entries

**Status:** not started
**Depends on:** T-013, T-010
**Size:** L — the riskiest task in the plan. Split at note 7 if it runs long.
**Blocked by:** —

## Goal
Ledger entries become invoice-level open items, with multi-passenger groups collapsed
correctly and the brought-forward balance represented honestly as unaged.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § Data model → `open_item`, `ledger_entry`
- `docs/recovery-system-plan.md` § 0 — the two parsing traps, which are the whole difficulty
- `tests/fixtures/Olectra_Client_Ledger_Report.xlsx` — inspect rows for `DS26/2452`
- `lib/ledger/parse-xlsx.ts` from T-007

## Files
**Create:** `lib/ledger/open-items.ts`, `lib/jobs/handlers/ledger-derive-open-items.ts`,
`tests/unit/open-items.test.ts`, `tests/integration/derive-open-items.test.ts`
**Modify:** `lib/jobs/handlers/index.ts` (register), `lib/jobs/handlers/ledger-parse-chunk.ts`
(enqueue derivation on completion only)
**Do not touch:** `lib/ledger/parse-xlsx.ts`

## Implementation notes

Keep the grouping logic pure in `lib/ledger/open-items.ts` — `deriveOpenItems(entries)` in,
open-item candidates out — so the hard part is unit-testable without a database. The job
handler is a thin wrapper that loads, calls, and upserts.

1. **Group debit entries by `doc_code`.** One open item per distinct debit `doc_code` per
   client. The fixture has 103 distinct codes across 107 rows.
2. **Multi-passenger groups.** Four codes repeat with the amount present only on the first
   row (`DS26/2452`, `DS26/2453`, `DS26/2454`, `DS26/2472`). The group's gross is the
   **sum of non-null amounts in the group**, which for these four is the first row's value
   alone. Do not average, do not multiply by passenger count, and do not treat a null as
   zero-then-error. Record all passenger names on the item for reference.
   `DS26/2472` is the instructive case: ₹29,624 against a ₹14,576 fare, because the single
   figure covers both passengers. A per-passenger assumption produces double the real debt.
3. **Credit entries are not open items.** Rows with a negative amount (`DR`, `DZ`, `BR`
   prefixes) are credit notes and are allocated against existing items in T-015. Skip them
   here rather than creating negative open items.
4. **The opening balance** becomes exactly one open item: `source_doc_code = 'B/F'`,
   `gross_amount_paise = 513068700n`, `due_date = NULL`, `is_unaged = true`,
   `issue_date` = the import's `period_from`. It must never receive a computed due date.
   Fabricating one would make 77% of this client's balance look chaseable when it is not.
5. `issue_date` is the group's earliest `doc_date`. `source_reference` is the group's first
   non-null `reference` — used later to attach invoice PDFs.
6. **Idempotent upsert** on `(client_id, source_doc_code)`. Re-running after a later import
   that adds rows to an existing group must increase the gross, not create a duplicate, and
   must not disturb `receipts_applied_paise` or `credits_applied_paise` set by T-015/T-016.
   Only ever write the columns this task owns.
7. **Split point:** pure grouping and its unit tests first; the job handler, upsert and
   integration test second.
8. Write an `open_item.created` event per new item, and none on an unchanged re-run.

## Acceptance criteria
- [ ] `npm test -- tests/unit/open-items.test.ts` passes
- [ ] `npm test -- tests/integration/derive-open-items.test.ts` passes
- [ ] After importing the fixture and deriving, exactly **104** open items exist for Olectra
      (103 distinct debit doc codes + 1 for `B/F`)
- [ ] `SUM(gross_amount_paise)` across all open items equals `669766100n + ` the absolute
      value of total credits (`sum of the 9 negative rows`), asserted as an explicit equality
      with both figures written out in the test
- [ ] The `B/F` item has `gross_amount_paise = 513068700n`, `due_date IS NULL`,
      `is_unaged = true`
- [ ] The `DS26/2472` item has `gross_amount_paise = 2962400n` and lists 2 passenger names
- [ ] Each of `DS26/2452`, `DS26/2453`, `DS26/2454` produces exactly one open item
- [ ] No open item has `gross_amount_paise <= 0`
- [ ] Test proves running derivation twice produces 104 items both times and emits
      `open_item.created` events only on the first run
- [ ] Test proves derivation preserves a manually-set `receipts_applied_paise` on re-run
- [ ] `npm run check` exits 0

## Out of scope
Credit note allocation (T-015). Receipts (T-016). Due dates and aging (T-017) — leave
`due_date` null and `aging_bucket` at `unknown` for everything here. The UI (T-018).

## Commit
`feat(ledger): derive invoice-level open items with multi-passenger grouping`
