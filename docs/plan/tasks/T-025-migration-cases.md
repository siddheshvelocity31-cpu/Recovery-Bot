# T-025 · Migration: recovery_case, outreach, reply, commitment

**Status:** not started
**Depends on:** T-019
**Size:** S
**Blocked by:** —

## Goal
The case and outreach tables exist, with the unique constraints that make duplicate sends
and duplicate cases impossible at the database level.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § Data model → Cases and outreach; § Enums
- `docs/plan/DECISIONS.md` D-04 — why `idempotency_key` is unique

## Files
**Create:** `supabase/migrations/0010_cases_and_outreach.sql`,
`tests/integration/schema-cases.test.ts`
**Modify:** `lib/types/database.ts` (regenerate)
**Do not touch:** earlier migrations

## Implementation notes
1. Enums `case_status`, `outreach_status`, `commitment_status` first.
2. `outreach.idempotency_key TEXT NOT NULL UNIQUE` is the load-bearing constraint in this
   migration. It is what makes a retried job harmless (D-04). Everything else here is
   ordinary bookkeeping; this one prevents a duplicate message to a client.
3. `outreach.is_dry_run BOOLEAN NOT NULL DEFAULT true`. The default is deliberately the safe
   value — a code path that forgets to set it sends nothing rather than something.
4. Partial unique index on `recovery_case (client_id)` where `status <> 'resolved'`, so a
   client cannot accumulate two live cases. Two concurrent evaluations racing to open a case
   is a real scenario given the tick model.
5. Index `recovery_case (next_action_at)` where `status NOT IN ('resolved','suppressed')` —
   this is the scheduler's hot query and a full scan here gets slow quietly.
6. `reply` and `commitment` are created now but written by no code in this plan. Creating
   them here means the foreign keys and the trail shape are settled before the later phase
   builds against them, rather than requiring a migration then.
7. RLS on, no policies. `set_updated_at()` on `recovery_case` and `outreach`.

## Acceptance criteria
- [ ] `npx supabase db reset` applies 0010 cleanly
- [ ] `npm test -- tests/integration/schema-cases.test.ts` passes
- [ ] Test proves a second `outreach` row with the same `idempotency_key` is rejected
- [ ] Test proves a second non-resolved `recovery_case` for the same client is rejected
- [ ] Test proves a resolved case plus a new open case for the same client is allowed
- [ ] Test proves `outreach.is_dry_run` defaults to true when omitted from the insert
- [ ] `npm run check` exits 0

## Out of scope
The state machine (T-026). Rails (T-027). The scheduler (T-028). Any reply or commitment
logic — that is the later LLM phase.

## Commit
`feat(db): add recovery case, outreach, reply and commitment tables`
