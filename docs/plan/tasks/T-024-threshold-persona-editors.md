# T-024 · Threshold and persona editors

**Status:** not started
**Depends on:** T-022
**Size:** M
**Blocked by:** —

## Goal
An admin sets a category's aging thresholds, quiet hours, promise grace period and tone,
with the constraints from the contract enforced end to end.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § API surface → thresholds and persona;
  § Data model → `threshold_set`, `persona`
- `docs/recovery-system-plan.md` § Flags and alerts — why thresholds must be calibrated
- `components/settings/cadence-editor.tsx` from T-023 — match its form patterns

## Files
**Create:** `components/settings/threshold-editor.tsx`, `components/settings/persona-editor.tsx`,
`app/api/categories/[categoryId]/thresholds/route.ts`,
`app/api/categories/[categoryId]/persona/route.ts`,
`lib/validation/threshold.ts`, `lib/validation/persona.ts`,
`tests/integration/threshold-persona-api.test.ts`
**Modify:** `app/(app)/settings/categories/[categoryId]/page.tsx` (add two panels only)
**Do not touch:** `app/api/categories/[categoryId]/cadence/route.ts`

## Implementation notes
1. Threshold fields: `amber_days`, `red_days`, optional amount thresholds in rupees
   (converted to paise on the way in via `lib/money.ts`), `quiet_hours_start`/`_end`,
   `promise_grace_hours`, `silence_attempts`.
2. **Show the real distribution next to the inputs.** Render, for the clients currently in
   this category, how many open items and how much value would land in amber and red at the
   entered thresholds. Per the project plan, thresholds picked as round numbers rather than
   from the actual aging curve are what produce an all-red board that everyone learns to
   ignore. This preview is the cheapest possible defence and it belongs here, not in a
   later "polish" task.
3. Persona fields: tone, salutation, language, signature, voice script style,
   `requires_human_approval`. Setting `tone = 'firm'` **forces** `requires_human_approval`
   to true in the UI and is rejected server-side otherwise, matching the schema CHECK.
   Explain why in helper text rather than just disabling the toggle — a rule the user
   understands is a rule they stop fighting.
4. Quiet hours cross midnight by default (19:00–10:00). The input must accept that and the
   help text must state it plainly, since a naive reading of "start after end" looks invalid.
5. Amount thresholds are entered in rupees and stored in paise. Round-trip them in a test —
   this boundary is where a factor-of-100 bug would be least visible and most expensive.
6. Both routes require a `reason` and call `recordChange()`, exactly as T-023 does.

## Acceptance criteria
- [ ] `npm test -- tests/integration/threshold-persona-api.test.ts` passes
- [ ] Test proves `red_days <= amber_days` returns 400 before reaching the database
- [ ] Test proves `tone = 'firm'` with `requires_human_approval = false` returns 400
- [ ] Test proves quiet hours 19:00–10:00 save successfully
- [ ] Test proves entering `50,000` rupees stores `5000000n` paise and renders back as
      `₹50,000.00`
- [ ] Test proves both routes reject a request with no `reason`
- [ ] Test proves both routes write a `setting_change` with old and new values
- [ ] Manual: change `standard` thresholds and observe the impact preview counts update
- [ ] `npm run check` exits 0

## Out of scope
The cadence editor (T-023). Flag evaluation against these thresholds (T-031). Template
bodies (Q-07). Multi-language personas (later).

## Commit
`feat(settings): add threshold and persona editors with impact preview`
