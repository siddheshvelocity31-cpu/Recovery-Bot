# T-016 · Receipts import and allocation

**Status:** not started
**Depends on:** T-013
**Size:** M
**Blocked by:** **Q-02 — the receipts export format is unknown. Do not start this task.**

## Goal
Payments received are recorded and allocated against open items, so an invoice can reach
`settled` and stop being chased.

## Context to read first
- `docs/plan/DECISIONS.md` Q-02 — read this first and confirm it is answered
- `docs/plan/02-CONTRACTS.md` § Data model → `receipt`, `allocation`
- `lib/ledger/allocate-credits.ts` from T-015 — mirror its allocation approach

## Files
**Create:** `lib/ledger/parse-receipts.ts`, `lib/ledger/allocate-receipts.ts`,
`app/(app)/receipts/page.tsx`, `components/receipts/manual-entry-form.tsx`,
`app/api/receipts/route.ts`, `tests/unit/allocate-receipts.test.ts`,
`tests/integration/receipts.test.ts`
**Modify:** `lib/jobs/handlers/index.ts` (register)
**Do not touch:** `lib/ledger/allocate-credits.ts`, `lib/ledger/open-items.ts`

## Why this is blocked

The sample ledger contains **zero** payments received — all nine negative rows are refunds
and credit notes. Nothing in the current import feed can ever mark an invoice as paid.

Until the real receipts format is known, this task would be built against a guessed CSV
shape and rebuilt afterwards. That is not progress. Meanwhile the manual entry form below
is the interim path, and it is genuinely useful on its own.

If Q-02 comes back as "the ERP cannot export receipts at all", **stop and escalate** — per
`docs/recovery-system-plan.md` § What would kill this project, that answer changes the
project rather than this task.

## Implementation notes
1. Build the **manual entry form first**. It is small, it unblocks the dry run, and it works
   regardless of what Q-02 returns.
2. Allocation default is oldest-open-item-first (FIFO) within a client, which matches how
   Indian corporate AP departments generally intend payment. Where the receipt carries an
   invoice reference, honour it over FIFO.
3. `receipt.unallocated_paise` tracks the remainder. An unallocated receipt is visible, not
   hidden — money received that the system cannot place is a reconciliation question for a
   human, not something to spread across invoices by guesswork.
4. `external_ref` is unique so a re-imported receipts file cannot double-credit a client.
5. Emit `open_item.settled` when a balance reaches zero, and re-evaluate any open case for
   that client immediately — a paid invoice must stop generating outreach on the same tick,
   not on the next nightly pass.

## Acceptance criteria
- [ ] Q-02 is answered and `DECISIONS.md` is updated with the real format before coding
- [ ] `npm test -- tests/unit/allocate-receipts.test.ts` passes
- [ ] `npm test -- tests/integration/receipts.test.ts` passes
- [ ] Test proves a receipt covering one invoice exactly sets it to `settled` with
      `open_amount_paise = 0`
- [ ] Test proves a partial receipt sets `part_paid` and leaves the correct remainder
- [ ] Test proves a receipt larger than all open items leaves a positive
      `unallocated_paise` and allocates nothing beyond the available balance
- [ ] Test proves a duplicate `external_ref` is rejected
- [ ] Test proves settling the last open item resolves the client's case
- [ ] `npm run check` exits 0

## Out of scope
Bank statement matching. Payment links. Automatic reconciliation against the bank —
all explicitly non-goals in `00-OVERVIEW.md`.

## Commit
`feat(receipts): add receipts entry and allocation against open items`
