# T-021 · Policy resolver as a pure function

**Status:** not started
**Depends on:** T-019
**Size:** M
**Blocked by:** —

## Goal
Given a client and a case, one function returns the cadence, persona and thresholds that
apply, following the documented resolution order with no ambiguity.

## Context to read first
- `docs/recovery-system-plan.md` § Categories, cadence and tone → the resolution-order diagram
- `docs/plan/02-CONTRACTS.md` § Data model → Policy
- `docs/plan/03-CONVENTIONS.md` § TypeScript

## Files
**Create:** `lib/policy/resolve.ts`, `lib/policy/types.ts`, `tests/unit/resolve.test.ts`
**Modify:** —
**Do not touch:** `lib/policy/rails.ts` (T-027), any `app/` file

## Implementation notes
1. `resolvePolicy(input: PolicyInput): ResolvedPolicy` is **pure**. It takes already-loaded
   data — client, category, cadence policy with steps, persona, thresholds, global config —
   and returns a resolved result. No database access, no clock. The caller loads; this
   function decides. That is what makes the resolution order testable in isolation, and the
   resolution order is the thing most likely to be subtly wrong.
2. Resolution order, and the rule that governs it: **narrower scopes may only make the
   system quieter, never louder.** Concretely, when a client-level override specifies a
   weekly cap above the global ceiling, the global ceiling wins; when it specifies a lower
   one, the client wins. Implement that as an explicit `min()` with a comment, not as an
   incidental property of the code.
3. A client with `category_id IS NULL` resolves to the default category. If no default
   exists, throw a typed error rather than returning a permissive fallback — no category
   must never mean maximum contact.
4. `ResolvedPolicy` carries a `resolution_trace: string[]` recording which scope supplied
   each value. When someone asks in three months why a client was messaged on a Tuesday,
   this field is the answer, and reconstructing it after the fact is impossible.
5. Return the next step given `current_step_number`, or `null` when the cadence is exhausted.
   Exhausted cadence means human escalation, not looping back to step 1.
6. No I/O means no mocking in the tests. Build `PolicyInput` fixtures as plain objects.

## Acceptance criteria
- [ ] `npm test -- tests/unit/resolve.test.ts` passes
- [ ] Test proves a client with no category resolves to the default category
- [ ] Test proves a missing default category throws a typed error rather than returning a
      permissive default
- [ ] Test proves a client cap of 1/week beats a category cap of 3/week
- [ ] Test proves a client cap of 5/week does **not** beat a global ceiling of 3/week
- [ ] Test proves `current_step_number` at the last step returns `null` for the next step
- [ ] Test proves `resolution_trace` names the scope that supplied the weekly cap
- [ ] `grep -n "supabase\|fetch\|Date.now\|new Date()" lib/policy/resolve.ts` returns nothing
- [ ] `npm run check` exits 0

## Out of scope
Rails enforcement (T-027). Loading the data (T-028). Rendering message bodies (T-029).
Simulation (T-030).

## Commit
`feat(policy): add pure policy resolver with resolution trace`
