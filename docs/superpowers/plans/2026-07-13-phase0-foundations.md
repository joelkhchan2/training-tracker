# Phase 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployed, authenticated, empty-but-working Progressive Web App (`training-tracker`) on GitHub Pages, backed by a Supabase Postgres database with full Row Level Security, so that any brand-new user can sign in and land in an empty app shell.

**Architecture:** A fresh Vite + React + TypeScript SPA in its own git repo, talking directly to Supabase (Postgres + Auth + RLS) with no custom server. The database schema lives as checked-in Supabase CLI migrations, developed and tested against a local Dockerized Supabase and applied to a hosted project for deploys. CI runs Vitest and deploys the built SPA to GitHub Pages.

**Tech Stack:** Vite 6, React 19, TypeScript 5, Tailwind CSS 4, `@supabase/supabase-js` v2, Supabase CLI (local dev + migrations), `vite-plugin-pwa`, `react-router-dom` v7, Vitest, GitHub Actions.

## Global Constraints

- **Stack (verbatim):** Vite + React + TypeScript + Supabase + Tailwind, PWA, GitHub Pages via Actions. **No Next.js.**
- **RLS on every user-scoped table** — policies AND `ENABLE ROW LEVEL SECURITY` must both be present; a table with policies but RLS not enabled is a security bug.
- **`sessions.client_id`** is unique per user (idempotency); multi-row writes go through a SECURITY DEFINER RPC (built in a later phase; schema must reserve the column now).
- **All timestamps `timestamptz`, stored UTC**, displayed per the user's `profiles.timezone`.
- **Pure-domain rule:** anything under `src/domain/` imports neither React nor Supabase. (No domain code in Phase 0, but the directory and lint boundary are established.)
- **Secrets:** the Supabase **anon key + project URL** are public client config (safe with RLS) and go in Vite env vars (`VITE_` prefix). The **service-role key is never used in the client, never committed, never printed** — it appears only in local `.env` files git-ignored, for later migration scripts.
- **Repo root:** the new repo `training-tracker` at `/Users/joelchan/Library/Mobile Documents/com~apple~CloudDocs/Cursor Projects/training-tracker`. All paths below are relative to that root unless noted.
- **TypeScript everywhere; TDD where there is logic; verification steps for pure infra.**

## Prerequisites (human-only steps — done before the tasks that need them)

These involve your accounts/secrets and cannot be automated. Do them in order; capture the noted values.

1. **Docker Desktop running** — required for `supabase start` (Tasks 4–8) and the CI RLS job.
2. **Create the hosted Supabase project** (before Task 7): in the Supabase dashboard create a project; record its **project ref**, **project URL** (`https://<ref>.supabase.co`), and **anon key**. Used by Google config (Task 7), CI secrets + schema push (Task 10). The service-role key is never used in this plan.
3. **Create a Google Cloud OAuth client** (before Task 7 Step 5): Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client (Web). Set the **Authorized redirect URI** to the Supabase callback `https://<ref>.supabase.co/auth/v1/callback` (this is the Google-side redirect; without it sign-in fails with `redirect_uri_mismatch`). Record the client ID/secret to paste into Supabase (never into the repo or a tool call).

---

### Task 1: Scaffold the Vite + React + TS repo and initialize git

**Files:**
- Create: whole project scaffold via tooling (`package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`)
- Create: `.gitignore`, `.nvmrc`, `README.md`
- Create: `docs/superpowers/specs/2026-07-13-fitness-tracker-rebuild-design.md` (copied from the old repo)
- Create: `docs/superpowers/plans/2026-07-13-phase0-foundations.md` (this file, copied over)

**Interfaces:**
- Produces: a running dev server and a clean git repo at `main`. Later tasks assume `src/` exists and `npm run dev` / `npm run build` work.

- [ ] **Step 1: Create the project with the Vite React-TS template**

```bash
cd "/Users/joelchan/Library/Mobile Documents/com~apple~CloudDocs/Cursor Projects"
npm create vite@latest training-tracker -- --template react-ts
cd training-tracker
npm install
```

- [ ] **Step 2: Pin Node and verify the toolchain**

```bash
node -v > .nvmrc   # record the local Node major (must be >= 20 for Vite 6)
npm run build
```
Expected: `npm run build` completes and emits `dist/`.

- [ ] **Step 3: Copy the spec and this plan into the new repo**

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
SRC="/Users/joelchan/Library/Mobile Documents/com~apple~CloudDocs/Cursor Projects/Fitness App/docs/superpowers"
cp "$SRC/specs/2026-07-13-fitness-tracker-rebuild-design.md" docs/superpowers/specs/
cp "$SRC/plans/2026-07-13-phase0-foundations.md" docs/superpowers/plans/
```

- [ ] **Step 4: Write `.gitignore` additions for env + Supabase**

Append to the generated `.gitignore`:
```gitignore
# Env / secrets
.env
.env.local
.env.*.local

# Supabase local
supabase/.branches
supabase/.temp
**/.DS_Store
```

- [ ] **Step 5: Initialize git and make the first commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Vite + React + TS project"
```
Expected: one commit on `main`.

---

### Task 2: Establish folder structure, Tailwind, and the pure-domain lint boundary

**Files:**
- Create: `src/domain/.gitkeep`, `src/data/.gitkeep`, `src/features/.gitkeep`, `src/components/.gitkeep`, `src/lib/.gitkeep`
- Create: `src/index.css` (Tailwind entry), modify `src/main.tsx` (import it)
- Modify: `vite.config.ts` (Tailwind plugin)
- Create: `eslint.config.js` rule restricting `src/domain/` imports
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `npm run lint`, `npm run test` scripts; the directory layout every later feature uses; a lint rule failing any React/Supabase import under `src/domain/`.

- [ ] **Step 1: Install Tailwind 4 (Vite plugin) and Vitest**

```bash
npm install tailwindcss @tailwindcss/vite
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @types/node
```

- [ ] **Step 2: Wire Tailwind into Vite**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

`src/index.css`:
```css
@import "tailwindcss";
```

Add `import './index.css'` to the top of `src/main.tsx`.

- [ ] **Step 3: Create the source directory skeleton**

```bash
mkdir -p src/domain src/data src/features src/components src/lib
touch src/domain/.gitkeep src/data/.gitkeep src/features/.gitkeep src/components/.gitkeep src/lib/.gitkeep
```

- [ ] **Step 4: Add scripts and the domain-purity lint rule**

`package.json` scripts:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "lint": "eslint .",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

In `eslint.config.js`, add an override forbidding framework imports in the domain layer:
```js
{
  files: ['src/domain/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['react', 'react-*', '@supabase/*'],
          message: 'src/domain must stay framework-free (no React/Supabase imports).' },
      ],
    }],
  },
}
```

- [ ] **Step 5: Add a Vitest config and a smoke test**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],   // so future .tsx component tests can transform JSX
  test: { environment: 'jsdom', globals: true, setupFiles: [] },
})
```

`src/domain/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
describe('toolchain', () => {
  it('runs vitest', () => { expect(1 + 1).toBe(2) })
})
```

- [ ] **Step 6: Verify lint and tests pass**

Run: `npm run lint && npm run test`
Expected: lint clean; 1 test passes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add Tailwind, Vitest, domain-purity lint boundary, folder structure"
```

---

### Task 3: Configure GitHub Pages base path and SPA deep-link fallback

**Files:**
- Modify: `vite.config.ts` (`base`)
- Create: `scripts/make-spa-fallback.mjs` (copies `dist/index.html` → `dist/404.html`)
- Modify: `package.json` (build runs the fallback)

**Interfaces:**
- Consumes: the Vite build from Task 1.
- Produces: a build whose asset URLs resolve under `/training-tracker/` and whose deep links survive a hard refresh on Pages. Later CI deploy relies on this.

Rationale: the grocery-list-app precedent was bundler-less with relative paths and no router, so it never needed these; Vite on a project-Pages subpath requires an explicit `base`, and a client router needs a 404 fallback because Pages has no server rewrite.

- [ ] **Step 1: Set the base path (env-driven so a future custom domain flips it)**

`vite.config.ts` — add `base`:
```ts
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/training-tracker/' : '/',
  plugins: [react(), tailwindcss()],
}))
```

- [ ] **Step 2: Write the SPA fallback generator**

`scripts/make-spa-fallback.mjs`:
```js
import { copyFileSync } from 'node:fs'
copyFileSync('dist/index.html', 'dist/404.html')
console.log('Wrote dist/404.html (SPA deep-link fallback)')
```

- [ ] **Step 3: Run the fallback as part of build**

`package.json`:
```json
"build": "tsc -b && vite build && node scripts/make-spa-fallback.mjs",
```

- [ ] **Step 4: Verify the production build**

Run: `npm run build`
Expected: `dist/404.html` exists and `dist/index.html` references assets under `/training-tracker/`.
Verify: `grep -q "/training-tracker/" dist/index.html && test -f dist/404.html && echo OK`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "build: set Pages base path and SPA 404 fallback"
```

---

### Task 4: Initialize Supabase locally and author the core schema migration with RLS

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `supabase/migrations/0001_core_schema.sql`

**Interfaces:**
- Produces: the `profiles`, `sessions`, `strength_sets`, `climbing_sends`, `cardio_activities`, `calisthenics_sets`, `daily_checkins` tables with RLS. Later tasks/phases consume these table + column names exactly as written here.

- [ ] **Step 1: Initialize Supabase and start the local stack**

```bash
supabase init
# Disable local email confirmation so the Task 6 RLS test can sign users in:
# in supabase/config.toml, under [auth.email], set enable_confirmations = false
supabase start
```
Expected: local API URL + anon/service keys printed (local only, safe). Requires Docker running (Prerequisites #1).

- [ ] **Step 2: Create the core schema migration**

`supabase/migrations/0001_core_schema.sql`:
```sql
-- Shared trigger to maintain updated_at
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- PROFILES: one row per auth user
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  units text not null default 'lbs' check (units in ('lbs','kg')),
  enabled_disciplines text[] not null default array['strength'],
  experience_level text check (experience_level in ('beginner','intermediate','advanced')),
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "own profile - select" on profiles for select using (auth.uid() = id);
create policy "own profile - insert" on profiles for insert with check (auth.uid() = id);
create policy "own profile - update" on profiles for update using (auth.uid() = id);
create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- SESSIONS
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  discipline text not null check (discipline in ('strength','climbing','cardio','calisthenics')),
  session_type text,
  date date not null default current_date,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  duration_minutes integer,
  body_weight numeric,
  program_variant text,
  program_week integer,
  notes text,
  status text not null default 'active' check (status in ('active','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index on sessions(user_id, date desc);
alter table sessions enable row level security;
create policy "own sessions - all" on sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger sessions_updated before update on sessions
  for each row execute function set_updated_at();

-- STRENGTH SETS
create table strength_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  exercise_id uuid,               -- FK added in Task 5 (after exercises exists)
  set_number integer not null,
  weight numeric,
  reps integer,
  rpe numeric,
  is_warmup boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
create index on strength_sets(session_id);
alter table strength_sets enable row level security;
create policy "own strength_sets - all" on strength_sets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- CLIMBING SENDS
create table climbing_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  grade_system text not null default 'v_scale' check (grade_system in ('v_scale','font')),
  grade text not null,
  count integer not null default 0,
  created_at timestamptz not null default now()
);
create index on climbing_sends(session_id);
alter table climbing_sends enable row level security;
create policy "own climbing_sends - all" on climbing_sends for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- CARDIO ACTIVITIES
create table cardio_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  activity text not null,
  duration_minutes integer,
  distance_km numeric,
  notes text,
  created_at timestamptz not null default now()
);
create index on cardio_activities(session_id);
alter table cardio_activities enable row level security;
create policy "own cardio_activities - all" on cardio_activities for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- CALISTHENICS SETS (generalized GTG) — date-based, not session-based
create table calisthenics_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  date date not null default current_date,
  exercise text not null,
  value numeric not null,
  logged_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index on calisthenics_sets(user_id, date desc);
alter table calisthenics_sets enable row level security;
create policy "own calisthenics_sets - all" on calisthenics_sets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- DAILY CHECK-INS
create table daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  body_weight numeric,
  sleep_hours numeric,
  sleep_quality integer check (sleep_quality between 1 and 10),
  energy integer check (energy between 1 and 10),
  soreness integer check (soreness between 1 and 10),
  steps integer,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
alter table daily_checkins enable row level security;
create policy "own daily_checkins - all" on daily_checkins for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 3: Apply the migration to the local DB**

```bash
supabase migration up
```
Expected: migration `0001_core_schema` applied with no errors.

- [ ] **Step 4: Verify RLS is enabled on every new table (not just policies present)**

Run (local Supabase Postgres is on port 54322; the Supabase CLI has no `db execute` subcommand, so use `psql`):
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity;"
```
Expected: zero rows (every public table has RLS enabled).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): core schema (profiles, sessions, logging tables) with RLS"
```

---

### Task 5: Add reference + program-engine tables, and the strength_sets → exercises FK

**Files:**
- Create: `supabase/migrations/0002_reference_and_programs.sql`

**Interfaces:**
- Consumes: `strength_sets` from Task 4 (adds its `exercise_id` FK).
- Produces: `exercises`, `personal_records`, `goals`, `templates`, `programs`, `program_days`, `program_exercises`, `training_maxes`, `program_state`. Column names here are the contract for the program engine (Phase 2).

- [ ] **Step 1: Write the reference + program migration**

`supabase/migrations/0002_reference_and_programs.sql`:
```sql
-- EXERCISES: global catalog (user_id null) + per-user custom rows
create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,  -- null = global catalog
  name text not null,
  primary_muscles text,
  equipment text,
  movement_pattern text,
  exercise_type text check (exercise_type in ('weighted','bodyweight','timed')),
  popularity integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on exercises(user_id);
alter table exercises enable row level security;
-- Read: global rows OR your own custom rows
create policy "exercises - read global or own" on exercises for select
  using (user_id is null or auth.uid() = user_id);
-- Write: only your own custom rows (global rows are migration/service-role only)
create policy "exercises - insert own" on exercises for insert
  with check (auth.uid() = user_id);
create policy "exercises - update own" on exercises for update
  using (auth.uid() = user_id);
create policy "exercises - delete own" on exercises for delete
  using (auth.uid() = user_id);

-- Now that exercises exists, add the FK on strength_sets
alter table strength_sets
  add constraint strength_sets_exercise_fk
  foreign key (exercise_id) references exercises(id);

-- PERSONAL RECORDS (materialized cache, recomputed by domain logic)
create table personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid references exercises(id),
  pr_type text not null,
  value numeric not null,
  reps integer,
  weight numeric,
  date_achieved timestamptz not null default now(),
  previous_value numeric,
  session_id uuid references sessions(id) on delete set null,
  unique (user_id, exercise_id, pr_type)
);
alter table personal_records enable row level security;
create policy "own PRs - all" on personal_records for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- GOALS
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  type text not null check (type in ('e1rm','pullups','custom')),
  metric_key text,
  target numeric,
  current numeric,
  achieved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table goals enable row level security;
create policy "own goals - all" on goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- TEMPLATES (presets have user_id null)
create table templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  exercises jsonb not null default '[]'::jsonb,
  is_preset boolean not null default false,
  created_at timestamptz not null default now()
);
alter table templates enable row level security;
create policy "templates - read preset or own" on templates for select
  using (is_preset or auth.uid() = user_id);
create policy "templates - write own" on templates for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- PROGRAMS (library presets have user_id null, is_public true)
create table programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  discipline text not null default 'strength',
  progression_rule jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
alter table programs enable row level security;
create policy "programs - read public or own" on programs for select
  using (is_public or auth.uid() = user_id);
create policy "programs - write own" on programs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  name text not null,
  order_index integer not null default 0
);
alter table program_days enable row level security;
create policy "program_days - read via program" on program_days for select
  using (exists (select 1 from programs p where p.id = program_id
                 and (p.is_public or p.user_id = auth.uid())));
create policy "program_days - write via own program" on program_days for all
  using (exists (select 1 from programs p where p.id = program_id and p.user_id = auth.uid()))
  with check (exists (select 1 from programs p where p.id = program_id and p.user_id = auth.uid()));

create table program_exercises (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references program_days(id) on delete cascade,
  exercise_id uuid references exercises(id),
  role_key text,
  order_index integer not null default 0,
  scheme jsonb not null
);
alter table program_exercises enable row level security;
create policy "program_exercises - read via day" on program_exercises for select
  using (exists (
    select 1 from program_days d join programs p on p.id = d.program_id
    where d.id = program_day_id and (p.is_public or p.user_id = auth.uid())));
create policy "program_exercises - write via own" on program_exercises for all
  using (exists (
    select 1 from program_days d join programs p on p.id = d.program_id
    where d.id = program_day_id and p.user_id = auth.uid()))
  with check (exists (
    select 1 from program_days d join programs p on p.id = d.program_id
    where d.id = program_day_id and p.user_id = auth.uid()));

-- TRAINING MAXES (per-user, generic keys)
create table training_maxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value numeric not null,
  prev_value numeric,
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);
alter table training_maxes enable row level security;
create policy "own training_maxes - all" on training_maxes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- PROGRAM STATE (per-user cursor)
create table program_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_program_id uuid references programs(id) on delete set null,
  cursor jsonb not null default '{"day":0,"week":1,"cycle":1}'::jsonb,
  last_advance_key text,
  updated_at timestamptz not null default now()
);
alter table program_state enable row level security;
create policy "own program_state - all" on program_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Apply and re-verify RLS coverage**

```bash
supabase migration up
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity;"
```
Expected: migration applies; RLS query returns zero rows.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): reference + program-engine tables, strength_sets->exercises FK"
```

---

### Task 6: Prove RLS isolates users (integration test against local Supabase)

**Files:**
- Create: `src/data/supabase.ts` (typed client factory)
- Create: `src/data/rls.integration.test.ts`
- Create: `.env.local` (local Supabase URL + anon key — git-ignored)
- Create: `.env.example` (documented placeholders, committed)

**Interfaces:**
- Consumes: local Supabase from Tasks 4–5.
- Produces: `getSupabase()` client factory used by all later data code; a passing test that user A cannot read user B's `sessions`.

- [ ] **Step 1: Install the client and write the factory**

```bash
npm install @supabase/supabase-js
```

`src/data/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export function getSupabase() {
  if (!url || !anonKey) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return createClient(url, anonKey)
}
```

- [ ] **Step 2: Create env files from the local `supabase start` output**

`.env.example` (committed):
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your-local-anon-key
```
`.env.local` (git-ignored): paste the **local** URL + anon key printed by `supabase start` (these are local-only dev keys, safe). Do NOT put the service-role key here.

- [ ] **Step 3: Write the failing RLS isolation test**

`src/data/rls.integration.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anon = process.env.VITE_SUPABASE_ANON_KEY!

async function makeUser(email: string) {
  const c = createClient(url, anon)
  await c.auth.signUp({ email, password: 'passw0rd!' })
  const { data } = await c.auth.signInWithPassword({ email, password: 'passw0rd!' })
  return { client: c, userId: data.user!.id }
}

describe('RLS isolation', () => {
  it('user A cannot read user B rows', async () => {
    const a = await makeUser(`a_${Date.now()}@test.dev`)
    const b = await makeUser(`b_${Date.now()}@test.dev`)

    await a.client.from('sessions').insert({
      user_id: a.userId, client_id: 'c1', discipline: 'strength',
    })

    const { data: bSeesA } = await b.client
      .from('sessions').select('*').eq('user_id', a.userId)
    expect(bSeesA).toEqual([])   // B must see none of A's rows
  })
})
```

- [ ] **Step 4: Run it to confirm it fails without env / passes with RLS**

Source the CLI's env output (robust to quoting) and run the test:
```bash
set -a && source <(supabase status -o env) && set +a
VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
  npx vitest run src/data/rls.integration.test.ts
```
Expected: PASS (B sees zero of A's rows). Notes: email confirmation must already be off locally (set in Task 4 Step 1). If the variable names printed by `supabase status -o env` differ from `API_URL`/`ANON_KEY`, run it once to check and adjust.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(db): prove RLS isolates users; add supabase client factory + env example"
```

---

### Task 7: Google auth, session context, protected routing, and auto-create profile

**Files:**
- Create: `src/lib/AuthProvider.tsx`, `src/lib/useAuth.ts`
- Create: `src/features/auth/LoginPage.tsx`, `src/features/auth/AuthCallback.tsx`
- Create: `src/features/home/HomePage.tsx` (empty shell)
- Create: `src/routes.tsx`; modify `src/App.tsx`, `src/main.tsx`
- Modify: `supabase/config.toml` (enable Google provider locally, optional) / hosted dashboard step documented

**Interfaces:**
- Consumes: `getSupabase()` (Task 6).
- Produces: `useAuth()` returning `{ session, user, loading, signInWithGoogle, signOut }`; a route guard redirecting unauthenticated users to `/login`; a `profiles` row created on first authenticated load.

- [ ] **Step 1: Install the router**

```bash
npm install react-router-dom
```

- [ ] **Step 2: Auth context provider**

`src/lib/AuthProvider.tsx`:
```tsx
import { createContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase } from '../data/supabase'

type AuthValue = {
  session: Session | null; user: User | null; loading: boolean
  signInWithGoogle: () => Promise<void>; signOut: () => Promise<void>
}
export const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [supabase])

  const value: AuthValue = {
    session, user: session?.user ?? null, loading,
    signInWithGoogle: async () => {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}auth/callback` },
      })
    },
    signOut: async () => { await supabase.auth.signOut() },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
```

`src/lib/useAuth.ts`:
```ts
import { useContext } from 'react'
import { AuthContext } from './AuthProvider'
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
```

- [ ] **Step 3: Login page, callback, empty home**

`src/features/auth/LoginPage.tsx`:
```tsx
import { useAuth } from '../../lib/useAuth'
export function LoginPage() {
  const { signInWithGoogle } = useAuth()
  return (
    <main className="min-h-dvh grid place-items-center">
      <button onClick={signInWithGoogle}
        className="rounded-lg px-4 py-2 bg-black text-white">Sign in with Google</button>
    </main>
  )
}
```

`src/features/auth/AuthCallback.tsx`:
```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
export function AuthCallback() {
  const { session, loading } = useAuth()
  const nav = useNavigate()
  useEffect(() => { if (!loading) nav(session ? '/' : '/login', { replace: true }) }, [loading, session, nav])
  return <p className="p-6">Signing you in…</p>
}
```

`src/features/home/HomePage.tsx`:
```tsx
import { useAuth } from '../../lib/useAuth'
export function HomePage() {
  const { user, signOut } = useAuth()
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Training Tracker</h1>
      <p className="text-sm text-neutral-500">Signed in as {user?.email}</p>
      <p className="text-neutral-400">No workouts yet. Logging arrives in Phase 2.</p>
      <button onClick={signOut} className="text-sm underline">Sign out</button>
    </main>
  )
}
```

- [ ] **Step 4: Routes with a guard + profile bootstrap**

`src/routes.tsx`:
```tsx
import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './lib/useAuth'
import { getSupabase } from './data/supabase'
import { LoginPage } from './features/auth/LoginPage'
import { AuthCallback } from './features/auth/AuthCallback'
import { HomePage } from './features/home/HomePage'

function Protected({ children }: { children: ReactNode }) {
  const { session, loading, user } = useAuth()
  useEffect(() => {
    if (user) {
      const s = getSupabase()
      s.from('profiles').upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true }).then(() => {})
    }
  }, [user])
  if (loading) return <p className="p-6">Loading…</p>
  return session ? <>{children}</> : <Navigate to="/login" replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/" element={<Protected><HomePage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

`src/App.tsx`:
```tsx
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/AuthProvider'
import { AppRoutes } from './routes'
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider><AppRoutes /></AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 5: Configure Google OAuth (manual, documented)**

Using the Google Cloud OAuth client from Prerequisites #3: in the **hosted** Supabase dashboard → Authentication → Providers → Google, enable it and paste that client's ID/secret. Then under Authentication → URL Configuration add the app redirect URLs `https://joelkhchan2.github.io/training-tracker/auth/callback` and `http://localhost:5173/auth/callback`. (The Google-side Authorized redirect URI — the Supabase `https://<ref>.supabase.co/auth/v1/callback` — was set in Prerequisites #3; without it sign-in fails with `redirect_uri_mismatch`.) All entered in the dashboard; the client secret never touches the repo or a tool call.

- [ ] **Step 6: Verify locally**

Run `npm run dev`. Signed out, confirm you are redirected to `/login`. Full Google sign-in is configured only on the hosted project (Prerequisites #2/#3, Task 7 Step 5), so end-to-end sign-in + profile bootstrap is verified in Task 10 against the deployed app. To exercise the bootstrap locally without Google, create a test user in Supabase Studio (Auth) or reuse the Task 6 email/password flow, load the app, then:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, onboarding_complete from profiles;"
```
Expected: one row for that user.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): Google sign-in, session context, protected routing, profile bootstrap"
```

---

### Task 8: Minimal onboarding shell writing to `profiles`

**Files:**
- Create: `src/features/onboarding/OnboardingPage.tsx`
- Modify: `src/routes.tsx` (route + redirect when `onboarding_complete` is false)

**Interfaces:**
- Consumes: `profiles` table, `useAuth()`.
- Produces: an authenticated user with `onboarding_complete=true` after setting units, timezone, and enabled disciplines. Later phases read `profiles.units` / `enabled_disciplines`.

- [ ] **Step 1: Onboarding form**

`src/features/onboarding/OnboardingPage.tsx`:
```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../../data/supabase'
import { useAuth } from '../../lib/useAuth'

const DISCIPLINES = ['strength','climbing','cardio','calisthenics'] as const

export function OnboardingPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [units, setUnits] = useState<'lbs'|'kg'>('lbs')
  const [enabled, setEnabled] = useState<string[]>(['strength'])

  async function finish() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    await getSupabase().from('profiles').update({
      units, timezone: tz, enabled_disciplines: enabled, onboarding_complete: true,
    }).eq('id', user!.id)
    nav('/', { replace: true })
  }

  return (
    <main className="p-6 space-y-4 max-w-md mx-auto">
      <h1 className="text-lg font-semibold">Set up your tracker</h1>
      <label className="block">Units
        <select value={units} onChange={e => setUnits(e.target.value as 'lbs'|'kg')}
          className="mt-1 block border rounded p-2">
          <option value="lbs">lbs</option><option value="kg">kg</option>
        </select>
      </label>
      <fieldset className="space-y-1">
        <legend>Disciplines</legend>
        {DISCIPLINES.map(d => (
          <label key={d} className="flex gap-2 items-center">
            <input type="checkbox" checked={enabled.includes(d)}
              onChange={e => setEnabled(s => e.target.checked ? [...s, d] : s.filter(x => x !== d))} />
            {d}
          </label>
        ))}
      </fieldset>
      <button onClick={finish} disabled={enabled.length === 0}
        className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-40">Finish</button>
    </main>
  )
}
```

- [ ] **Step 2: Route to onboarding until complete**

Replace `Protected` and `AppRoutes` in `src/routes.tsx` with the full version below (upserts the profile, reads `onboarding_complete`, and gates routing on it), and register the `/onboarding` route:

```tsx
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './lib/useAuth'
import { getSupabase } from './data/supabase'
import { LoginPage } from './features/auth/LoginPage'
import { AuthCallback } from './features/auth/AuthCallback'
import { HomePage } from './features/home/HomePage'
import { OnboardingPage } from './features/onboarding/OnboardingPage'

function Protected({ children }: { children: ReactNode }) {
  const { session, loading, user } = useAuth()
  const location = useLocation()
  const [onboarded, setOnboarded] = useState<boolean | null>(null)

  useEffect(() => {
    if (!user) return
    const s = getSupabase()
    ;(async () => {
      await s.from('profiles').upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true })
      const { data } = await s.from('profiles').select('onboarding_complete').eq('id', user.id).single()
      setOnboarded(Boolean(data?.onboarding_complete))
    })()
  }, [user])

  if (loading) return <p className="p-6">Loading…</p>
  if (!session) return <Navigate to="/login" replace />
  if (onboarded === null) return <p className="p-6">Loading…</p>
  if (!onboarded && location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/onboarding" element={<Protected><OnboardingPage /></Protected>} />
      <Route path="/" element={<Protected><HomePage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 3: Verify the flow**

Run: `npm run dev`; a fresh account is sent to `/onboarding`, finishing returns to Home; verify:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select units, enabled_disciplines, onboarding_complete from profiles;"
```
Expected: the chosen values; `onboarding_complete = t`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(onboarding): units/timezone/disciplines shell writing to profiles"
```

---

### Task 9: PWA baseline (installable + offline shell)

**Files:**
- Modify: `vite.config.ts` (add `vite-plugin-pwa`)
- Create: `public/` icons (192, 512) placeholders

**Interfaces:**
- Produces: a production build that registers a service worker and is installable. Offline write queues come in later phases; this establishes the manifest + SW.

- [ ] **Step 1: Install the plugin**

```bash
npm install -D vite-plugin-pwa
```

- [ ] **Step 2: Configure it**

`vite.config.ts` — add to plugins:
```ts
import { VitePWA } from 'vite-plugin-pwa'
// ...
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Training Tracker', short_name: 'Training',
    theme_color: '#000000', background_color: '#000000', display: 'standalone',
    start_url: '/training-tracker/', scope: '/training-tracker/',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
}),
```

- [ ] **Step 3: Add placeholder icons**

Place any 192×192 and 512×512 PNGs at `public/icon-192.png` and `public/icon-512.png`.

- [ ] **Step 4: Verify the SW is emitted**

Run: `npm run build`
Expected: `dist/sw.js` and `dist/manifest.webmanifest` exist. Verify: `test -f dist/sw.js && test -f dist/manifest.webmanifest && echo OK`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(pwa): installable manifest + service worker baseline"
```

---

### Task 10: GitHub repo, CI (tests + Pages deploy + Supabase keepalive), go live

**Files:**
- Create: `.github/workflows/test.yml`
- Create: `.github/workflows/deploy-pages.yml`
- Create: `.github/workflows/keepalive.yml`

**Interfaces:**
- Consumes: the build (Task 3/9), tests (Task 2/6).
- Produces: a live app at `https://joelkhchan2.github.io/training-tracker/`; green CI on push.

- [ ] **Step 1: Create the GitHub repo and push (uses gh; account joelkhchan2)**

```bash
gh repo create joelkhchan2/training-tracker --public --source=. --remote=origin --push
```
Expected: repo created, `main` pushed.

- [ ] **Step 2: Test workflow — a `test` job (lint + unit tests, excluding integration) and an `rls` job that boots a local Supabase and runs the RLS checks**

`.github/workflows/test.yml`:
```yaml
name: test
on: { push: { branches: [main] }, pull_request: {} }
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npx vitest run --exclude '**/*.integration.test.ts'
  rls:
    # Boots a local Supabase and enforces RLS in CI (isolation test + every-table-RLS-enabled check)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase start
      - name: Every public table has RLS enabled
        run: |
          N=$(psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc "select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity;")
          test "$N" = "0" || (echo "::error::$N public table(s) missing RLS" && exit 1)
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - name: RLS isolation test
        run: |
          set -a && source <(supabase status -o env) && set +a
          VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
            npx vitest run src/data/rls.integration.test.ts
```
(`psql` is preinstalled on the `ubuntu-latest` runner; `supabase start` uses the runner's Docker.)

- [ ] **Step 3: Pages deploy workflow**

`.github/workflows/deploy-pages.yml`:
```yaml
name: deploy-pages
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Link the hosted project and push the schema**

The hosted project (Prerequisites #2) must have the migrations applied **before any deploy**, or the app's first-load profile-bootstrap write fails silently against an empty DB.

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```
Expected: migrations `0001`/`0002` apply to the hosted project. Verify the tables exist in the Supabase dashboard → Table editor (this avoids handling the hosted DB password locally).

- [ ] **Step 5: Set repo secrets (hosted URL + anon key) and enable Pages**

```bash
gh secret set VITE_SUPABASE_URL --repo joelkhchan2/training-tracker
gh secret set VITE_SUPABASE_ANON_KEY --repo joelkhchan2/training-tracker
```
Enter the **hosted** project URL + anon key when prompted (anon key is public-safe). Then in repo Settings → Pages, set Source = GitHub Actions.

- [ ] **Step 6: Keepalive workflow (prevents Supabase free-tier pausing)**

`.github/workflows/keepalive.yml`:
```yaml
name: keepalive
on:
  schedule: [{ cron: '17 6 * * *' }]   # once daily; free tier pauses after ~7 days idle
  workflow_dispatch: {}
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS "$SUPABASE_URL/rest/v1/exercises?select=id&limit=1" \
            -H "apikey: $SUPABASE_ANON_KEY" -o /dev/null && echo "pinged"
        env:
          SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```
NOTE: Supabase free tier pauses after ~7 days of inactivity, so a daily ping comfortably beats it. Verify the current policy during execution.

- [ ] **Step 7: Commit, push, verify live**

```bash
git add -A
git commit -m "ci: tests, Pages deploy, Supabase keepalive"
git push
```
Expected: Actions go green; `https://joelkhchan2.github.io/training-tracker/` loads, redirects to Google sign-in, and a fresh Google account reaches onboarding then the empty Home. Deep-link refresh (e.g. `/training-tracker/login`) does not 404 (confirms the SPA fallback).

---

## Phase 0 Definition of Done

- A stranger with a Google account can visit the live URL, sign in, complete onboarding, and see an empty Home — with zero seeded data.
- Every public table has RLS enabled; the RLS isolation test + "all-tables-RLS-enabled" check pass **in CI** (and locally).
- CI is green (lint + unit tests + the RLS job); Pages deploy and keepalive workflows run.
- No secrets are committed; only the public anon key + URL live in repo secrets / `.env.local`.
- The seed-user migration (Joel's history) is explicitly **out of scope here** and is the next plan.
