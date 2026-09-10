# T-030 · Cadence simulator

**Status:** not started
**Depends on:** T-021, T-029
**Size:** M
**Blocked by:** —

## Goal
Before a cadence or threshold change is saved, the admin sees what it would have done
against the last 30 days of real data, and cannot save without looking.

## Context to read first
- `docs/recovery-system-plan.md` § Dashboard screens → item 4, and why this is non-negotiable
- `docs/plan/02-CONTRACTS.md` § Simulation result shape; § API surface → `/simulate`
- `lib/policy/resolve.ts`, `lib/policy/rails.ts` — reuse both, unchanged
- `components/settings/cadence-editor.tsx` from T-023

## Files
**Create:** `lib/policy/simulate.ts`, `app/api/categories/[categoryId]/simulate/route.ts`,
`components/settings/simulation-panel.tsx`, `tests/unit/simulate.test.ts`,
`tests/integration/simulate-api.test.ts`
**Modify:** `components/settings/cadence-editor.tsx` (gate the save behind simulation),
`components/settings/threshold-editor.tsx` (same)
**Do not touch:** `lib/policy/resolve.ts`, `lib/policy/rails.ts`, `lib/cases/evaluate.ts`

## Implementation notes
1. `simulate(input): SimulationResult` is pure. It replays the resolver, the state machine
   and the rails over historical open-item and outreach data for the clients in a category,
   under both the current and the proposed policy, and counts what each would produce.
   **It reuses the real functions.** A simulator with its own copy of the logic tells you
   what a different system would have done, which is worse than useless.
2. Never write anything. No jobs, no outreach rows, no events. This is a read-only
   projection and it must be impossible for it to leave a trace.
3. Report the shape in the contract: current versus proposed message counts, per channel,
   affected client count, delta, and a per-client breakdown. Sort the breakdown by the
   largest increase, because that is the number that matters.
4. Populate `warnings[]` for anything alarming, at minimum: the proposal exceeds the global
   weekly ceiling for N clients; the proposal more than doubles total volume; a strategic-tier
   client's volume increases. The plan's named failure is someone typing a unit wrong, and a
   warning that says "this triples volume for 41 clients" is what catches it.
5. **Gate the save.** The cadence and threshold editors call `/simulate` on change and
   disable the save button until a simulation for the current form state has been returned
   and displayed. If the window has no data (a new category with no clients), say so
   explicitly and allow the save — an empty simulation is a valid result, not a failure.
6. Bound the simulation window at 30 days by default, and cap the client count it will
   process so an admin cannot accidentally trigger an enormous computation in a request.

## Acceptance criteria
- [ ] `npm test -- tests/unit/simulate.test.ts` passes
- [ ] `npm test -- tests/integration/simulate-api.test.ts` passes
- [ ] Test proves halving every cadence offset increases the projected message count and
      that the delta is reported correctly
- [ ] Test proves a proposal exceeding the global weekly cap produces a warning naming the
      affected client count
- [ ] Test proves simulation writes **nothing**: assert row counts for `outreach`, `event`
      and `job` are identical before and after
- [ ] Test proves a category with no clients returns a zeroed result with an explanatory
      warning rather than an error
- [ ] Manual: edit `standard` cadence offsets, observe the panel update, confirm the save
      button is disabled until the simulation returns
- [ ] `npm run check` exits 0

## Out of scope
Simulating live sends or costs (later, once real provider pricing is known). Historical
what-if reporting as a standalone screen. Scheduling simulations.

## Commit
`feat(policy): add cadence simulator gating policy saves`
