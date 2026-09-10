# 03 · Conventions

## Folder structure

```
app/
  (auth)/login/page.tsx
  (app)/layout.tsx                        shell: nav, session guard
  (app)/page.tsx                          alert board (home)
  (app)/clients/page.tsx
  (app)/clients/[clientId]/page.tsx       tabs: trail | notifications | open items | commitments
  (app)/imports/page.tsx
  (app)/settings/categories/page.tsx
  (app)/settings/categories/[categoryId]/page.tsx
  api/
    health/route.ts
    cron/tick/route.ts
    clients/route.ts
    clients/[clientId]/route.ts
    clients/[clientId]/trail/route.ts
    ...
components/
  ui/                                     shadcn primitives, unmodified
  clients/, flags/, settings/, trail/     feature components
lib/
  supabase/server.ts                      cookie-bound client, user session
  supabase/admin.ts                       service-role client, server-only
  auth/require-role.ts
  money.ts  dates.ts  errors.ts  logger.ts
  types/enums.ts  types/database.ts       database.ts is GENERATED — never hand-edit
  validation/                             zod schemas, one file per resource
  ledger/parse-xlsx.ts  natural-key.ts  open-items.ts  aging.ts
  policy/resolve.ts  rails.ts  simulate.ts
  cases/state-machine.ts
  outreach/dispatch.ts  render.ts  adapters/
  flags/rules.ts
  events/write.ts
  jobs/queue.ts  handlers/<kind>.ts
supabase/
  migrations/NNNN_description.sql
  seed.sql
tests/
  unit/           mirrors lib/
  integration/    hits a local Supabase
  fixtures/       Olectra_Client_Ledger_Report.xlsx lives here
```

## Allowed dependencies

Adding anything outside this list requires asking first.

**Runtime:** `next` · `react` · `react-dom` · `@supabase/supabase-js` · `@supabase/ssr`
· `zod` · `exceljs` · `date-fns` · `date-fns-tz` · `tailwindcss` · `class-variance-authority`
· `clsx` · `tailwind-merge` · `lucide-react` · `@radix-ui/*` (via shadcn/ui)

**Dev:** `typescript` · `vitest` · `@vitejs/plugin-react` · `@testing-library/react`
· `eslint` · `eslint-config-next` · `prettier` · `supabase` (CLI)

**Explicitly rejected:**

- **`xlsx` (SheetJS npm package)** — the registry copy is stale and carries known
  prototype-pollution and ReDoS advisories. `exceljs` is the choice. If ExcelJS proves
  inadequate on a real file, install SheetJS from the vendor CDN, not npm, and record it.
- **Prisma / Drizzle** — Supabase SQL migrations plus generated types are the single
  source of truth. An ORM adds a second schema definition to keep in sync, and it
  fights RLS.
- **`moment`** — unmaintained. `date-fns` + `date-fns-tz`.
- **`lodash`** — the standard library covers what this project needs.
- Any client-side state manager. Server Components and URL state are sufficient here.
- Any date library other than `date-fns`. Three date libraries across five tasks is
  the specific failure this list exists to prevent.

## Database work

- Migrations are plain SQL in `supabase/migrations/`, named `NNNN_snake_description.sql`,
  numbered sequentially. Never edit an applied migration; add a new one.
- After any migration: `npm run db:types` to regenerate `lib/types/database.ts`.
  That file is generated output — never hand-edit it, and always commit it.
- Every new table in the same migration: enable RLS, add no permissive policy, and
  attach the `set_updated_at()` trigger if it has `updated_at`.
- Multi-statement domain logic that must be atomic goes in a Postgres function called
  via `rpc()`, not in three sequential `supabase-js` calls.

## TypeScript

- `strict: true`, plus `noUncheckedIndexedAccess`.
- No `any`. Use `unknown` and narrow.
- Money is `bigint` in TypeScript. `JSON.stringify` cannot serialise `bigint` — convert
  to string at the API boundary via `lib/money.ts`, never by `Number()`.
- Zod validates every external input: request bodies, query params, webhook payloads,
  and parsed spreadsheet rows. Spreadsheet rows count as external input.

## Testing

- **Unit** (`tests/unit/`): pure functions, no I/O. Parser, money, dates, aging,
  policy resolution, rails, state machine, flag rules. These are the correctness core
  and they are where test effort belongs.
- **Integration** (`tests/integration/`): against `npx supabase start`. Migrations,
  RLS denial, job claiming under concurrency, API handlers.
- Fixture-based tests for anything touching the ledger use the real file at
  `tests/fixtures/Olectra_Client_Ledger_Report.xlsx`. Do not invent a simplified
  spreadsheet — its quirks are the point.
- A test that asserts a money value asserts exact paise. No tolerance windows.
- `npm run check` (typecheck + lint) must exit 0 before any task is marked done.

## Logging

`lib/logger.ts` emits single-line JSON to stdout: `{level, msg, ...context}`.
Every job run and every outbound provider call logs its id. Never log a full ledger
row, a phone number, or an email address at `info` — those are personal data under
DPDP and this system will hold a lot of them.

## Commits

One task, one commit, using the message given in the task file. Conventional Commits:
`feat(scope): ...` · `fix(scope): ...` · `chore(scope): ...` · `test(scope): ...`.

## Migration numbering

Migration filenames are **pre-assigned in the task files**, not chosen at execution time:

| Migration | Task |
|---|---|
| `0001_extensions_and_helpers.sql` | T-002 |
| `0002_app_user.sql` | T-004 |
| `0003_clients_and_ledger.sql` | T-006 |
| `0004_job_queue.sql` | T-008 |
| `0005_storage_bucket.sql` | T-009 |
| `0006_event.sql` | T-011 |
| `0007_open_items.sql` | T-013 |
| `0008_aging_cron.sql` | T-017 |
| `0009_categories_and_policy.sql` | T-019 |
| `0010_cases_and_outreach.sql` | T-025 |
| `0011_flags.sql` | T-031 |
| `0012_system_config.sql` | T-033 |

Supabase applies migrations in filename order, so **tasks must be executed in ascending ID
order**. The dependency graph permits some reordering — T-011 depends only on T-006 and could
technically run before T-009 — but doing so would introduce migration `0006` before `0005`
exists, and adding an earlier-numbered migration to an already-migrated database is exactly
the mess this table prevents. Take tasks in ID order.

If a task genuinely needs a migration not listed here, stop and ask rather than picking a
number.
