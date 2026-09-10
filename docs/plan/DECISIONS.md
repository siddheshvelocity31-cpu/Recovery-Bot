# Decisions

## Resolved

### D-01 · Money stored as BIGINT paise
**Date:** 2026-08-28 · **Decided during:** planning
The fixture carries genuine paise (totals row shows `1660301.37`, `2626.63`), so whole-rupee
storage loses money and breaks reconciliation. Postgres `NUMERIC` would be exact in the
database but arrives in JavaScript through PostgREST as a JSON number, reintroducing float
error in application arithmetic. Integer paise as `BIGINT`, mapped to `bigint` in TypeScript,
is exact end to end. Rupee views are provided for humans querying Studio directly.
**Revisit if:** a requirement appears for sub-paise precision, e.g. FX-denominated invoices.

### D-02 · Scheduler is Supabase pg_cron, not Vercel Cron
**Date:** 2026-08-28 · **Decided during:** planning
Vercel has no long-running process, so scheduling must come from outside the app. Per-minute
Vercel Cron requires a paid plan; `pg_cron` + `pg_net` inside Supabase runs at any frequency,
sits next to the data, and survives a change of host. `/api/cron/tick` is a plain authenticated
endpoint, so switching triggers later is a configuration change, not a rewrite.
**Revisit if:** tick latency or `pg_net` reliability becomes a problem in production.

### D-03 · Ledger import is chunked through a database job queue
**Date:** 2026-08-28 · **Decided during:** planning
Vercel function timeouts (10s Hobby / 60s Pro default) cannot accommodate parsing and
inserting a full multi-client ledger in the upload request. Upload writes to Storage and
enqueues; the cron tick parses 500 rows per pass with a cursor. This also gives retries and
a visible failure state for free.
**Revisit if:** import volume grows enough that a dedicated worker platform is warranted.

### D-04 · Job handlers must be idempotent; outreach guarded by a unique key
**Date:** 2026-08-28 · **Decided during:** planning
A tick can do work and then time out before marking a job complete, so every job will
eventually be retried after partial success. Ledger inserts use `ON CONFLICT (natural_key)
DO NOTHING`. Outreach inserts a row with a `UNIQUE idempotency_key` **before** attempting a
send, so a duplicate attempt fails at the database rather than at the client's phone.
**Revisit if:** never. This is load-bearing.

### D-05 · RLS enabled with no permissive policies; authorization in the app layer
**Date:** 2026-08-28 · **Decided during:** planning
All access goes through Route Handlers using the service-role key, with role checks in
`lib/auth/require-role.ts`. RLS is on with no policies, so a leaked anon key reads nothing.
Modelling this domain's authorization in RLS policies would be more code and harder to test
for a team of two and roughly a dozen internal users.
**Revisit if:** clients ever get direct read access, or the client-side needs to query
Supabase directly. Either would make policy-based RLS the correct model.

### D-06 · Route Handlers only, no Server Actions
**Date:** 2026-08-28 · **Decided during:** planning
Mixing both means two auth paths, two error shapes and two testing strategies, and an agent
picking between them per task produces an inconsistent codebase. Route Handlers are
curl-testable, which makes acceptance criteria executable.
**Revisit if:** form-heavy screens make the round trip painful. Cheap to change later.

### D-07 · ExcelJS over the npm `xlsx` package
**Date:** 2026-08-28 · **Decided during:** planning
The npm registry copy of SheetJS is stale and carries prototype-pollution and ReDoS
advisories. This system parses untrusted-ish files that determine what clients get told
they owe, so a parser with live advisories is the wrong trade. SheetJS from the vendor CDN
is the fallback if ExcelJS mishandles a real file.
**Revisit if:** ExcelJS fails on a genuine export from the back-office system.

### D-08 · snake_case in TypeScript as well as SQL
**Date:** 2026-08-28 · **Decided during:** planning
Supabase generates types straight from the schema. A camelCase mapping layer creates two
names for every field and a translation bug at each boundary. Un-idiomatic TypeScript is
the cheaper cost.

### D-09 · Business timezone is Asia/Kolkata, fixed in code
**Date:** 2026-08-28 · **Decided during:** planning
Quiet hours, aging and due dates are all local-business concepts. Timestamps store UTC;
all business evaluation converts through `BUSINESS_TZ`. Getting this wrong sends messages
at midnight IST, which is exactly the failure this system exists to avoid.

### D-10 · Two Supabase projects, not one
**Date:** 2026-08-28 · **Decided during:** planning
Staging and production share nothing. A shared project means a staging bug can write
production rows, and process discipline does not reliably prevent that.
**Superseded 2026-08-28 (execution):** local dev has no Docker, so `npx supabase start`
cannot run. The user provided a single hosted Supabase project to develop against for now
instead. All migrations and generated types target that one project until a second one is
provisioned for the staging/production split. Revisit before any real client data or live
send is involved.

### D-11 · behaviour_band ships as `unknown` for everyone
**Date:** 2026-08-28 · **Decided during:** planning
Deriving the band needs receipt history the system will not have for months. The column and
the enum exist now so the category key is stable; the derivation is a later phase. Building
the algorithm now would mean writing untestable code against absent data.

---

## Open

These are unresolved. Each has an interim assumption so work is not blocked, but each one
should be answered before the task it affects.

### Q-01 · Where do credit terms come from? ⚠ BLOCKING for T-014
**Blocks:** T-014, T-015 · **Needs:** accounts lead
Nothing in the ledger export carries a due date or payment terms. Aging cannot be computed
without them.
**Interim assumption:** `client.credit_terms_days` defaults to 30, editable per client in the
UI, and `due_date = doc_date + credit_terms_days`. If terms actually vary per booking type
or per contract, the model needs a terms table and T-014 grows substantially.

### Q-02 · What is the receipts export format? ⚠ BLOCKING for T-013
**Blocks:** T-013 · **Needs:** ERP vendor
The sample ledger contains no payments received — all nine negative rows are refunds and
credit notes. Without receipts the system can never mark anything recovered.
**Interim assumption:** T-013 is specced against a minimal CSV (`date, amount, instrument,
reference, client_code`) and a manual entry screen. Rework is likely once the real format
is known. **Do not start T-013 before this is answered.**

### Q-03 · Which Vercel plan, and therefore what is the function timeout?
**Blocks:** T-008 sizing · **Needs:** you
Chunk size and tick batch size depend on whether the ceiling is 10s or 60s.
**Interim assumption:** 60s (Pro), chunk size 500 rows, tick batch 20 jobs. On Hobby, drop
to 100 and 5, which is a config change in `lib/jobs/queue.ts`, not a redesign.

### Q-04 · Who are the actual client contacts?
**Blocks:** T-030 realism, and all of the later live-send phase · **Needs:** accounts team
The ledger has no client-side contact data — `emp_code` is VSAR's own booking staff. Dry run
works with seeded contacts; live sending cannot start without real ones in E.164 format.

### Q-05 · How many categories, and what are they called?
**Blocks:** T-017 seed data · **Needs:** you
**Interim assumption:** four tiers (`strategic`, `standard`, `watchlist`, `new`) each paired
with `behaviour_band = 'unknown'`, giving four seeded categories, `standard` as default.

### Q-06 · Does the B/F opening balance ever get broken down?
**Blocks:** nothing technically · **Needs:** ERP vendor
₹51,30,687 of the ₹66,97,661 closing balance is a single unaged row. The system models it
honestly as `is_unaged` with a grey flag, but 77% of the balance stays unchaseable until an
open-item extract exists. Worth knowing that no amount of software fixes this.

### Q-07 · Message templates and their approved wording
**Blocks:** the later live-send phase · **Needs:** you + Meta review
Dry run uses placeholder template bodies stored as `template_key` plus a local string map.
Real WhatsApp templates must be submitted to Meta and approved before any live send, and
per `docs/recovery-system-plan.md` they should stay tone-neutral across all categories to
avoid multiplying the approval surface.
