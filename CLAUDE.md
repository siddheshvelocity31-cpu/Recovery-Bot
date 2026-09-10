# Receivables Recovery System

An internal tool for VSAR Technologies. It imports client ledger spreadsheets from the
travel back-office system, works out what each corporate client actually owes and how
old it is, and runs a configurable dunning cadence over WhatsApp, email and voice.
Client replies are captured, promises to pay are extracted and re-triggered on time,
and everything that happens is written to an append-only trail shown per client.

Stack: Next.js (App Router) · TypeScript · Supabase (Postgres, Auth, Storage) · Vercel.

## Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Test: `npm test` (Vitest)
- Check (typecheck + lint): `npm run check`
- Local database up: `npx supabase start`
- Apply migrations locally: `npx supabase db reset`
- Regenerate DB types: `npm run db:types`

## Working from the plan

Implementation is planned in `docs/plan/`. To pick up work:

1. Read `docs/plan/PROGRESS.md` and take the next unblocked task.
2. Read `docs/plan/02-CONTRACTS.md` and `docs/plan/03-CONVENTIONS.md`.
3. Read that task's file in `docs/plan/tasks/`.
4. Implement only what the task covers. Respect its "Out of scope" section.
5. Verify every acceptance criterion by actually running it.
6. Update PROGRESS.md, then commit with the message given in the task.

## Rules

- Contracts in `02-CONTRACTS.md` are authoritative. If code needs to diverge,
  stop and raise it rather than changing the code silently.
- One task per commit. Do not bundle unrelated changes.
- Do not add dependencies not listed in `03-CONVENTIONS.md` without asking.
- If a task is ambiguous, stop and ask. Do not guess.

## Non-negotiables for this domain

This system sends messages to real corporate clients about real money. Four rules
override convenience everywhere in the codebase:

- **Money is `BIGINT` paise.** Never a float, never a JS `number` for arithmetic.
  See `02-CONTRACTS.md` § Money.
- **Nothing sends without passing the rails.** Every outbound message goes through
  `lib/policy/rails.ts`. There is no second code path.
- **`is_dry_run` defaults to true** until T-030 explicitly flips it per environment.
  A test run that accidentally messages a client is not recoverable.
- **`ledger_entry` and `event` are append-only.** Corrections insert new rows.
  Never `UPDATE`, never `DELETE`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Design System

Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.
