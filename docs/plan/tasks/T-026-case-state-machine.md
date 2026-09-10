# T-026 · Case state machine as a pure function

**Status:** not started
**Depends on:** T-025, T-021
**Size:** M
**Blocked by:** —

## Goal
Case transitions are decided by one pure function with an explicit, tested transition table,
so no other code can invent a state change.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § Enums → `case_status`; § Data model → `recovery_case`
- `lib/policy/resolve.ts` from T-021 — the resolved policy this consumes
- `docs/plan/03-CONVENTIONS.md` § TypeScript

## Files
**Create:** `lib/cases/state-machine.ts`, `lib/cases/transitions.ts`,
`tests/unit/state-machine.test.ts`
**Modify:** —
**Do not touch:** `lib/policy/resolve.ts`, `lib/policy/rails.ts`

## Implementation notes
1. `decideTransition(input): Transition` is pure: current case, resolved policy, open-item
   totals, and an **injected `now`**. It returns the next status, the next
   `current_step_number`, the next `next_action_at`, and a reason string. It performs no
   writes and reads no clock.
2. Declare the legal transitions as an explicit table in `transitions.ts` and validate every
   proposed transition against it. An illegal transition throws. Without a table, a state
   machine becomes a pile of conditionals that nobody can reason about by month three, and
   this one decides whether clients get messaged.
3. Statuses and what drives them:
   - `open` → `awaiting_reply` after a step is dispatched
   - `awaiting_reply` → `open` when the next step's time arrives with no reply
   - any → `promise_active` when a confirmed commitment exists (later phase writes these;
     support the transition now)
   - `promise_active` → `open` when the promise passes `due_at` plus `promise_grace_hours`
     with the balance unchanged
   - any → `suppressed` when the client is muted, the item is disputed, or a credit note is
     pending
   - `open` → `escalated` when the cadence is exhausted
   - any → `resolved` when total open reaches zero
4. **`resolved` wins over everything.** Check it first. A client who has paid must never be
   advanced, escalated or messaged, regardless of what any other rule says.
5. `next_action_at` comes from the resolved policy's next step offset applied to the driving
   open item's `due_date`, evaluated in `BUSINESS_TZ`. Items with a null due date (the `B/F`
   balance) cannot drive a schedule — exclude them and, if they are the only open items,
   return `escalated` with a reason naming the unaged balance. That is honest: the money is
   owed, but the system has no basis for a timed cadence against it.
6. Every returned transition carries a human-readable `reason` that lands in the trail.

## Acceptance criteria
- [ ] `npm test -- tests/unit/state-machine.test.ts` passes
- [ ] A test exists for every row of the transition table, plus at least four illegal
      transitions asserting a throw
- [ ] Test proves zero total open returns `resolved` even when a mute, a dispute and an
      exhausted cadence all apply simultaneously
- [ ] Test proves a client whose only open item is the unaged `B/F` returns `escalated`
      with a reason mentioning the unaged balance, and never a scheduled `next_action_at`
- [ ] Test proves a `promise_active` case within its grace period does not advance
- [ ] Test proves a `promise_active` case past `due_at + promise_grace_hours` returns `open`
- [ ] `grep -n "Date.now\|new Date()\|supabase" lib/cases/state-machine.ts` returns nothing
- [ ] `npm run check` exits 0

## Out of scope
Persisting transitions (T-028). Rails (T-027). Extracting commitments — later phase.
Escalation notifications to staff (T-033).

## Commit
`feat(cases): add pure case state machine with explicit transition table`
