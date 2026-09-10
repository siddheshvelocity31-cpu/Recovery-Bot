# T-019 · Migration: category, cadence, persona, thresholds, audit

**Status:** not started
**Depends on:** T-006
**Size:** M
**Blocked by:** —

## Goal
The policy tables exist with the constraints that make bad configuration impossible to save,
and `client` gains its category link.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § Data model → Policy; § Enums
- `docs/recovery-system-plan.md` § Categories, cadence and tone — the two-axis reasoning
- `docs/plan/DECISIONS.md` D-11 — why `behaviour_band` ships as `unknown`

## Files
**Create:** `supabase/migrations/0009_categories_and_policy.sql`,
`tests/integration/schema-policy.test.ts`
**Modify:** `lib/types/database.ts` (regenerate)
**Do not touch:** earlier migrations

## Implementation notes
1. Enums `channel`, `tone` first. `relationship_tier` and `behaviour_band` already exist
   from 0003 — do not redefine them.
2. Tables per contract: `category`, `cadence_policy`, `cadence_step`, `persona`,
   `threshold_set`, `setting_change`.
3. Add `client.category_id UUID REFERENCES category` and `client.tier_changed_at TIMESTAMPTZ`
   in this migration. `tier_changed_at` exists so the UI can show how stale a categorisation
   is — per the project plan's risk register, categories assigned once and never revisited is
   a high-likelihood failure, and showing the date is the cheapest possible mitigation.
4. Constraints that are worth enforcing in the database rather than trusting to the UI:
   - `category`: unique `(relationship_tier, behaviour_band)`; partial unique on `is_default`
     where true, so exactly one default can exist.
   - `cadence_policy.max_messages_per_week` between 0 and 7.
   - `cadence_step`: unique `(cadence_policy_id, step_number)`; `offset_days_from_due >= 0`.
   - `threshold_set`: `red_days > amber_days`.
   - `persona`: CHECK that `tone <> 'firm' OR requires_human_approval = true`. A firm tone
     that can fire unattended is a product decision the schema should refuse to represent.
5. RLS on, no policies. `set_updated_at()` on every table with `updated_at`.
6. Deleting a category must not orphan clients: `client.category_id` is
   `ON DELETE SET NULL`, and the application blocks deleting a category that has clients
   (T-022). Two layers, because either alone fails.

## Acceptance criteria
- [ ] `npx supabase db reset` applies 0009 cleanly
- [ ] `npm test -- tests/integration/schema-policy.test.ts` passes
- [ ] Test proves a second `is_default = true` category is rejected
- [ ] Test proves a duplicate `(relationship_tier, behaviour_band)` pair is rejected
- [ ] Test proves `threshold_set` with `red_days = 20, amber_days = 30` is rejected
- [ ] Test proves `persona` with `tone = 'firm'` and `requires_human_approval = false`
      is rejected
- [ ] Test proves `max_messages_per_week = 8` is rejected
- [ ] Test proves deleting a category sets dependent `client.category_id` to null and
      cascades its policy rows
- [ ] `npm run check` exits 0

## Out of scope
Seed data (T-020). Any UI (T-022, T-023, T-024). The resolver (T-021). Cases (T-025).

## Commit
`feat(db): add category, cadence, persona and threshold tables`
