# T-011 · Event trail: writer and read API

**Status:** not started
**Depends on:** T-006
**Size:** S
**Blocked by:** —

## Goal
Anything in the system can append an immutable event against a client, and the trail can be
read back in reverse chronological order with cursor pagination.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § Data model → `event` and its type vocabulary;
  § API surface → `/api/clients/:id/trail`
- `lib/errors.ts` from T-003

## Files
**Create:** `supabase/migrations/0006_event.sql`, `lib/events/write.ts`, `lib/events/types.ts`,
`app/api/clients/[clientId]/trail/route.ts`, `tests/integration/events.test.ts`
**Modify:** `lib/types/database.ts` (regenerate)
**Do not touch:** `lib/jobs/`, `lib/ledger/`

## Implementation notes
1. Table per contract, with an `UPDATE`/`DELETE` blocking trigger and the
   `(client_id, occurred_at DESC)` index.
2. `writeEvent({client_id, case_id?, actor_type, actor_id?, type, payload})` accepts only
   the `type` values listed in the contract, typed as a union rather than `string`. A free
   `string` here means the trail accumulates near-duplicate type names and becomes
   unfilterable within a month.
3. `writeEvent` accepts an optional transaction-scoped client so a caller can write the
   event in the same transaction as the state change it describes. Where that is not
   possible, the event write comes **after** the state change — a trail entry for something
   that did not happen is worse than a missing one.
4. Cursor pagination on `(occurred_at, id)` descending, encoded as an opaque base64 cursor.
   Offset pagination on an append-heavy table shifts rows between pages.
5. `payload` is stored as-is but must never contain a full ledger row, a phone number or an
   email address — see `03-CONVENTIONS.md` § Logging. Store identifiers and let the reader
   join.

## Acceptance criteria
- [ ] `npx supabase db reset` applies 0006 cleanly
- [ ] `npm test -- tests/integration/events.test.ts` passes
- [ ] Test proves `UPDATE event` and `DELETE FROM event` both raise
- [ ] Test proves 120 events paginate over 3 pages of 50 with no duplicates and no gaps,
      verified by collecting ids across pages into a set
- [ ] Test proves events with identical `occurred_at` still paginate deterministically
- [ ] `GET /api/clients/:id/trail` returns 404 for an unknown client, 401 unauthenticated
- [ ] `npm run check` exits 0

## Out of scope
The trail UI component (T-012). Filtering by channel (T-012). Emitting events from other
subsystems — each subsystem's own task does that.

## Commit
`feat(events): add append-only trail writer and read api`
