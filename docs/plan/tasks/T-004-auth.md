# T-004 · Auth: Supabase Auth login, session guard, role checks

**Status:** not started
**Depends on:** T-002
**Size:** M
**Blocked by:** —

## Goal
A staff user can log in with email and password, unauthenticated requests to app pages
redirect to login, and route handlers can require a minimum role.

## Context to read first
- `docs/plan/02-CONTRACTS.md` § Data model → `app_user`, § Response envelope
- `docs/plan/01-ARCHITECTURE.md` § Security model
- `lib/supabase/server.ts` and `lib/supabase/admin.ts` from T-002

## Files
**Create:** `supabase/migrations/0002_app_user.sql`, `app/(auth)/login/page.tsx`,
`app/(app)/layout.tsx`, `lib/auth/require-role.ts`, `lib/auth/get-session.ts`,
`middleware.ts`, `app/api/me/route.ts`, `tests/integration/auth.test.ts`
**Modify:** `lib/types/database.ts` (regenerate only)
**Do not touch:** `lib/supabase/admin.ts`

## Implementation notes
1. Migration `0002` creates the `user_role` enum and the `app_user` table per contract,
   enables RLS with no policies, attaches `set_updated_at()`, and adds a trigger on
   `auth.users` insert that creates the matching `app_user` row with role `viewer`.
   New users get the least privilege by default; promotion is deliberate.
2. `require-role.ts` exports `requireRole(request, minimum: UserRole)`, resolving the
   session, loading `app_user`, and throwing `AppError('FORBIDDEN')` when the role is
   insufficient or `is_active` is false. Order is `viewer < collector < admin`.
3. `middleware.ts` guards the `(app)` route group only. It refreshes the Supabase session
   cookie — without that refresh, sessions expire mid-use in confusing ways.
4. No sign-up page. Users are created by an admin in Supabase Studio and promoted with
   SQL. This is an internal tool for roughly a dozen people; a self-service registration
   flow is surface area with no user.
5. `GET /api/me` returns the current `app_user` and is the thing the integration test
   exercises for all three role outcomes.

## Acceptance criteria
- [ ] `npx supabase db reset` applies 0002 cleanly
- [ ] `npm test -- tests/integration/auth.test.ts` passes
- [ ] Tests cover: no session → 401, `viewer` calling a `collector` route → 403,
      `admin` → 200, inactive user → 403
- [ ] Visiting `/clients` unauthenticated redirects to `/login` (manual: run
      `npm run dev`, open in a private window, observe the redirect)
- [ ] A user created via Supabase Studio automatically appears in `app_user` with role `viewer`
- [ ] `npm run check` exits 0

## Out of scope
MFA. Password reset. SSO. Any user-management UI — admins use Studio for now.
Per-client collector scoping (later; the column exists but is not enforced).

## Commit
`feat(auth): add supabase auth login, session guard and role checks`
