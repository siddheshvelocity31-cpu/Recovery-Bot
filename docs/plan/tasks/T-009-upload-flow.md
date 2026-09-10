# T-009 · Upload flow: Storage, POST /api/imports, status polling

**Status:** not started
**Depends on:** T-006, T-008
**Size:** M
**Blocked by:** —

## Goal
A collector uploads a ledger file through the UI, it lands in private Storage, a
`ledger_import` row is created, a parse job is enqueued, and the page shows live status.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § API surface → `/api/imports`; § Data model → `ledger_import`
- `lib/jobs/queue.ts` from T-008 — use `enqueue`, do not re-implement
- `lib/errors.ts` from T-003 — response envelope

## Files
**Create:** `app/(app)/imports/page.tsx`, `components/imports/upload-form.tsx`,
`app/api/imports/route.ts`, `app/api/imports/[importId]/route.ts`,
`lib/validation/import.ts`, `tests/integration/imports.test.ts`
**Modify:** `supabase/migrations/0005_storage_bucket.sql` (create), `app/(app)/layout.tsx` (nav link only)
**Do not touch:** `lib/ledger/parse-xlsx.ts`, `lib/jobs/handlers/`

## Implementation notes
1. Migration creates a **private** Storage bucket `ledger-imports` with no public policy.
   Files are read server-side with the service-role client only.
2. The browser uploads directly to Storage using a signed upload URL requested from the
   server, then calls `POST /api/imports` with the resulting path, filename and SHA-256.
   Routing file bytes through a Vercel function wastes the request body limit and the
   timeout budget for no benefit.
3. Compute the SHA-256 in the browser with `crypto.subtle.digest` and **re-verify it
   server-side** by hashing the stored object before enqueueing. A client-supplied hash is
   a claim, and this one is the duplicate-import guard.
4. Duplicate `file_sha256` returns `409 CONFLICT` with a message naming the existing import
   and its date. Do not silently succeed — the user needs to know it was already processed.
5. The client must exist. `client_code` from the request is looked up; unknown codes return
   `422 UNPROCESSABLE` telling the user to create the client first. Auto-creating clients
   from a filename is how a typo becomes a second Olectra.
6. Enqueue `ledger.parse_chunk` with `dedupe_key = 'import:' || import_id` and payload
   `{import_id, cursor: 0}`. Set status to `pending`; the handler flips it to `parsing`.
7. The page polls `GET /api/imports/:id` every 2 seconds while status is `pending` or
   `parsing`. No websockets, no Supabase realtime — polling for a job that takes seconds
   is the boring answer and it is correct here.
8. Accept `.xlsx` only. Reject by extension and by ExcelJS load failure, with distinct
   messages so a user can tell "wrong file type" from "corrupt file".

## Acceptance criteria
- [ ] `npm test -- tests/integration/imports.test.ts` passes
- [ ] Test proves uploading the fixture creates a `ledger_import` with status `pending`
      and exactly one `ledger.parse_chunk` job
- [ ] Test proves a second upload of the same bytes returns 409 and creates no second job
- [ ] Test proves an unknown `client_code` returns 422 and creates no import row
- [ ] Test proves a `viewer` role calling `POST /api/imports` returns 403
- [ ] Test proves a server-side hash mismatch against a tampered client hash is rejected
- [ ] Manual: upload the fixture at `/imports`, observe status text updating without a reload
- [ ] `npm run check` exits 0

## Out of scope
Parsing and inserting rows (T-010). Showing parsed entries (T-012). Receipts upload (T-016).
Drag-and-drop, multi-file upload, progress bars beyond a status label.

## Commit
`feat(imports): add ledger upload flow with storage and status polling`
