# Deployment

This project is deployed to Vercel. Two Supabase projects are used:

| Vercel Environment | Supabase Project | Notes |
|---|---|---|
| Preview | `<preview-project-ref>` | Linked per Preview deployment |
| Production | `<production-project-ref>` | Linked to the main project |

## Environment Variables

The following environment variables must be set in Vercel for both Preview and Production:

| Variable | Required | Sensitive | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | No | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | No | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Yes | Service role key (server-only) |
| `CRON_SECRET` | Yes | Yes | Shared secret for `/api/cron/tick` |

## Applying Migrations

Each Supabase project has its own migration state. To apply migrations:

1. `supabase link --project-ref <project-ref>` — link the local CLI to the project
2. `supabase db push` — apply pending migrations

## Supabase Project Separation

- **Preview project**: Used for Preview deployments. Isolated from production data.
- **Production project**: The main project serving the live site.

Do not point Preview deployments at the production Supabase project. See D-10 — this separation is the whole point of having two projects.

## Function Timeout

The Vercel serverless function timeout observed during development is recorded in PROGRESS.md. T-008 and T-010 size their batches against it (Q-03).

## Rotating the Service-Role Key

1. Generate a new service-role key in Supabase Studio
2. Set the new key as `SUPABASE_SERVICE_ROLE_KEY` in Vercel
3. Update `supabase/migrations/0002_app_user.sql` if the `user_role` enum needs updating
4. Rotate the key in rotation (see D-10)