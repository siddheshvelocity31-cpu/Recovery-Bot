# T-031 · Flag engine: six rules with dedupe and nightly evaluation

**Status:** not started
**Depends on:** T-017, T-019
**Size:** M
**Blocked by:** —

## Goal
Threshold breaches raise flags with human-readable messages, re-evaluation does not
duplicate live flags, and the unaged brought-forward balance gets its own honest treatment.

## Context to read first
- `docs/recovery-system-plan.md` § Flags and alerts — the rule table and the four design rules
- `docs/plan/02-CONTRACTS.md` § Data model → `flag`; § Enums → `flag_rule`, `flag_severity`
- `lib/ledger/aging.ts` from T-017

## Files
**Create:** `supabase/migrations/0011_flags.sql`, `lib/flags/rules.ts`, `lib/flags/evaluate.ts`,
`lib/jobs/handlers/flags-evaluate.ts`, `tests/unit/flag-rules.test.ts`,
`tests/integration/flags.test.ts`
**Modify:** `lib/jobs/handlers/index.ts` (register),
`lib/jobs/handlers/aging-recompute.ts` (enqueue flag evaluation after aging only)
**Do not touch:** `lib/ledger/aging.ts`, `lib/policy/rails.ts`

## Implementation notes
1. Keep rule evaluation pure in `lib/flags/rules.ts`: given a client's open items, thresholds,
   outreach history and commitments plus an injected `now`, return candidate flags. The job
   handler persists them.
2. The six rules, per the plan:
   - `aged_debt` — an open item older than `red_days` / `amber_days`. Message must read
     naturally: *"Pending debt from the past 3 months — ₹12,40,000 across 4 invoices"*.
     Derive the month count from the oldest item, rounded down, and never say "0 months".
   - `amount_exposure` — total open above the category's amount threshold.
   - `broken_promise` — a confirmed commitment past `due_at + promise_grace_hours` with the
     balance unchanged. Supported now; no commitments exist until the later phase.
   - `silence` — `silence_attempts` consecutive outreach with no reply.
   - `adverse_trajectory` — balance grew while nothing was received in the window.
   - `unaged_balance` — severity **`grey`**, raised for any `is_unaged` open item.
3. **`unaged_balance` is not an aging flag.** It must never be red or amber, and `aged_debt`
   must skip `is_unaged` items entirely. For Olectra that is ₹51,30,687 — 77% of the balance —
   and colouring it red would put the largest, least actionable number at the top of the
   board permanently. Its message directs to a data task: *"Unaged balance, invoice-level
   breakdown required from the source system."*
4. `dedupe_key` is `{client_id}:{rule}:{open_item_id ?? 'client'}`, with the partial unique
   index from the contract on unresolved flags. Re-evaluating nightly must not stack copies.
5. **Auto-resolve.** When a rule no longer fires and a live flag exists for that dedupe key,
   set `resolved_at` and write `flag.resolved`. A board that only ever grows is a board
   people stop reading.
6. Respect `ack_until`: an acknowledged flag stays acknowledged until the timestamp passes,
   then becomes live again rather than silently disappearing.
7. Emit `flag.raised` and `flag.resolved` events so flags appear on the client trail
   alongside everything else.

## Acceptance criteria
- [ ] `npx supabase db reset` applies 0011 cleanly
- [ ] `npm test -- tests/unit/flag-rules.test.ts` passes
- [ ] `npm test -- tests/integration/flags.test.ts` passes
- [ ] Test proves the `B/F` item raises exactly one `unaged_balance` flag with
      severity `grey`, and raises **no** `aged_debt` flag
- [ ] Test proves `aged_debt` message text for an item 95 days overdue reads
      "past 3 months" and includes the formatted amount
- [ ] Test proves an item 20 days overdue with `amber_days = 30` raises nothing
- [ ] Test proves running evaluation three times leaves exactly one live flag per dedupe key
- [ ] Test proves a flag auto-resolves when its condition clears, with a `flag.resolved` event
- [ ] Test proves an acknowledged flag with a past `ack_until` becomes live again
- [ ] `grep -n "Date.now\|new Date()" lib/flags/rules.ts` returns nothing
- [ ] `npm run check` exits 0

## Out of scope
The alert board UI (T-032). Digest emails (T-033). Suppressing outreach based on flags —
rails handles suppression and the two are deliberately separate.

## Commit
`feat(flags): add threshold flag engine with dedupe and auto-resolve`
