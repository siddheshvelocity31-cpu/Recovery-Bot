# T-027 · Rails engine as a pure function

**Status:** not started
**Depends on:** T-021, T-025
**Size:** M
**Blocked by:** —

## Goal
One function decides whether a message may be sent, and it is the only gate in the codebase.
Every block is returned with a reason.

## Context to read first
- `docs/recovery-system-plan.md` § Categories, cadence and tone → the resolution diagram;
  § Operating plan → safety rails
- `lib/policy/resolve.ts` from T-021, `lib/dates.ts` from T-003
- `CLAUDE.md` § Non-negotiables

## Files
**Create:** `lib/policy/rails.ts`, `lib/policy/rails-types.ts`, `tests/unit/rails.test.ts`
**Modify:** —
**Do not touch:** `lib/policy/resolve.ts`, `lib/cases/state-machine.ts`

## Implementation notes
1. `checkRails(input): RailsResult` is pure, with an injected `now`. Returns either
   `{allowed: true}` or `{allowed: false, reason, rule}`. No I/O, no clock.
2. The checks, evaluated in this order, **stopping at the first block**:
   1. global kill switch enabled
   2. client `is_muted` and `muted_until` in the future
   3. case `suppressed_until` in the future
   4. any driving open item is `disputed`
   5. total open amount is zero or negative
   6. weekly message count for this client already at the resolved cap
   7. `now` falls inside quiet hours for the resolved thresholds
   8. the target contact lacks opt-in for this channel
   9. the target contact lacks the required field for the channel (`phone_e164` for
      WhatsApp and voice, `email` for email)
   10. persona `requires_human_approval` and no approval is recorded
3. Ordering matters for the reason string, not just the outcome. A muted client blocked
   for "quiet hours" produces a misleading trail entry and sends someone investigating the
   wrong thing.
4. The weekly count is passed in as a number, computed by the caller. Keep the counting
   query out of this function so it stays pure and so the counting logic is testable
   separately.
5. Quiet hours use `isWithinQuietHours` from `lib/dates.ts` and must handle the
   midnight-crossing window. Test 23:30 IST and 02:00 IST against a 19:00–10:00 window.
6. **There is exactly one rails function and every send path calls it.** If a second gate
   ever appears, one of them will drift and the other will be the one that matters. Add a
   comment at the top of the file saying so.

## Acceptance criteria
- [ ] `npm test -- tests/unit/rails.test.ts` passes
- [ ] A test exists for each of the ten rules blocking in isolation
- [ ] Test proves that when a mute and a quiet-hours violation both apply, the returned
      `rule` is the mute — asserting the ordering, not just the block
- [ ] Test proves 23:30 IST and 02:00 IST are both blocked by a 19:00–10:00 window, and
      12:00 IST is allowed
- [ ] Test proves a contact without `whatsapp_opt_in` is blocked for `whatsapp` but allowed
      for `email` when `email_opt_in` is true
- [ ] Test proves zero total open is blocked
- [ ] Test proves an allowed case returns `{allowed: true}` with all ten inputs benign
- [ ] `grep -n "Date.now\|new Date()\|supabase\|fetch" lib/policy/rails.ts` returns nothing
- [ ] `npm run check` exits 0

## Out of scope
Applying the result (T-028). Counting weekly messages (T-028). The kill switch UI (T-033).
Human approval workflow — later phase; this task only reads the flag.

## Commit
`feat(policy): add pure rails engine with ordered blocking rules`
