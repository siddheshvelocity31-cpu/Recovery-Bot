# T-006 · Migration: client, contact, ledger_import, ledger_entry

**Status:** not started
**Depends on:** T-003
**Size:** M
**Blocked by:** —

## Goal
The core client and ledger tables exist exactly as the contract specifies, with RLS on,
constraints enforced, and regenerated types available to the rest of the codebase.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § Data model → Clients, Ledger; § Enums; § IDs
- `supabase/migrations/0001_extensions_and_helpers.sql` — reuse `set_updated_at()`
- `docs/plan/03-CONVENTIONS.md` § Database work

## Files
**Create:** `supabase/migrations/0003_clients_and_ledger.sql`,
`tests/integration/schema-ledger.test.ts`
**Modify:** `lib/types/database.ts` (regenerate only)
**Do not touch:** `supabase/migrations/0001_*`, `0002_*`

## Implementation notes
1. Create enums first: `relationship_tier`, `behaviour_band`, `import_status`, `entry_type`.
   `category_id` on `client` is added in T-019 — do not forward-declare it here, and do not
   create the `category` table.
2. Tables per contract, exactly. Field names are load-bearing: every later task references
   them by name and a rename here silently breaks tasks nobody will re-read.
3. `ledger_entry.bill_amount_paise` is **nullable**. Multi-passenger continuation rows carry
   a passenger name and no amount — four such rows exist in the fixture. A `NOT NULL` here
   will reject valid data.
4. Append-only enforcement on `ledger_entry`: add a trigger that raises on `UPDATE` and
   `DELETE`. Do not rely on convention — the guarantee is worth a trigger, and the first
   time someone "fixes" a row by hand is the time you need it.
5. Enable RLS on all four tables with no policies (D-05). Attach `set_updated_at()` to
   `client`, `contact` and `ledger_import`.
6. Indexes and constraints per contract, including the E.164 check on `contact.phone_e164`
   and the partial unique index for one primary contact per client.
7. The integration test asserts structure, not behaviour: unique violation on duplicate
   `file_sha256`, `UPDATE` on `ledger_entry` raising, a bad phone format rejected, and a
   second `is_primary` contact for the same client rejected.

## Acceptance criteria
- [ ] `npx supabase db reset` applies 0003 with no errors
- [ ] `npm run db:types` regenerates types and `npm run check` exits 0
- [ ] `npm test -- tests/integration/schema-ledger.test.ts` passes
- [ ] Test proves `UPDATE ledger_entry SET pax_name='x'` raises an exception
- [ ] Test proves inserting a second `ledger_import` with the same `file_sha256` returns a
      unique-violation error
- [ ] Test proves `contact.phone_e164 = '9876543210'` (no `+`) is rejected
- [ ] `select relrowsecurity from pg_class where relname in (...)` is true for all four tables

## Out of scope
`open_item`, `receipt`, `allocation` (T-013). Category and policy tables (T-019). Cases
and outreach (T-025). Any seed data (T-020, T-034). Any UI.

## Commit
`feat(db): add client, contact and ledger tables`
