# T-033 · Observability: heartbeat, stale data alerts, kill switch

**Status:** not started
**Depends on:** T-008, T-029
**Size:** M
**Blocked by:** —

## Goal
Someone finds out the system is broken before the accounts team does, and an operator can
stop all outreach in one click.

## Context to read first
- `docs/recovery-system-plan.md` § Operating plan → observability and rollback
- `lib/jobs/queue.ts` from T-008 — the tick and its counters
- `lib/policy/rails.ts` from T-027 — rule 1 is the kill switch this task exposes

## Files
**Create:** `supabase/migrations/0012_system_config.sql`, `lib/config/system.ts`,
`components/admin/kill-switch.tsx`, `app/api/admin/kill-switch/route.ts`,
`app/api/health/detailed/route.ts`, `lib/jobs/handlers/health-check.ts`,
`app/(app)/admin/page.tsx`, `tests/integration/observability.test.ts`
**Modify:** `app/api/cron/tick/route.ts` (record a heartbeat only),
`app/(app)/layout.tsx` (kill-switch indicator in the header)
**Do not touch:** `lib/policy/rails.ts`, `lib/jobs/queue.ts` beyond the heartbeat write

## Implementation notes
1. `system_config` is a single-row table (enforced with a CHECK on a constant primary key)
   holding `outreach_kill_switch BOOLEAN`, `global_max_messages_per_week INT`,
   `last_tick_at TIMESTAMPTZ`. The global ceiling that `resolve.ts` uses lives here rather
   than in an environment variable, because it must be changeable in seconds without a deploy.
2. **The kill switch is in the app header at all times**, showing green or red, and links to
   the admin page. Per the plan it must not be buried in a settings screen — the whole value
   of a kill switch is that a stressed person finds it immediately.
3. Toggling it requires `admin`, a reason, and writes both a `setting_change` and an event.
   Turning it back on is equally audited.
4. `/api/health/detailed` returns, for an uptime monitor: database reachable, seconds since
   `last_tick_at`, pending job count, dead job count, oldest pending job age, and the
   kill-switch state. It returns 503 when the last tick is older than 5 minutes — a stalled
   scheduler is invisible otherwise, and a stalled scheduler means nothing gets chased while
   the dashboard looks perfectly healthy.
5. Alert conditions the health job flags: no tick in 5 minutes · any `dead` job · an import
   stuck in `parsing` for over 15 minutes · no successful import in 3 days · more than 20 live
   red flags. Surface these on the admin page; wiring them to email or Slack is a later
   concern, but the detection has to exist now.
6. **The stale-import alert matters more than it looks.** The plan names Excel-file dependency
   as a live risk: if nobody uploads, every number on every screen is quietly out of date and
   nothing indicates it. Show the last import date prominently on the client page too.
7. Structured logs from `lib/logger.ts` only. No personal data at `info` (§ Logging).

## Acceptance criteria
- [ ] `npx supabase db reset` applies 0012 cleanly
- [ ] `npm test -- tests/integration/observability.test.ts` passes
- [ ] Test proves `system_config` rejects a second row
- [ ] Test proves enabling the kill switch causes `checkRails` to block with the kill-switch
      rule, and that no `outreach` row is created on the next evaluation
- [ ] Test proves toggling requires `admin` and a reason, and writes a `setting_change`
- [ ] Test proves `/api/health/detailed` returns 503 when `last_tick_at` is 6 minutes old
      and 200 when it is 1 minute old
- [ ] Test proves a `dead` job appears in the detailed health payload
- [ ] Manual: the header indicator reflects the kill-switch state without a page reload
      after toggling
- [ ] `npm run check` exits 0

## Out of scope
Third-party error tracking or paging (Sentry, PagerDuty). Email or Slack alert delivery.
Cost dashboards — no provider spend exists in this plan.

## Commit
`feat(admin): add kill switch, heartbeat and stale data alerting`
