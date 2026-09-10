# T-007 · XLSX parser as a pure function, tested against the real fixture

**Status:** not started
**Depends on:** T-003
**Size:** L — split at the seam in note 8 if it runs long
**Blocked by:** —

## Goal
A pure function turns the real ledger spreadsheet into validated typed rows plus a parsed
header, with every quirk of the actual file handled and asserted.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § Money, § Dates and time, § Data model → `ledger_entry`
- `tests/fixtures/Olectra_Client_Ledger_Report.xlsx` — open it and look before coding
- `lib/money.ts`, `lib/dates.ts` from T-003

## Files
**Create:** `lib/ledger/parse-xlsx.ts`, `lib/ledger/natural-key.ts`,
`lib/validation/ledger-row.ts`, `tests/unit/parse-xlsx.test.ts`
**Modify:** —
**Do not touch:** anything under `app/`, `supabase/`, `lib/supabase/`

## Implementation notes

No database access in this task. `parseLedgerWorkbook(buffer): ParsedLedger` is pure, which
is what makes it testable against the fixture without a running Supabase.

1. **Header block.** Rows 1–8 of the sheet are a header, and the column header row is at
   sheet row 9 (zero-based index 8). Do not hardcode row 9 blindly — locate the row whose
   first cell trims to `Doc Date` and treat everything above it as the header block, so a
   slightly different export does not silently shift every column.
2. **Extract from the header block:** `client_code` and `client_name` from
   `Client OLECTRA GREENTECH LIMITED [OL000001]` — the code is inside the square brackets;
   and `period_from` / `period_to` from `Ledger Statement From 17/08/2026  to  28/08/2026`,
   which uses `DD/MM/YYYY` and irregular internal whitespace. Both must be regex-extracted
   tolerantly, and a failure to find them is a parse error, not a null.
3. **Columns.** 30 columns. Match them by normalised header text (collapse repeated spaces,
   lowercase) rather than by position. The real headers contain doubled spaces —
   `Doc  Date`, `Pax  Name`, `Bill  Amount`, `Serv  Charges`. Position-matching works today
   and breaks the first time the source system adds a column.
4. **Row classification.** Three kinds:
   - `opening` — the row whose `Code` trims to `B/F`. Exactly one.
   - `total` — the trailing row where `Code` is null. Exactly one. Capture its
     `Bill Amount` as the stated closing balance and then **exclude it from entries**.
   - `debit` / `credit` — everything else, classified by the sign of `Bill Amount`, and
     for null-amount rows by defaulting to `debit`.
5. **Dates.** `Doc Date` and `Travel Date` are Excel serials under date formats. ExcelJS
   returns `Date` objects for these; where it returns a number, route it through
   `excelSerialToDate`. Serial `46251` is `2026-08-17`.
6. **Money.** Every amount goes through `parseRupeesToPaise`. `Bill Amount` is nullable and
   a null must stay null — the four continuation rows for `DS26/2452`, `DS26/2453`,
   `DS26/2454` and `DS26/2472` carry a passenger with no amount because the amount sits on
   the first row of the group. Substituting zero would be wrong but invisible.
7. **Natural key** per contract § Data model: `sha256` over
   `client_code | doc_code | doc_date_iso | row_number | bill_amount_paise`. `row_number` is
   the 1-based index among entry rows and is included precisely because doc codes repeat.
8. **Split point if this runs long:** header/metadata parsing and column mapping is one
   task; row classification and typed row emission is the second. The seam is the
   `ParsedLedger` type — define it first and both halves can be written against it.
9. Preserve the entire original row as a `Record<string, unknown>` for `raw_row`. Storage is
   cheap; being unable to answer "what did the file actually say" during a client dispute
   is not.

## Acceptance criteria
- [ ] `npm test -- tests/unit/parse-xlsx.test.ts` passes
- [ ] Parsing the fixture yields exactly **107 entry rows**, excluding B/F and the totals row
- [ ] `client_code` is `"OL000001"` and `client_name` is `"OLECTRA GREENTECH LIMITED"`
- [ ] `period_from` is `2026-08-17` and `period_to` is `2026-08-28`
- [ ] `opening_balance_paise` is `513068700n`
- [ ] `stated_closing_balance_paise` is `669766100n`
- [ ] Sum of the 107 entries' `bill_amount_paise` is `156697400n`, and
      `opening + sum === stated_closing` asserted as a single equality
- [ ] Exactly 9 entries have a negative `bill_amount_paise`
- [ ] Exactly 4 entries have `bill_amount_paise === null`
- [ ] 103 distinct `doc_code` values across the 107 rows
- [ ] The first entry's `doc_date` is `2026-08-17` and its `doc_code` is `"DW26/304705"`
- [ ] All 107 `natural_key` values are distinct
- [ ] Parsing the same buffer twice produces identical natural keys
- [ ] `npm run check` exits 0

## Out of scope
Database writes (T-010). Deriving open items (T-014). Receipts (T-016). Any other
spreadsheet layout — this parser targets this report format only, and a different one is a
new task, not a flag on this function.

## Commit
`feat(ledger): add xlsx parser with fixture-verified reconciliation`
