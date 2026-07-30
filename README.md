# Training Tracker

A general, multi-discipline strength/climbing/cardio training tracker. Installable as a PWA.

**Live app:** https://joelkhchan2.github.io/training-tracker/

Strength, climbing, and cardio have full UIs. (The `calisthenics` discipline and daily check-ins exist in the schema but are not user-facing yet.)

Working in the codebase? Read [CLAUDE.md](CLAUDE.md) for the architecture, backend model, conventions, and gotchas.

## Tech stack

- [Vite](https://vite.dev/) + React 19 + TypeScript
- Tailwind CSS 4
- [Supabase](https://supabase.com/) (Postgres + Auth + Row Level Security)
- PWA via [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- Deployed to GitHub Pages via GitHub Actions

## Prerequisites

- Node ≥ 20 (repo pins `v22.21.1` in `.nvmrc`)
- [Docker](https://www.docker.com/) (required to run Supabase locally)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- `psql`

## Environment variables

The app reads two variables from a `.env.local` file at the repo root (gitignored, never commit it):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

- `VITE_SUPABASE_URL` — your Supabase project's API URL.
- `VITE_SUPABASE_ANON_KEY` — the Supabase publishable/anon key. It's public and safe to ship in the client; RLS policies (see below) are what actually enforce access control.

Either variable can point at:
- **Local stack** — run `supabase status -o env` after `supabase start` and copy the `API_URL` / `ANON_KEY` values.
- **Hosted project** — copy from the Supabase dashboard under Project Settings → API.

## Local development

```bash
npm install
supabase start          # boots local Postgres/Auth and applies supabase/migrations/
# create .env.local with values from `supabase status -o env` (see above)
npm run dev              # http://localhost:5173
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check, build, and generate the SPA fallback for GitHub Pages |
| `npm run lint` | Run ESLint |
| `npm run test` | Run the Vitest suite |

`npm run test` is green with no Supabase env configured: the RLS isolation test (`src/data/rls.integration.test.ts`) auto-skips via `describe.skipIf` when `VITE_SUPABASE_ANON_KEY` isn't set. To actually run it locally, source local Supabase env first:

```bash
set -a && source <(supabase status -o env) && set +a
VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_ANON_KEY="$ANON_KEY" npx vitest run src/data/rls.integration.test.ts
```

CI (`.github/workflows/test.yml`) runs this the same way, plus a check that every table in `public` has RLS enabled.

## Database

SQL migrations live in `supabase/migrations/`, applied in order (`NNNN_slug.sql`):

- `0001_core_schema.sql` — core schema: profiles, sessions, and per-discipline logging tables (strength sets, climbing sends, cardio activities, calisthenics sets, daily check-ins)
- `0002_reference_and_programs.sql` — reference data (exercises, personal records, goals, templates) and the program-engine tables (programs, program days/exercises, training maxes, program state)
- `0003_grants.sql` — table-level DML grants for the `anon`/`authenticated` roles (RLS restricts rows; Postgres still requires a table-level grant before RLS is evaluated)
- `0004`–`0010` — the `log_workout` / `log_cardio` / `log_climbing` RPCs (atomic, idempotent, `SECURITY DEFINER` writes) and their supporting tables (exercise progress, canonical exercise ids)
- `0011`–`0015` — scheme-type CHECK constraints, climbing attempts, favorite exercises, timed strength sets

Row Level Security is enabled on every table (own-row `auth.uid() = user_id`, or a public-or-own read policy on the shared catalog tables). See [CLAUDE.md](CLAUDE.md#backend-supabase) for the full migration list and the RPC-vs-direct write patterns.

**Migrations are not auto-applied to the hosted database.** CI applies them only to a throwaway local Supabase for the RLS test. After a migration PR merges, apply it to the hosted project manually (Supabase MCP or dashboard).

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`, which builds the app and deploys it to GitHub Pages. It requires two repo secrets: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

The app is a PWA registered with `vite-plugin-pwa` in `prompt` mode: a new deploy is cached but applied only when the user taps the in-app update toast (or hard-refreshes), so returning users get a one-tap update rather than a stale cached bundle.

A daily `keepalive.yml` workflow pings the Supabase REST API to prevent the free-tier project from auto-pausing after a week of inactivity.
