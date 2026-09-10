# T-023 · Cadence editor with validation

**Status:** not started
**Depends on:** T-022
**Size:** M
**Blocked by:** —

## Goal
An admin edits a category's contact sequence and weekly cap in the UI, with invalid
sequences rejected before they can be saved.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § API surface → `PUT /api/categories/:id/cadence`;
  § Data model → `cadence_policy`, `cadence_step`
- `lib/audit/record-change.ts` from T-022
- `docs/recovery-system-plan.md` § Categories, cadence and tone — the cadence table

## Files
**Create:** `app/(app)/settings/categories/[categoryId]/page.tsx`,
`components/settings/cadence-editor.tsx`,
`app/api/categories/[categoryId]/cadence/route.ts`, `lib/validation/cadence.ts`
`tests/integration/cadence-api.test.ts`
**Modify:** `components/settings/category-list.tsx` (link to the detail page only)
**Do not touch:** `lib/policy/resolve.ts`, `app/api/categories/route.ts`

## Implementation notes
1. The editor is a step list: step number, channel, days after due, template key, escalation
   level. Add, remove, reorder. Removing a step renumbers the rest — do not leave gaps, since
   `resolve.ts` walks `current_step_number` sequentially.
2. Validation in zod **and** re-checked server-side (the UI is not a security boundary):
   - at least one step
   - `offset_days_from_due` strictly increasing with `step_number`
   - `max_messages_per_week` between 0 and 7
   - no two steps on the same channel on the same day
   - `channel = 'human'` steps carry no template requirement
3. `PUT` replaces the whole step set in one transaction via an rpc, rather than issuing
   per-step inserts and deletes. A partially-applied cadence is a live client-facing
   configuration, and there is no safe intermediate state.
4. Saving requires a `reason` and writes a `setting_change` capturing the full old and new
   step sets as JSON. That diff is what answers "why did volume triple on Tuesday".
5. **A save is not final without the simulator.** T-030 adds a mandatory preview step before
   commit. Until then, the save button shows a warning that simulation is not yet wired.
   Do not quietly ship a cadence editor with no preview and consider the feature done.
6. `max_messages_per_week = 0` is legitimate — it means this category is configured but
   dormant. Do not treat it as invalid.

## Acceptance criteria
- [ ] `npm test -- tests/integration/cadence-api.test.ts` passes
- [ ] Test proves steps with non-increasing offsets (5, 3) return 400 with a message naming
      the offending step
- [ ] Test proves `max_messages_per_week = 9` returns 400
- [ ] Test proves two steps on `whatsapp` at the same offset return 400
- [ ] Test proves `max_messages_per_week = 0` saves successfully
- [ ] Test proves a save with no `reason` returns 400
- [ ] Test proves a failed save leaves the previous step set completely intact (assert the
      full step list is unchanged after a rejected request)
- [ ] Test proves a successful save writes one `setting_change` containing both old and new
      step arrays
- [ ] `npm run check` exits 0

## Out of scope
The simulator (T-030). Thresholds and persona (T-024). Template body editing (Q-07).
Per-client cadence overrides (later).

## Commit
`feat(settings): add cadence editor with sequence validation`
