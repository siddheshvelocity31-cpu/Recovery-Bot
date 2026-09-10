# 04 · Task Index

34 tasks in 5 phases. Migration numbers are pre-assigned per task, so tasks must be
executed in ID order within a phase — see `03-CONVENTIONS.md` § Migration numbering. Every task leaves the repository green and committable.

## Phase 1 · Foundation

| ID | Task | Depends on | Size |
|---|---|---|---|
| T-001 | Scaffold Next.js repo, TypeScript, lint, Vitest, CI | — | M |
| T-002 | Supabase local, migration tooling, generated types | T-001 | M |
| T-003 | Enums, shared utilities: money, dates, errors, logger | T-002 | M |
| T-004 | Auth: Supabase Auth login, session guard, role checks | T-002 | M |
| T-005 | Deploy to Vercel: `/api/health` reachable on staging | T-002 | S |

## Phase 2 · Walking skeleton — a real file becomes visible data

| ID | Task | Depends on | Size |
|---|---|---|---|
| T-006 | Migration: `client`, `contact`, `ledger_import`, `ledger_entry` | T-003 | M |
| T-007 | XLSX parser as a pure function, tested against the fixture | T-003 | **L** |
| T-008 | Job queue: table, claim, retry, `/api/cron/tick`, pg_cron | T-006 | M |
| T-009 | Upload flow: Storage, `POST /api/imports`, status polling | T-006, T-008 | M |
| T-010 | Import job handler: chunked parse and insert | T-007, T-009 | M |
| T-011 | Event trail: writer, `GET /api/clients/:id/trail` | T-006 | S |
| T-012 | Client list and client detail page showing entries + balance | T-010, T-011 | M |

**Skeleton complete at T-012.** The fixture uploads, parses, reconciles, and is visible.

## Phase 3 · Ledger truth

| ID | Task | Depends on | Size |
|---|---|---|---|
| T-013 | Migration: `open_item`, `receipt`, `allocation` | T-006 | S |
| T-014 | Derive open items from entries, including multi-pax grouping | T-013, T-010 | **L** |
| T-015 | Allocate credit notes to originals via `remarks` cross-reference | T-014 | M |
| T-016 | Receipts import and allocation · **BLOCKED: Q-02** | T-013 | M |
| T-017 | Due dates and aging buckets, `B/F` handled as unaged · **needs Q-01** | T-014 | M |
| T-018 | Open items tab and aging summary on the client page | T-017 | M |

## Phase 4 · Categories, cadence, policy

| ID | Task | Depends on | Size |
|---|---|---|---|
| T-019 | Migration: `category`, `cadence_policy`, `cadence_step`, `persona`, `threshold_set`, `setting_change` | T-006 | M |
| T-020 | Seed four categories with default policies · **needs Q-05** | T-019 | S |
| T-021 | Policy resolver as a pure function, with tests | T-019 | M |
| T-022 | Category list and assignment UI, with audited changes | T-020 | M |
| T-023 | Cadence editor with validation | T-022 | M |
| T-024 | Threshold and persona editors | T-022 | M |
| T-025 | Migration: `recovery_case`, `outreach`, `reply`, `commitment` | T-019 | S |
| T-026 | Case state machine as a pure function, with tests | T-025, T-021 | M |
| T-027 | Rails engine as a pure function, with tests | T-021, T-025 | M |
| T-028 | Scheduler: evaluate cases, resolve policy, apply rails, enqueue | T-026, T-027, T-008 | **L** |
| T-029 | Dry-run dispatcher: render, persist, write to trail, send nothing | T-028 | M |
| T-030 | Cadence simulator and `POST /api/categories/:id/simulate` | T-021, T-029 | M |

## Phase 5 · Flags and hardening

| ID | Task | Depends on | Size |
|---|---|---|---|
| T-031 | Migration + flag engine: six rules, dedupe, evaluation job | T-017, T-019 | M |
| T-032 | Alert board home page, acknowledge flow | T-031 | M |
| T-033 | Observability: cron heartbeat, stale-import alert, error surface | T-008, T-029 | M |
| T-034 | Seed script and end-to-end dry-run smoke test | T-030, T-032 | M |

## Critical path

```
T-001 → T-002 → T-003 → T-006 → T-007/T-010 → T-014 → T-017 → T-028 → T-029 → T-034
```

**T-014 is the riskiest task.** Deriving invoice-level open items from a running-balance
statement is where the ledger's real messiness lands: multi-passenger rows sharing a
document code with the amount on only the first row, reissues, split PNRs, and a
brought-forward balance with no detail. If any task overruns, it is this one. Its
acceptance criteria are deliberately exact figures from the fixture so that "roughly
right" cannot pass.

**T-007 and T-014 are both marked L.** That is a warning, not an estimate. If either
runs past one session, split it at the seam its notes identify rather than pushing on.

## Blocked tasks

| Task | Blocked by | Owner |
|---|---|---|
| T-016 | Q-02 — receipts export format unknown | ERP vendor |
| T-017 | Q-01 — credit terms source unknown (interim assumption available) | Accounts lead |
| T-020 | Q-05 — category names (interim assumption available) | You |

T-017 and T-020 can proceed on their interim assumptions. **T-016 should not start**
until Q-02 is answered — building it against a guessed CSV format is rework, not progress.

## Later phases — not task-specced

Deliberately coarse. These depend on vendor credentials, Meta template approval and real
reply data that do not exist yet.

| Epic | Prerequisite |
|---|---|
| Live WhatsApp sending via DoubleTick | Verified WABA, approved templates (Q-07) |
| Live email sending and inbound reply capture | Provider with inbound webhooks; a serverless-friendly path, since IMAP polling fits Vercel badly |
| LLM promise extraction with a human approval queue | 100+ real replies to evaluate against |
| Sarvam voice calls | Q on whether Sarvam provides PSTN or needs a telephony partner |
| Derived `behaviour_band` | Receipts plus 2–3 months of payment history |
| Direct read from the back-office database | ERP vendor access |
