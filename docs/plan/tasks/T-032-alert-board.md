# T-032 · Alert board home page and acknowledge flow

**Status:** not started
**Depends on:** T-031
**Size:** M
**Blocked by:** —

## Goal
The home page is the alert board: red flags first, each acknowledgeable with a reason, with a
warning when the thresholds are obviously miscalibrated.

## Context to read first
- `docs/recovery-system-plan.md` § Flags and alerts — no modals, acknowledge ≠ resolve,
  cap the reds
- `docs/plan/02-CONTRACTS.md` § API surface → `/api/flags`, `/api/flags/:id/acknowledge`
- `app/(app)/page.tsx` from T-001 — this replaces the placeholder

## Files
**Create:** `components/flags/alert-board.tsx`, `components/flags/flag-row.tsx`,
`components/flags/acknowledge-dialog.tsx`, `components/flags/client-flag-banner.tsx`,
`app/api/flags/route.ts`, `app/api/flags/[flagId]/acknowledge/route.ts`,
`lib/validation/flag.ts`, `tests/integration/flags-api.test.ts`
**Modify:** `app/(app)/page.tsx` (replace the placeholder),
`components/clients/balance-header.tsx` (add the flag banner)
**Do not touch:** `lib/flags/rules.ts`, `lib/flags/evaluate.ts`

## Implementation notes
1. **No modal popups for the alerts themselves.** The plan is explicit about this and the
   reason is that a modal gets dismissed reflexively and leaves no record anyone saw it.
   Alerts appear as a persistent board and as a persistent banner on the client page. The
   only dialog in this task is the acknowledge form, which is a deliberate user action.
2. Board order: red, then amber, then grey, each by `raised_at` descending. Acknowledged
   flags are collapsed into a separate section, not hidden — hidden is how an acknowledged
   flag that never resolves gets forgotten.
3. **Miscalibration warning.** When more than 10 live red flags exist, show a banner at the
   top of the board saying the thresholds may need recalibrating and linking to category
   settings. Per the plan, an entirely red board carries exactly as much information as an
   entirely white one, and the system should say so rather than let people learn to ignore it.
4. Acknowledging requires a `reason` and an `ack_until`, both mandatory. Offer 1 day, 1 week
   and 1 month presets plus a custom date. Write `flag.acknowledged` to the trail with the
   reason.
5. Acknowledge is available to `collector` and above. It never sets `resolved_at` — only the
   flag engine resolves, when the underlying condition clears. Make that distinction visible
   in the UI wording ("Snooze until…" reads more honestly than "Resolve").
6. Each flag row links to the client and, where applicable, straight to the specific open item.
7. Empty state is a good state here: say "no active alerts" clearly rather than rendering a
   blank panel that looks like a failed query.

## Acceptance criteria
- [ ] `npm test -- tests/integration/flags-api.test.ts` passes
- [ ] Test proves `GET /api/flags?severity=red` filters correctly and excludes resolved flags
- [ ] Test proves acknowledging without a `reason` returns 400
- [ ] Test proves acknowledging sets `acknowledged_by`, `acknowledged_at`, `ack_reason` and
      `ack_until`, and leaves `resolved_at` null
- [ ] Test proves a `viewer` calling acknowledge returns 403
- [ ] Test proves one `flag.acknowledged` event is written with the reason
- [ ] Manual: seed 11 red flags and confirm the miscalibration banner appears; resolve one
      and confirm it disappears
- [ ] Manual: the grey `unaged_balance` flag for Olectra appears in the grey section, not
      among the reds
- [ ] `npm run check` exits 0

## Out of scope
Daily digest email (T-033). Flag rule configuration UI — thresholds live in T-024.
Assigning flags to owners (later; `assigned_collector_id` on the client is the current answer).

## Commit
`feat(flags): add alert board home page with acknowledge flow`
