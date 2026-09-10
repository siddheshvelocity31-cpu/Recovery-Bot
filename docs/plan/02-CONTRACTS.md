# 02 · Contracts

**Authoritative.** Tasks reference sections here; they never restate them. If code needs
to diverge, that divergence is its own task, done first.

---

## § Money

All monetary values are **integer paise** stored as `BIGINT`. Never `float`, `real`,
`double precision`, or `money`. Never a JS `number` in arithmetic that could accumulate.

- Column names always end `_paise`. There are no exceptions and no rupee columns.
- The ledger contains genuine paise values (the fixture's totals row carries `.37`
  and `.63`), so rounding to whole rupees loses real money and will fail reconciliation.
- Conversion happens only at the display boundary, via `lib/money.ts`:
  - `parseRupeesToPaise(input: string | number): bigint` — rounds half-up at 2dp
  - `formatPaise(paise: bigint): string` — returns Indian-grouped `"₹66,97,661.00"`
- Aggregation happens in SQL (`SUM(bill_amount_paise)`), not by summing in JS.
- Reporting views `v_*_rupees` expose `amount_paise / 100.0::numeric` for anyone
  querying Supabase Studio directly. Application code never reads these views.

## § Dates and time

- Business timezone is **`Asia/Kolkata`**, defined once as `BUSINESS_TZ` in `lib/dates.ts`.
- Calendar dates (`doc_date`, `due_date`, `travel_date`, `issue_date`) are Postgres
  `DATE`. They carry no time and are never converted across timezones.
- Instants (`created_at`, `sent_at`, `next_action_at`, `occurred_at`) are `TIMESTAMPTZ`,
  stored UTC, rendered in `BUSINESS_TZ`.
- Aging, quiet hours and due-date arithmetic all evaluate in `BUSINESS_TZ`. A job that
  fires at 19:05 UTC is 00:35 IST the next day, which is inside quiet hours — getting
  this wrong sends messages at midnight.
- Excel serial dates: the fixture stores dates as serial numbers under date formats.
  The parser must read them as dates, not numbers. Serial `46251` is `2026-08-17`.
  Use the 1900 date system with the Lotus leap-year bug, which is ExcelJS's default.

## § IDs

- Every table has `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- `app_user.id` is the exception: it equals `auth.users.id` and is not defaulted.
- Business identifiers (`client.client_code`, `ledger_entry.doc_code`) are `TEXT` and
  are never used as primary keys — the source system reuses and reformats them.

## § Naming

`snake_case` in the database **and** in TypeScript. Supabase generates types directly
from the schema; a camelCase mapping layer means two names for every field and a
translation bug waiting per boundary. Accept the un-idiomatic TS field names.

---

## § Enums

Declared as Postgres `ENUM` types, mirrored in `lib/types/enums.ts` as const objects.
Exact values, lowercase snake_case:

```
user_role            admin | collector | viewer
relationship_tier    strategic | standard | watchlist | new
behaviour_band       prompt | slipping | chronic | unknown
import_status        pending | parsing | imported | failed
entry_type           debit | credit | opening
open_item_status     open | part_paid | settled | disputed | written_off
aging_bucket         current | d1_30 | d31_60 | d61_90 | d90_plus | unknown
channel              whatsapp | email | voice | human
tone                 courteous | neutral | firm
case_status          open | awaiting_reply | promise_active | escalated | suppressed | resolved
outreach_status      queued | suppressed | sent | delivered | read | failed
commitment_status    proposed | confirmed | kept | partial | broken | rejected
flag_rule            aged_debt | amount_exposure | broken_promise | silence | adverse_trajectory | unaged_balance
flag_severity        red | amber | grey
actor_type           system | user | client
job_status           pending | running | done | failed | dead
```

`behaviour_band` is always `unknown` in this plan. The derivation is a later phase.

---

## § Data model

Every table gets `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Tables that are
mutable also get `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` maintained by a
shared trigger `set_updated_at()`.

### Identity

**`app_user`**
`id UUID PK` (= `auth.users.id`) · `email TEXT NOT NULL UNIQUE` · `full_name TEXT NOT NULL`
· `role user_role NOT NULL DEFAULT 'viewer'` · `is_active BOOLEAN NOT NULL DEFAULT true`

### Clients

**`client`**
`id` · `client_code TEXT NOT NULL UNIQUE` · `name TEXT NOT NULL` · `cost_center TEXT`
· `credit_terms_days INT NOT NULL DEFAULT 30` · `relationship_tier relationship_tier NOT NULL DEFAULT 'new'`
· `behaviour_band behaviour_band NOT NULL DEFAULT 'unknown'` · `category_id UUID REFERENCES category`
· `assigned_collector_id UUID REFERENCES app_user` · `is_muted BOOLEAN NOT NULL DEFAULT false`
· `muted_until TIMESTAMPTZ` · `mute_reason TEXT` · `tier_changed_at TIMESTAMPTZ`
· `updated_at`
Index: `client_code`.

**`contact`**
`id` · `client_id UUID NOT NULL REFERENCES client ON DELETE CASCADE` · `full_name TEXT NOT NULL`
· `role_title TEXT` · `phone_e164 TEXT` · `email TEXT` · `escalation_level INT NOT NULL DEFAULT 1`
· `is_primary BOOLEAN NOT NULL DEFAULT false` · `whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false`
· `email_opt_in BOOLEAN NOT NULL DEFAULT true` · `voice_opt_in BOOLEAN NOT NULL DEFAULT false`
· `updated_at`
Constraint: `phone_e164` matches `^\+[1-9]\d{7,14}$` when not null.
Index: unique partial on `(client_id)` where `is_primary` — one primary per client.

### Ledger

**`ledger_import`**
`id` · `client_id UUID NOT NULL REFERENCES client` · `storage_path TEXT NOT NULL`
· `file_sha256 TEXT NOT NULL UNIQUE` · `source_filename TEXT NOT NULL`
· `period_from DATE` · `period_to DATE` · `status import_status NOT NULL DEFAULT 'pending'`
· `cursor_row INT NOT NULL DEFAULT 0` · `row_count_total INT` · `row_count_imported INT NOT NULL DEFAULT 0`
· `row_count_rejected INT NOT NULL DEFAULT 0` · `opening_balance_paise BIGINT`
· `closing_balance_paise BIGINT` · `uploaded_by UUID REFERENCES app_user`
· `completed_at TIMESTAMPTZ` · `error_message TEXT` · `updated_at`

`file_sha256` unique is the duplicate-upload guard. Re-uploading the same file is a
409, not a second import.

**`ledger_entry`** — **append-only**
`id` · `client_id UUID NOT NULL REFERENCES client` · `ledger_import_id UUID NOT NULL REFERENCES ledger_import`
· `natural_key TEXT NOT NULL UNIQUE` · `row_number INT NOT NULL` · `doc_date DATE NOT NULL`
· `doc_code TEXT NOT NULL` · `entry_type entry_type NOT NULL` · `narration TEXT` · `pax_name TEXT`
· `airline TEXT` · `ticket_no TEXT` · `pnr TEXT` · `emp_code TEXT` · `travel_date DATE`
· `sector TEXT` · `reference TEXT` · `remarks TEXT` · `bill_amount_paise BIGINT`
· `raw_row JSONB NOT NULL`

`natural_key` = `sha256(client_code | doc_code | doc_date_iso | row_number | bill_amount_paise)`.
Row number is included because the fixture legitimately repeats a `doc_code` across
consecutive rows for multi-passenger invoices, and those rows are distinct facts.
Insert uses `ON CONFLICT (natural_key) DO NOTHING` — this is what makes re-import safe.

`bill_amount_paise` is nullable: multi-passenger continuation rows carry the passenger
but no amount (fixture rows for `DS26/2452`, `DS26/2453`, `DS26/2454`, `DS26/2472`).

**`ledger_entry_rejected`**
`id` · `ledger_import_id` · `row_number INT NOT NULL` · `reason TEXT NOT NULL` · `raw_row JSONB NOT NULL`

### Open items and settlement

**`open_item`**
`id` · `client_id UUID NOT NULL REFERENCES client` · `source_doc_code TEXT NOT NULL`
· `source_reference TEXT` · `issue_date DATE NOT NULL` · `due_date DATE`
· `gross_amount_paise BIGINT NOT NULL` · `credits_applied_paise BIGINT NOT NULL DEFAULT 0`
· `receipts_applied_paise BIGINT NOT NULL DEFAULT 0`
· `open_amount_paise BIGINT GENERATED ALWAYS AS (gross_amount_paise - credits_applied_paise - receipts_applied_paise) STORED`
· `status open_item_status NOT NULL DEFAULT 'open'` · `aging_bucket aging_bucket NOT NULL DEFAULT 'unknown'`
· `is_unaged BOOLEAN NOT NULL DEFAULT false` · `dispute_reason TEXT` · `updated_at`
Unique: `(client_id, source_doc_code)`.
Index: `(client_id, status)`, `(aging_bucket)`.

`is_unaged = true` and `due_date IS NULL` for the brought-forward opening balance.
It is a real obligation with no derivable age, and it must never be given a fabricated
`due_date` to make the dashboard look complete.

**`receipt`**
`id` · `client_id UUID NOT NULL REFERENCES client` · `receipt_date DATE NOT NULL`
· `amount_paise BIGINT NOT NULL CHECK (amount_paise > 0)` · `instrument TEXT`
· `reference TEXT` · `external_ref TEXT UNIQUE` · `unallocated_paise BIGINT NOT NULL`

**`allocation`**
`id` · `open_item_id UUID NOT NULL REFERENCES open_item` · `receipt_id UUID REFERENCES receipt`
· `credit_entry_id UUID REFERENCES ledger_entry` · `amount_paise BIGINT NOT NULL CHECK (amount_paise > 0)`
Constraint: exactly one of `receipt_id` / `credit_entry_id` is non-null.
Unique: `(credit_entry_id)` where not null — a credit note allocates once.

### Policy

**`category`**
`id` · `code TEXT NOT NULL UNIQUE` · `display_name TEXT NOT NULL`
· `relationship_tier relationship_tier NOT NULL` · `behaviour_band behaviour_band NOT NULL`
· `is_default BOOLEAN NOT NULL DEFAULT false` · `is_active BOOLEAN NOT NULL DEFAULT true` · `updated_at`
Unique: `(relationship_tier, behaviour_band)`. Partial unique on `is_default` where true.

**`cadence_policy`**
`id` · `category_id UUID NOT NULL UNIQUE REFERENCES category ON DELETE CASCADE`
· `max_messages_per_week INT NOT NULL DEFAULT 2 CHECK (BETWEEN 0 AND 7)`
· `is_active BOOLEAN NOT NULL DEFAULT true` · `updated_at`

**`cadence_step`**
`id` · `cadence_policy_id UUID NOT NULL REFERENCES cadence_policy ON DELETE CASCADE`
· `step_number INT NOT NULL CHECK (> 0)` · `channel channel NOT NULL`
· `offset_days_from_due INT NOT NULL CHECK (>= 0)` · `template_key TEXT NOT NULL`
· `escalation_level INT NOT NULL DEFAULT 1`
Unique: `(cadence_policy_id, step_number)`.
Constraint enforced in application (T-018): `offset_days_from_due` strictly increases
with `step_number`.

**`persona`**
`id` · `category_id UUID NOT NULL UNIQUE REFERENCES category ON DELETE CASCADE`
· `tone tone NOT NULL DEFAULT 'neutral'` · `salutation TEXT NOT NULL DEFAULT 'Dear {contact_name},'`
· `language TEXT NOT NULL DEFAULT 'en'` · `signature TEXT NOT NULL`
· `voice_script_style TEXT` · `requires_human_approval BOOLEAN NOT NULL DEFAULT false` · `updated_at`

`tone = 'firm'` requires `requires_human_approval = true`. Enforced by CHECK constraint.
Automatic escalation past `neutral` is a product decision, not an implementation one.

**`threshold_set`**
`id` · `category_id UUID NOT NULL UNIQUE REFERENCES category ON DELETE CASCADE`
· `amber_days INT NOT NULL DEFAULT 30` · `red_days INT NOT NULL DEFAULT 60`
· `amber_amount_paise BIGINT` · `red_amount_paise BIGINT`
· `quiet_hours_start TIME NOT NULL DEFAULT '19:00'` · `quiet_hours_end TIME NOT NULL DEFAULT '10:00'`
· `promise_grace_hours INT NOT NULL DEFAULT 24` · `silence_attempts INT NOT NULL DEFAULT 3` · `updated_at`
Constraint: `red_days > amber_days`.

### Cases and outreach

**`recovery_case`**
`id` · `client_id UUID NOT NULL REFERENCES client` · `status case_status NOT NULL DEFAULT 'open'`
· `current_step_number INT NOT NULL DEFAULT 0` · `next_action_at TIMESTAMPTZ`
· `total_open_paise BIGINT NOT NULL DEFAULT 0` · `assigned_to UUID REFERENCES app_user`
· `suppressed_until TIMESTAMPTZ` · `suppression_reason TEXT` · `opened_at TIMESTAMPTZ NOT NULL DEFAULT now()`
· `closed_at TIMESTAMPTZ` · `updated_at`
Partial unique: one non-resolved case per client.
Index: `(next_action_at)` where `status` not in (`resolved`,`suppressed`).

**`outreach`**
`id` · `case_id UUID NOT NULL REFERENCES recovery_case` · `client_id UUID NOT NULL REFERENCES client`
· `contact_id UUID REFERENCES contact` · `channel channel NOT NULL`
· `cadence_step_number INT NOT NULL` · `template_key TEXT NOT NULL` · `persona_tone tone NOT NULL`
· `rendered_body TEXT NOT NULL` · `status outreach_status NOT NULL DEFAULT 'queued'`
· `idempotency_key TEXT NOT NULL UNIQUE` · `is_dry_run BOOLEAN NOT NULL DEFAULT true`
· `suppression_reason TEXT` · `provider TEXT` · `provider_message_id TEXT` · `cost_paise BIGINT`
· `scheduled_for TIMESTAMPTZ NOT NULL` · `sent_at TIMESTAMPTZ` · `delivered_at TIMESTAMPTZ`
· `read_at TIMESTAMPTZ` · `failed_reason TEXT` · `updated_at`

`idempotency_key` = `{case_id}:{cadence_step_number}:{scheduled_for_date_iso}`.
This is the duplicate-send guard and the reason a retried job cannot double-message.

**`reply`**, **`commitment`** — created in T-021, inert in this plan. Shapes:
`reply`: `id` · `case_id` · `client_id` · `outreach_id` (nullable) · `channel` · `raw_text` · `received_at` · `provider_message_id`
`commitment`: `id` · `case_id` · `reply_id` · `promised_amount_paise` · `promised_on DATE` · `due_at TIMESTAMPTZ` · `confidence NUMERIC(3,2)` · `extraction_model TEXT` · `status commitment_status` · `confirmed_by` · `confirmed_at`

### Flags, trail, jobs, audit

**`flag`**
`id` · `client_id UUID NOT NULL REFERENCES client` · `open_item_id UUID REFERENCES open_item`
· `rule flag_rule NOT NULL` · `severity flag_severity NOT NULL` · `message TEXT NOT NULL`
· `dedupe_key TEXT NOT NULL` · `raised_at TIMESTAMPTZ NOT NULL DEFAULT now()`
· `acknowledged_by UUID REFERENCES app_user` · `acknowledged_at TIMESTAMPTZ`
· `ack_reason TEXT` · `ack_until TIMESTAMPTZ` · `resolved_at TIMESTAMPTZ` · `resolution TEXT`
Partial unique: `(dedupe_key)` where `resolved_at IS NULL` — re-evaluating does not
create a second copy of a live flag.

**`event`** — **append-only**
`id` · `client_id UUID NOT NULL REFERENCES client` · `case_id UUID REFERENCES recovery_case`
· `actor_type actor_type NOT NULL` · `actor_id UUID` · `type TEXT NOT NULL`
· `payload JSONB NOT NULL DEFAULT '{}'` · `occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()`
Index: `(client_id, occurred_at DESC)`.

Event `type` vocabulary — extend only by amending this list:
`ledger.imported` · `ledger.import_failed` · `open_item.created` · `open_item.settled`
· `open_item.disputed` · `case.opened` · `case.advanced` · `case.suppressed` · `case.escalated`
· `case.resolved` · `outreach.scheduled` · `outreach.suppressed` · `outreach.dry_run`
· `outreach.sent` · `outreach.delivered` · `outreach.failed` · `reply.received`
· `commitment.proposed` · `commitment.confirmed` · `commitment.kept` · `commitment.broken`
· `flag.raised` · `flag.acknowledged` · `flag.resolved` · `client.categorised`
· `client.muted` · `client.unmuted` · `settings.changed`

**`job`**
`id` · `kind TEXT NOT NULL` · `payload JSONB NOT NULL DEFAULT '{}'`
· `run_after TIMESTAMPTZ NOT NULL DEFAULT now()` · `status job_status NOT NULL DEFAULT 'pending'`
· `attempts INT NOT NULL DEFAULT 0` · `max_attempts INT NOT NULL DEFAULT 5`
· `locked_at TIMESTAMPTZ` · `locked_by TEXT` · `last_error TEXT`
· `dedupe_key TEXT` · `completed_at TIMESTAMPTZ`
Partial unique: `(dedupe_key)` where `status IN ('pending','running')`.
Index: `(status, run_after)`.

Job `kind` vocabulary: `ledger.parse_chunk` · `ledger.derive_open_items` · `aging.recompute`
· `case.evaluate` · `outreach.dispatch` · `flags.evaluate`

**`setting_change`**
`id` · `actor_id UUID NOT NULL REFERENCES app_user` · `scope TEXT NOT NULL`
· `scope_id UUID` · `field TEXT NOT NULL` · `old_value JSONB` · `new_value JSONB`
· `reason TEXT` · `changed_at TIMESTAMPTZ NOT NULL DEFAULT now()`

---

## § API surface

All under `app/api/`. **Route Handlers only** — no Server Actions, so that every
mutation is curl-testable and has one uniform auth and error path (D-06).

Every handler: parse with zod → `requireRole()` → act → return the envelope below.

| Method | Path | Role | Request | Success |
|---|---|---|---|---|
| GET | `/api/health` | none | — | `200 {status,version,db}` |
| POST | `/api/cron/tick` | secret header | — | `200 {claimed,processed,failed}` |
| GET | `/api/clients` | viewer | `?q&tier&has_flags&page` | `200 {data:Client[],page}` |
| GET | `/api/clients/:id` | viewer | — | `200 {data:ClientDetail}` |
| PATCH | `/api/clients/:id` | admin | `{category_id?,credit_terms_days?,relationship_tier?,assigned_collector_id?,reason}` | `200 {data:Client}` |
| POST | `/api/clients/:id/mute` | collector | `{muted_until,reason}` | `200 {data:Client}` |
| GET | `/api/clients/:id/trail` | viewer | `?channel&from&to&cursor` | `200 {data:Event[],next_cursor}` |
| GET | `/api/clients/:id/open-items` | viewer | `?status` | `200 {data:OpenItem[],totals}` |
| GET | `/api/clients/:id/outreach` | viewer | `?cursor` | `200 {data:Outreach[],next_cursor}` |
| POST | `/api/imports` | collector | `{storage_path,filename,sha256,client_code}` | `202 {data:{import_id}}` |
| GET | `/api/imports/:id` | collector | — | `200 {data:LedgerImport}` |
| GET | `/api/categories` | viewer | — | `200 {data:CategoryWithPolicy[]}` |
| POST | `/api/categories` | admin | `{code,display_name,relationship_tier,behaviour_band}` | `201 {data:Category}` |
| PUT | `/api/categories/:id/cadence` | admin | `{max_messages_per_week,steps:[...],reason}` | `200 {data:CadencePolicy}` |
| PUT | `/api/categories/:id/thresholds` | admin | `{...threshold_set,reason}` | `200 {data:ThresholdSet}` |
| PUT | `/api/categories/:id/persona` | admin | `{...persona,reason}` | `200 {data:Persona}` |
| POST | `/api/categories/:id/simulate` | admin | `{cadence,thresholds,window_days}` | `200 {data:SimulationResult}` |
| GET | `/api/flags` | viewer | `?severity&acknowledged` | `200 {data:Flag[]}` |
| POST | `/api/flags/:id/acknowledge` | collector | `{reason,ack_until}` | `200 {data:Flag}` |

Pagination is cursor-based on `(occurred_at, id)` for the trail, offset-based
elsewhere. Default page size 50, max 200.

## § Response envelope

Success: `{ "data": <payload>, "meta"?: {...} }`
Error: `{ "error": { "code": ErrorCode, "message": string, "details"?: unknown } }`

```
ErrorCode =
  VALIDATION_FAILED   400
  UNAUTHENTICATED     401
  FORBIDDEN           403
  NOT_FOUND           404
  CONFLICT            409   duplicate file sha, duplicate idempotency key
  UNPROCESSABLE       422   valid shape, invalid domain state
  RATE_LIMITED        429
  PROVIDER_ERROR      502
  INTERNAL            500
```

Built by `lib/errors.ts`: `ok(data, meta?)`, `fail(code, message, details?)`.
`message` is safe to show a user. Stack traces go to logs, never to the body.

## § Simulation result shape

```ts
type SimulationResult = {
  window_days: number
  current: { messages: number; clients: number; by_channel: Record<Channel, number> }
  proposed: { messages: number; clients: number; by_channel: Record<Channel, number> }
  delta_messages: number
  affected_clients: { client_id: string; name: string; current: number; proposed: number }[]
  warnings: string[]   // e.g. "exceeds global weekly cap for 4 clients"
}
```
