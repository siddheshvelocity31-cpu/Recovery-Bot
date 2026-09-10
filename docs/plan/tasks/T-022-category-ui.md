# T-022 · Category list and client assignment UI

**Status:** not started
**Depends on:** T-020
**Size:** M
**Blocked by:** —

## Goal
An admin can see all categories with their client counts, assign a client to a category with
a recorded reason, and every such change is audited.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § API surface → `/api/categories`, `PATCH /api/clients/:id`
- `docs/plan/02-CONTRACTS.md` § Data model → `setting_change`, `category`
- `components/clients/client-table.tsx` from T-012

## Files
**Create:** `app/(app)/settings/categories/page.tsx`,
`components/settings/category-list.tsx`, `components/clients/category-assign.tsx`,
`app/api/categories/route.ts`, `lib/validation/category.ts`, `lib/audit/record-change.ts`,
`tests/integration/categories-api.test.ts`
**Modify:** `app/api/clients/[clientId]/route.ts` (add PATCH), `app/(app)/layout.tsx` (nav),
`components/clients/balance-header.tsx` (show category badges + `tier_changed_at`)
**Do not touch:** `lib/policy/resolve.ts`

## Implementation notes
1. `recordChange()` writes a `setting_change` row and an `event` of type
   `settings.changed` or `client.categorised`. Every mutating policy route calls it. A
   `reason` is **required** on the request, not optional — the plan's risk register names
   unexplained cadence changes as a real failure mode, and a required field is the only
   thing that reliably produces an explanation.
2. Category change affects **forward scheduling only**. Do not recompute or backdate past
   cadence steps. Set `tier_changed_at` and leave any live case's `current_step_number`
   alone. Recategorising a client and thereby firing four messages in an hour is a named
   risk in the plan and this is where it would happen.
3. The category list shows client count per category and blocks deleting a category with
   clients attached, with a message naming the count.
4. The client header shows both badges — tier and band — plus "categorised N months ago"
   when `tier_changed_at` is older than 90 days. Staleness must be visible where the
   decision is made, not buried in a report nobody opens.
5. `POST /api/categories` is admin-only; the list is viewer-readable. Assignment is
   admin-only.

## Acceptance criteria
- [ ] `npm test -- tests/integration/categories-api.test.ts` passes
- [ ] Test proves `GET /api/categories` returns 4 seeded categories with client counts
- [ ] Test proves `PATCH /api/clients/:id` with a `category_id` and no `reason` returns
      400 `VALIDATION_FAILED`
- [ ] Test proves a successful assignment writes exactly one `setting_change` and one
      `client.categorised` event
- [ ] Test proves assignment sets `tier_changed_at` and leaves an existing case's
      `current_step_number` and `next_action_at` unchanged
- [ ] Test proves deleting a category with clients returns 409 with the count in the message
- [ ] Test proves a `collector` calling `POST /api/categories` returns 403
- [ ] Manual: assign Olectra to `watchlist`, reload the client page, see the badge and the
      change in the trail
- [ ] `npm run check` exits 0

## Out of scope
Cadence editing (T-023). Thresholds and persona (T-024). Bulk assignment (later).
Derived behaviour band (later phase).

## Commit
`feat(settings): add category management and audited client assignment`
