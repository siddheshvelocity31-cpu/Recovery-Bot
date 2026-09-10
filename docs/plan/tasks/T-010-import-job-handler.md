# T-010 · Import job handler: chunked parse and insert

**Status:** not started
**Depends on:** T-007, T-009
**Size:** M
**Blocked by:** —

## Goal
The queued parse job reads the stored file, inserts ledger entries in bounded chunks across
successive ticks, reconciles the totals, and marks the import complete or failed.

## Context to read first
- `docs/plan/01-ARCHITECTURE.md` § 2 — why this is chunked
- `lib/ledger/parse-xlsx.ts` from T-007 — the shape it returns
- `lib/jobs/queue.ts` from T-008 — enqueue and completion semantics
- `docs/plan/02-CONTRACTS.md` § Data model → `ledger_entry`, `ledger_import`

## Files
**Create:** `lib/jobs/handlers/ledger-parse-chunk.ts`, `tests/integration/import-handler.test.ts`
**Modify:** `lib/jobs/handlers/index.ts` (register the handler only)
**Do not touch:** `lib/ledger/parse-xlsx.ts`, `app/api/imports/`

## Implementation notes
1. The handler receives `{import_id, cursor}`. It downloads the object, parses the whole
   workbook (parsing is fast; inserting is what needs bounding), and inserts rows
   `cursor` through `cursor + CHUNK_SIZE`. `CHUNK_SIZE` is 500, configurable, sized against
   the observed function timeout from T-005 (Q-03).
2. If rows remain, update `ledger_import.cursor_row` and re-enqueue the same kind with the
   new cursor. Each pass must leave the import in a consistent, resumable state.
3. Insert with `ON CONFLICT (natural_key) DO NOTHING` and count actual insertions from the
   returned rows. This is what makes a retried chunk harmless (D-04). Do not pre-check for
   existence with a select — that races.
4. Rows failing zod validation go to `ledger_entry_rejected` with a reason and do not abort
   the import. A single malformed row must not block 106 valid ones, but the count must be
   visible on the import screen.
5. **Reconciliation on the final chunk.** Compute `opening + SUM(bill_amount_paise)` from
   the database, compare against the parsed `stated_closing_balance_paise`, and on mismatch
   set status `failed` with an error naming both figures. Do not mark an unreconciled import
   as `imported` — an import that silently disagrees with its own totals row is the exact
   input that later produces a wrong number in front of a client.
6. Store the opening balance as a `ledger_entry` with `entry_type='opening'`, so the trail
   and any balance query see one uniform table. It gets an open item in T-014 flagged unaged.
7. On success write an `event` of type `ledger.imported` with the row counts and both
   balances in the payload.
8. Wrap per-chunk work so a thrown error marks the job failed with a message rather than
   leaving the import stuck in `parsing` forever.

## Acceptance criteria
- [ ] `npm test -- tests/integration/import-handler.test.ts` passes
- [ ] End-to-end test: enqueue the fixture, run ticks until the queue drains, then assert
      exactly **108** `ledger_entry` rows for the client (107 transactions + 1 opening)
- [ ] Assert `ledger_import.status = 'imported'`, `row_count_imported = 107`,
      `opening_balance_paise = 513068700n`, `closing_balance_paise = 669766100n`
- [ ] Assert `SUM(bill_amount_paise) WHERE entry_type != 'opening'` equals `156697400n`
- [ ] Test proves re-running the completed job inserts 0 additional rows
- [ ] Test proves a chunk size of 10 produces the same final state as a chunk size of 500
- [ ] Test proves a deliberately corrupted totals row sets status `failed` with both
      figures in `error_message`, and does not set `imported`
- [ ] Exactly one `event` row of type `ledger.imported` exists after a successful import
- [ ] `npm run check` exits 0

## Out of scope
Open items (T-014). Aging (T-017). Cases (T-026). The UI for viewing entries (T-012).

## Commit
`feat(ledger): add chunked import job handler with reconciliation`
