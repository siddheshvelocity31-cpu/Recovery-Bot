# T-012 · Client list and client detail page

**Status:** not started
**Depends on:** T-010, T-011
**Size:** M
**Blocked by:** —

## Goal
A logged-in user sees a list of clients with balances, opens Olectra, and sees its ledger
entries and its trail. **This completes the walking skeleton.**

## Context to read first
- `docs/plan/02-CONTRACTS.md` § API surface → `/api/clients`, `/api/clients/:id`
- `docs/plan/03-CONVENTIONS.md` § Folder structure
- `lib/money.ts` — `formatPaise` for every displayed amount
- `app/(app)/layout.tsx` from T-004

## Files
**Create:** `app/(app)/clients/page.tsx`, `app/(app)/clients/[clientId]/page.tsx`,
`components/clients/client-table.tsx`, `components/clients/balance-header.tsx`,
`components/trail/trail-list.tsx`, `components/ui/*` (shadcn init),
`app/api/clients/route.ts`, `app/api/clients/[clientId]/route.ts`,
`tests/integration/clients-api.test.ts`
**Modify:** `app/(app)/layout.tsx` (nav links only), `package.json` (shadcn deps)
**Do not touch:** `app/api/clients/[clientId]/trail/route.ts` from T-011

## Implementation notes
1. Initialise shadcn/ui here, the first task with real UI. Take only the primitives needed:
   table, card, badge, button, tabs, skeleton.
2. Client list columns: name, code, tier, current balance, last import date. Balance is
   `SUM(bill_amount_paise)` over all entries, computed in SQL via a view or an rpc — never
   by fetching rows and summing in JavaScript (§ Money).
3. Client detail renders a balance header plus tabs. In this task only two tabs exist:
   **Entries** and **Trail**. Open items, notifications and commitments are added by their
   own tasks; scaffold the tab strip so those tasks add a tab without restructuring.
4. Entries table: doc date, code, passenger, narration, reference, amount. Paginated at 50.
   Render negative amounts distinctly — a refund reading as a charge is the kind of
   misreading that produces a wrong conversation with a client.
5. Trail list is grouped by day, newest first, with an icon per event type and a relative
   timestamp that reveals the absolute IST time on hover.
6. Server Components for data fetching; a Client Component only where interaction requires
   it (pagination controls, tab state). No client-side data-fetching library.
7. Empty states matter here and are cheap now: no clients, no entries, no trail events. A
   blank panel is indistinguishable from a broken query.

## Acceptance criteria
- [ ] `npm test -- tests/integration/clients-api.test.ts` passes
- [ ] Test proves `GET /api/clients` returns Olectra with
      `balance_paise = 669766100n` after the fixture import
- [ ] Test proves `GET /api/clients/:id` returns 404 for an unknown id and 401 unauthenticated
- [ ] Manual, end to end from a clean database: `npx supabase db reset`, `npm run dev`,
      log in, upload the fixture at `/imports`, wait for `imported`, open Olectra, and
      observe the header showing **₹66,97,661.00**
- [ ] The Entries tab lists 108 rows across pages, including the opening balance row
- [ ] The Trail tab shows the `ledger.imported` event with its row counts
- [ ] Amounts render Indian-grouped; the nine negative entries render distinctly
- [ ] `npm run check` exits 0

## Out of scope
Open items and aging (T-018). Categories and settings (T-022). Flags (T-032). Search,
sorting and filtering beyond pagination. Editing anything.

## Commit
`feat(clients): add client list and detail pages with entries and trail`
