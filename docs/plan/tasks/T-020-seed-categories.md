# T-020 · Seed four categories with default policies

**Status:** not started
**Depends on:** T-019
**Size:** S
**Blocked by:** Q-05 unresolved — proceed on the interim assumption in DECISIONS.md

## Goal
A fresh database has four working categories, each with a complete cadence, persona and
threshold set, so every later task has something real to resolve against.

## Context to read first
- `docs/plan/DECISIONS.md` Q-05 — the interim category names
- `docs/recovery-system-plan.md` § Categories, cadence and tone — the illustrative cadence table
- `docs/plan/02-CONTRACTS.md` § Data model → Policy

## Files
**Create:** `supabase/seed.sql`, `tests/integration/seed.test.ts`
**Modify:** `package.json` (`db:seed` script)
**Do not touch:** `supabase/migrations/`

## Implementation notes
1. Four categories, each paired with `behaviour_band = 'unknown'` (D-11):
   `strategic`, `standard` (default), `watchlist`, `new`.
2. Cadence steps follow the illustrative table in the project plan. Every step needs a
   `template_key`; use stable keys like `reminder_first`, `reminder_second`,
   `escalation_ap_manager`, `escalation_final`. These keys become Meta template names later,
   so pick them as though they are permanent, because they will be.
3. Personas: `strategic` → `courteous`; `standard` and `new` → `neutral`;
   `watchlist` → `firm` **with `requires_human_approval = true`**, which the schema enforces.
4. Thresholds: start from the plan's guidance to calibrate against the real aging
   distribution. Since that distribution is not available yet (Q-05, step 5 of the plan's
   first actions), seed `amber_days = 30 / red_days = 60` for `standard` and note in the SQL
   comment that these are placeholders to be recalibrated, not chosen values.
5. Seeding must be idempotent — `on conflict (code) do nothing`. A seed that duplicates rows
   on second run makes `db reset` unreliable, and that command is used constantly.
6. Seed one client: Olectra, `OL000001`, `credit_terms_days = 30`, tier `strategic`. Seed two
   synthetic contacts with clearly fake numbers (`+919999900001`) so that if dry run ever
   flips to live by accident, no real person is messaged. Real contacts are Q-04.

## Acceptance criteria
- [ ] `npx supabase db reset` runs migrations then seed with no errors
- [ ] `npm test -- tests/integration/seed.test.ts` passes
- [ ] Test asserts exactly 4 categories, each with exactly 1 cadence policy, 1 persona and
      1 threshold set
- [ ] Test asserts every cadence policy has at least 3 steps with strictly increasing
      `offset_days_from_due`
- [ ] Test asserts exactly one category has `is_default = true`
- [ ] Test asserts the `watchlist` persona has `tone = 'firm'` and
      `requires_human_approval = true`
- [ ] Test asserts every seeded contact phone matches `+91999990....` (obviously synthetic)
- [ ] Running the seed twice leaves the same row counts
- [ ] `npm run check` exits 0

## Out of scope
The category UI (T-022). Real client contacts (Q-04, blocked). Real template wording (Q-07).

## Commit
`feat(db): seed default categories, policies and a test client`
