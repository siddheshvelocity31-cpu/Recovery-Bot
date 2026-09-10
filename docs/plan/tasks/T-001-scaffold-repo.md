# T-001 · Scaffold Next.js repo, TypeScript, lint, Vitest, CI

**Status:** not started
**Depends on:** —
**Size:** M
**Blocked by:** —

## Goal
A Next.js App Router project exists where `npm run check` and `npm test` both run and pass,
and CI runs them on every push.

## Context to read first
- `docs/plan/03-CONVENTIONS.md` § Folder structure, § Allowed dependencies, § TypeScript
- `CLAUDE.md` — the commands defined there must be the ones that exist after this task

## Files
**Create:** `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`,
`.prettierrc`, `vitest.config.ts`, `app/layout.tsx`, `app/page.tsx`,
`tests/unit/smoke.test.ts`, `.github/workflows/ci.yml`, `.gitignore`, `.env.example`
**Modify:** —
**Do not touch:** `docs/`, `tests/fixtures/`

## Implementation notes
1. `create-next-app` with TypeScript, Tailwind, App Router, no `src/` directory.
   Install only what `03-CONVENTIONS.md` § Allowed dependencies lists.
2. `tsconfig.json` sets `"strict": true` and `"noUncheckedIndexedAccess": true`.
   `noUncheckedIndexedAccess` is deliberate and will be inconvenient. Keep it — this
   codebase indexes into parsed spreadsheet rows constantly and the ledger has gaps.
3. Scripts exactly: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`),
   `check` (`npm run typecheck && npm run lint`), `test` (`vitest run`), `test:watch`.
   `db:types` is added in T-002; do not add it here.
4. `.env.example` lists every variable the project will need with empty values, commented
   by purpose: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`. `.env.local` is gitignored.
5. `tests/unit/smoke.test.ts` asserts something trivially true. Its purpose is to prove
   the runner is wired, not to test anything.
6. CI: Node 22, `npm ci`, `npm run check`, `npm test`. No deploy step — that is T-005.
7. Root `app/page.tsx` can be a placeholder. The real home page is T-032.

## Acceptance criteria
- [ ] `npm install` completes with no peer-dependency errors
- [ ] `npm run check` exits 0
- [ ] `npm test` passes with at least one test executed
- [ ] `npm run build` exits 0
- [ ] `npm run dev` serves `http://localhost:3000` returning HTTP 200
- [ ] `git status` shows no `.env.local`, `node_modules` or `.next` staged
- [ ] CI workflow file is valid YAML and runs `check` and `test`

## Out of scope
Supabase (T-002). Auth (T-004). Vercel deploy (T-005). Any real page or component.
shadcn/ui setup (T-012, when the first real UI needs it).

## Commit
`chore: scaffold next.js project with typescript, lint and vitest`
