# T-003 · Enums and shared utilities: money, dates, errors, logger

**Status:** not started
**Depends on:** T-002
**Size:** M
**Blocked by:** —

## Goal
The primitives every later task depends on exist and are tested: exact money arithmetic,
timezone-correct date handling, one error envelope, one logger, and the enum vocabulary.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § Money, § Dates and time, § Enums, § Response envelope
- `docs/plan/03-CONVENTIONS.md` § TypeScript, § Logging

## Files
**Create:** `lib/money.ts`, `lib/dates.ts`, `lib/errors.ts`, `lib/logger.ts`,
`lib/types/enums.ts`, `tests/unit/money.test.ts`, `tests/unit/dates.test.ts`,
`tests/unit/errors.test.ts`
**Modify:** —
**Do not touch:** `lib/supabase/`, `lib/types/database.ts`

## Implementation notes
1. `lib/money.ts` exports `parseRupeesToPaise`, `formatPaise`, `sumPaise`, `paiseToString`.
   All arithmetic on `bigint`. `parseRupeesToPaise` accepts `"10,625.00"`, `"-7140"`,
   `10625`, `""` → null, and rounds half-up at two decimals. Reject `NaN` and `Infinity`
   by throwing, never by returning zero — a silent zero in a receivables system is a
   corrupted balance nobody notices.
2. `formatPaise` uses Indian digit grouping: 6697661_00 paise → `"₹66,97,661.00"`.
   Use `Intl.NumberFormat('en-IN')`, and test the lakh/crore grouping explicitly because
   it differs from the Western thousands grouping.
3. `lib/dates.ts` exports `BUSINESS_TZ = 'Asia/Kolkata'`, `toBusinessDate(instant)`,
   `businessStartOfDay(date)`, `addBusinessDays(date, n)` (calendar days for now, not
   working days — note it), `isWithinQuietHours(instant, start, end)`, and
   `excelSerialToDate(serial)`.
4. `isWithinQuietHours` must handle a window that crosses midnight (`19:00`–`10:00`).
   Test that case directly; it is the common one and the one naive implementations fail.
5. `excelSerialToDate` uses the 1900 date system including the Lotus leap-year bug.
   Assert `46251 → 2026-08-17` and `46261 → 2026-08-27`, taken from the fixture.
6. `lib/errors.ts` exports the `ErrorCode` union, `ok()`, `fail()`, and an `AppError`
   class carrying a code. `fail()` returns a `NextResponse` with the mapped status.
7. `lib/types/enums.ts` declares each enum from the contract as a `const` object plus a
   derived union type. Values must match the SQL enum strings character for character —
   a mismatch here fails at runtime in Postgres, not at compile time.

## Acceptance criteria
- [ ] `npm test -- tests/unit/money.test.ts` passes
- [ ] Money tests cover: `"1660301.37"` → `166030137n`, negative values, comma-grouped
      input, empty string → null, `NaN` throws, and `formatPaise(669766100n)` → `"₹66,97,661.00"`
- [ ] Date tests cover: both Excel serials above, a quiet-hours window crossing midnight
      returning true at 23:00 IST and false at 12:00 IST
- [ ] `npm run check` exits 0
- [ ] `grep -n "parseFloat\|Number(" lib/money.ts` returns no line used for arithmetic
- [ ] Every enum value in `lib/types/enums.ts` appears verbatim in `02-CONTRACTS.md` § Enums

## Out of scope
Database enum types (created with their tables). Zod schemas (T-009 onward, per resource).
Currency other than INR.

## Commit
`feat(lib): add money, date, error and logging primitives`
