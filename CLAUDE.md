# CLAUDE.md — working guide for training-tracker

Orientation for AI agents (and humans) working in this repo. Read this before making changes. It covers what the app is, how the code is laid out, the backend model, how to build/test/ship, and the conventions and gotchas that are not obvious from the code.

## What this is

A general multi-discipline training tracker (strength, climbing, cardio) for logging workouts, running strength programs, and tracking PRs. It is a client-only React PWA backed by Supabase, installable and deployed to GitHub Pages.

- **Live app:** https://joelkhchan2.github.io/training-tracker/
- **GitHub:** `joelkhchan2/training-tracker`
- **Disciplines with a shipped UI:** strength, climbing, cardio. `calisthenics` and `daily_checkins` exist as DB tables and in the `Discipline` type (`src/domain/types.ts`) but have **no feature folder or route yet**, so they are not user-reachable. Do not assume a working calisthenics flow exists.

### Two-repo split (important)

Design specs and implementation plans are authored in a **separate** planning repo ("Fitness App", `docs/superpowers/{specs,plans}/` there). The code lives here. Both share one hosted Supabase project.

The split is not absolute: this repo also carries a `docs/superpowers/` directory with a few early scaffold docs plus the `gabrielle-workout-preset` spec that was added here directly. If you author a spec/plan for a training-tracker-only change, prefer the planning repo for consistency, but check both places when looking for prior design context.

## Tech stack

- **Vite 8** + **React 19** + **TypeScript 6** (strict), ESM (`"type": "module"`).
- **Tailwind CSS 4**, CSS-first config: `@import "tailwindcss"` and a `@theme { ... }` block in `src/index.css` map raw CSS custom properties to Tailwind tokens. There is **no `tailwind.config.js`**.
- **Zustand 5** for local UI state (prefs, rest timer, in-progress session).
- **@tanstack/react-query 5** for all server state (Supabase reads/mutations).
- **react-router-dom 7**.
- **@supabase/supabase-js 2** (Postgres + Auth + RLS).
- **@dnd-kit** for drag-reorder (workout set list, program builder).
- **@fontsource-variable/inter** (self-hosted Inter, bundled by Vite).
- **clsx** + **tailwind-merge** via `src/lib/cn.ts`.
- **vitest 4** + **@testing-library/react** + **jsdom** for tests.
- **eslint 10** (flat config) + **typescript-eslint** + react-hooks + react-refresh plugins.
- **vite-plugin-pwa 1** for the service worker/manifest.
- Node pinned to `v22.21.1` (`.nvmrc`); Node ≥ 20 works.

## Architecture and layering

`src/` is layered. Dependencies flow one way: `features` and `components` build on `data` and `domain`; `data` builds on `domain`; `domain` depends on nothing framework-specific.

- **`src/domain/`** — pure TypeScript. No React, no Supabase. This isolation is **lint-enforced**: `eslint.config.js` has a `no-restricted-imports` rule scoped to `src/domain/**` that blocks `react`, `react-*`, and `@supabase/*`. Holds the program engine (`programEngine.ts`, `types.ts`), e1RM (`oneRepMax.ts`), PR detection (`prDetection.ts`), weight conversion (`weight.ts`), timed-set/duration helpers (`duration.ts`), climbing grades (`climbing.ts`), cardio pace (`cardio.ts`), linear progression (`linearProgression.ts`), program draft helpers (`programDraft.ts`), and `presets/` (bundled programs). `domain/index.ts` is the public barrel.
- **`src/data/`** — the Supabase boundary. The client (`supabase.ts`), react-query hooks and mutations (`queries.ts`, `mutations.ts`, `logCardio.ts`, `logClimbing.ts`, `personalRecords.ts`, `sessionHistory.ts`, `sessionDetail.ts`, `activateProgram.ts`, `saveProgram.ts`, and more), the exercise catalog/canonicalization helpers, `profile.ts`, and `types.ts` (DB row shapes). `normalizeScheme` (in `queries.ts`) is the single DB→domain coercion boundary for program schemes.
- **`src/features/`** — one folder per screen/flow: `auth`, `home`, `onboarding`, `workout` (largest: session logging, rest timer, exercise picker/history, drag-reorder, summary), `programs` (builder, activate, preview), `history`, `progress` (PR list + 1RM calculator), `cardio`, `climbing`, `settings` (prefs UI), `shell` (layout + bottom nav).
- **`src/components/ui/`** — shared primitives: `Button`, `Card`, `TextField`, `NumberField`, `WeightField`, `DurationField`, `Select`, `CompactSelect`, `Textarea`, `AppShell`. `src/components/` root holds the PWA `UpdatePrompt`/`UpdateToast`.
- **`src/lib/`** — cross-cutting glue: `AuthProvider.tsx` + `authContext.ts` + `useAuth.ts` (Supabase session, Google OAuth), `queryClient.tsx` (react-query provider), `cn.ts`.
- **Root:** `App.tsx` (provider stack + router), `routes.tsx` (route table + the `Protected` auth gate), `main.tsx` (entry; calls `initPrefs()` before render), `index.css` (theme tokens), `test-setup.ts`.

## Key domain concepts

- **Program engine** (`domain/programEngine.ts`, `types.ts`): `Scheme` is a discriminated union of `percentage`, `fixed`, `linear` (AMRAP-driven), and `timed` (duration-only). `getPrescription(program, cursor, maxes, workingWeights?)` produces `PrescribedSet[]`; `advanceCursor` moves the day/week/cycle cursor; progression is applied via `applyProgression` / `applyLinearProgression`.
- **`normalizeScheme`** (`data/queries.ts`): the one place a raw jsonb `scheme` becomes a valid `Scheme`. It defensively downgrades any malformed/unknown shape to an empty `fixed` scheme with a `console.warn` rather than throwing. This is what keeps a bad DB row from white-screening the workout page. There is a DB `CHECK` constraint on the scheme type as well (migrations 0011/0015).
- **Training maxes:** `training_maxes` table, generic `key`→`value` (e.g. `squat`, `benchPress`).
- **e1RM** (`domain/oneRepMax.ts`): Epley, `weight * (1 + reps/30)`; `round1` rounds to 0.1; `percentageTable` builds a load table.
- **PRs are two-layer.** `domain/prDetection.ts` is pure detection for in-session celebration. `data/personalRecords.ts` does display-time reconciliation: it merges materialized `personal_records` rows with live values recomputed from sets and keeps the larger. Climbing `max_v_grade` is the exception: it is written authoritatively by the `log_climbing` RPC server-side, not client-reconciled. When touching PR display, respect this split.
- **Weight units** (`domain/weight.ts`): **lb is canonical** in storage and the DB. `toDisplayWeight`/`fromDisplayWeight` (factor `LB_PER_KG = 0.45359237`) convert only at the render/input boundary; the shared `WeightField` and `formatWeight` are the wrappers. Never persist a converted (kg) value. Non-finite input coerces to 0.
- **Prefs** (`features/settings/prefs.ts` + `usePrefs.ts`): a Zustand store persisted to `localStorage['tt-prefs']` (theme, font family/scale, weightUnit, weekStartDay, rest-timer default/haptics, showRpe). `persistApply` spreads the whole current state before applying a patch (a deliberate fix so a newly-added `Prefs` field is never silently dropped by a hand-enumerated setter). The store is intentionally framework/auth-agnostic. Note: prefs are currently local-only per device (a cross-device sync feature may be in flight; check the planning repo).
- **Themes and fonts** (`index.css` + `index.html`): themes are `[data-theme="id"]` blocks of CSS custom properties in `index.css`, mirrored in the `THEMES` array in `prefs.ts` and in the `THEME_BG` map in the `index.html` boot script. A theme lives in all three; keep them in sync (there is a test asserting every `THEMES` id has a matching `[data-theme]` block). The `index.html` inline boot script reads `localStorage['tt-prefs']` and sets `data-theme`/`--font-scale`/`--font-sans`/`meta[theme-color]` before React mounts, to avoid a flash of the wrong theme. Fonts follow the same three-point pattern (`FONTS` array, boot `FONT` map, plus an `@font-face` — Inter via the `@fontsource-variable/inter` import in `main.tsx`).
- **Presets** (`domain/presets/`): bundled `Program` definitions (5/3/1, StrongLifts, PPL, Starting Strength, Greyskull, and others). Bundled presets, not DB rows, are the intended extension point for app-authored programs; adding one needs no migration.

## Backend (Supabase)

- **Auth:** Google OAuth via Supabase. `AuthProvider` owns the session; `routes.tsx`'s `Protected` gates authenticated routes, upserts a `profiles` row on first login, and forces `/onboarding` until `onboarding_complete`.
- **Env vars** (`data/supabase.ts`, read from `import.meta.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. The client throws if either is missing. The anon key is public and safe to ship; RLS is what enforces access.
- **RLS model:** every table has Row Level Security. The default is own-row: `auth.uid() = user_id` (or `= id` on `profiles`). The catalog-style tables (`exercises`, `programs`, `program_days`, `program_exercises`, `templates`) use a "global/public-or-own" read policy plus own-row write, because they hold both app-global rows (`user_id is null` / `is_public`) and user rows. Table-level `GRANT`s for `anon`/`authenticated` live in `0003_grants.sql` (Postgres checks the grant before RLS).
- **Write patterns, two of them:**
  - **SECURITY DEFINER RPCs** for atomic multi-table writes: `log_workout`, `log_cardio`, `log_climbing`. They are idempotent on a client-generated `p_client_id` (upsert the session, delete-and-reinsert child rows), capture `auth.uid()` server-side, and fold in related updates (e.g. `log_workout` advances `program_state` and applies progression in the same transaction). Called from `data/mutations.ts`, `data/logCardio.ts`, `data/logClimbing.ts`.
  - **Direct `.update()`/`.upsert()`** for simple single-table own-row writes (e.g. `profile.ts`, favorites toggle, `program_state` upserts). No RPC needed when RLS alone is sufficient and there is no cross-table atomicity.
  - Rule of thumb: multi-table or business-logic-heavy → RPC; single own-row field write → direct.

### Migrations

SQL migrations live in `supabase/migrations/`, named `NNNN_slug.sql`, applied in order. Current set:

| File | Purpose |
|---|---|
| `0001_core_schema.sql` | Core tables (profiles, sessions, strength/climbing/cardio/calisthenics logging, daily check-ins) + own-row RLS |
| `0002_reference_and_programs.sql` | Exercises catalog, personal_records, goals, templates, programs/days/exercises, training_maxes, program_state |
| `0003_grants.sql` | Table-level DML grants for anon/authenticated |
| `0004_log_workout_rpc.sql` | `log_workout` RPC (atomic idempotent session+sets) |
| `0005_log_workout_advance.sql` | Folds program_state cursor advance into log_workout |
| `0006_exercise_progress.sql` | `exercise_progress` (working weight + fail streak) + log_workout `p_progress` |
| `0007_program_exercise_names.sql` | Denormalizes exercise name/type onto program_exercises (portability) |
| `0008_exercise_canonical.sql` | `exercises.canonical_id` self-FK (alias/merge) |
| `0009_log_cardio.sql` | `log_cardio` RPC |
| `0010_log_climbing.sql` | `log_climbing` RPC (+ authoritative max-V-grade PR) |
| `0011_scheme_type_check.sql` | CHECK on scheme type (percentage/fixed/linear) |
| `0012_climbing_attempts.sql` | `attempts` on climbing_sends + checks; replaces log_climbing |
| `0013_favorite_exercises.sql` | `favorite_exercises` table, own-row RLS |
| `0014_strength_sets_duration.sql` | `duration_seconds` on strength_sets; replaces log_workout |
| `0015_scheme_type_check_timed.sql` | Widens the scheme-type CHECK to allow `timed` |

**Migrations are NOT auto-applied to the hosted (prod) Supabase.** There is no CI migration step against prod. After a PR merges, a migration must be applied manually via the Supabase MCP (`apply_migration`) or the dashboard. This is called out in the migration files themselves. Confirm before applying anything to prod. CI's `rls` job only applies migrations to a throwaway local Supabase, never the hosted project.

Do not confuse `supabase/migrations/` (the app's schema) with `scripts/migration/` (a one-off Excel→Supabase data importer, its own README, unrelated).

## Testing

- **vitest**, jsdom env, globals on, `src/test-setup.ts` setup. Tests are colocated as `*.test.ts` / `*.test.tsx`.
- **Integration tests** are `*.integration.test.ts` (in `src/data/`: logWorkout, logCardio, logClimbing, personalRecords, rls, schemeTypeCheck, sessionDetail). They need a live Supabase and **self-skip** via `describe.skipIf` when `VITE_SUPABASE_ANON_KEY` is unset, so the default `npm run test` is green with no Supabase config.
- **Current baseline** (non-integration): ~843 passing, ~21 skipped. There are a couple of benign React `act(...)` warnings from `WeightField`/`SessionMetaCard`; test output is otherwise clean.
- **Run focused:** `npx vitest run <path>` (or `npx vitest <path>` for watch). Run the full suite before committing.
- **Run the RLS integration test locally:** `set -a && source <(supabase status -o env) && set +a` then `VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_ANON_KEY="$ANON_KEY" npx vitest run src/data/rls.integration.test.ts`.
- **Flakiness:** under a heavily loaded parallel full-suite run, a few component tests (e.g. BuilderPage, WorkoutPage swap-prefill) can time out; they pass in isolation. Re-run the specific file before treating such a failure as real.

## CI/CD

`.github/workflows/`:

- **`test.yml`** (push to `main` + all PRs): job `test` runs `npm ci` → `npm run lint` → `npx vitest run --exclude '**/*.integration.test.ts'`. Job `rls` boots a local Supabase (`supabase/setup-cli` + `supabase start`), asserts every `public` table has RLS enabled, then runs the integration tests against the local stack.
- **`deploy-pages.yml`** (push to `main`): builds with the Supabase secrets and deploys `dist` to GitHub Pages.
- **`keepalive.yml`** (daily cron): pings the Supabase REST API so the free-tier project does not auto-pause after a week idle.

Deploy target is GitHub Pages under base path `/training-tracker/` (`vite.config.ts` sets `base` in production). The PWA uses `vite-plugin-pwa` with **`registerType: 'prompt'`** (not `autoUpdate`): a new deploy is cached but applied only when the user taps the `UpdateToast` reload prompt, which avoids the stale-bundle-until-reinstall problem the earlier `autoUpdate` config caused.

## Working with the repo

Local setup:

```bash
npm install
supabase start          # local Postgres/Auth; applies supabase/migrations/
# create .env.local with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (from `supabase status -o env`)
npm run dev             # http://localhost:5173
npm run lint && npm run test   # before committing
```

### Branching and worktrees

Always create feature branches in a **git worktree off `origin/main`**, never `git checkout -b` inside the shared main checkout (doing so in the shared checkout has caused stray-commit incidents). Symlink `node_modules` from the main checkout into the new worktree so you do not reinstall:

```bash
git -C <main-checkout> fetch origin main
git -C <main-checkout> worktree add -b feat/<name> <path>/<name> origin/main
ln -s <main-checkout>/node_modules <path>/<name>/node_modules
```

Remove the worktree and branch after the PR merges (`git worktree remove … && git worktree prune && git branch -D …`).

### Pushing / GitHub

The remote is owned by the `joelkhchan2` account. Before pushing, switch the `gh` CLI and re-run its git credential helper, or HTTPS pushes 403 as the wrong account:

```bash
gh auth switch --user joelkhchan2 && gh auth setup-git
```

Use the `gh` CLI for all GitHub operations (PRs, checks, merges). Conventional-commit messages; commit bodies and PR descriptions end with the project's Co-Authored-By / generation trailers.

### Applying a migration to prod

After a migration PR merges, apply it to the hosted Supabase manually (Supabase MCP `apply_migration` or the dashboard). Confirm before running. CI does not do this for you.

## House conventions

- **Domain purity is lint-enforced** (`src/domain/**` cannot import react/supabase). Keep pure logic there and framework code out.
- **No `eslint-disable`.** Refactor instead (e.g. move a non-component export into its own module to satisfy `react-refresh/only-export-components`). There is exactly one accepted exception in the tree today: `src/lib/queryClient.tsx` disables `react-refresh/only-export-components` to co-locate `queryClient` with its provider. Do not add new disables; if you find yourself wanting one, that is the signal to restructure.
- **`react-refresh/only-export-components`:** component files export only components (and their prop types). Non-component helpers get their own module.
- **Tailwind v4 CSS-first:** theme tokens live in `index.css`, not a config file. Use the shared `cn()` for class merging.
- **Weight values at the boundary:** store lb, convert with `weight.ts` only for display/input.
- **Conventional commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- A no-underscore-prefixed-unused-vars habit is followed in practice, but note it is **not** enforced by a lint rule (the `no-unused-vars` config only sets `ignoreRestSiblings`). Editor/format/lint hooks run on save; do not duplicate that work by hand, and fix any hook-reported errors immediately.

## Known issues / things to verify

- **`rls` CI job glob:** `test.yml`'s integration step invokes vitest with a glob that looks like `integration.test.ts` rather than `**/*.integration.test.ts`. Given the actual filenames (`*.integration.test.ts`), verify this pattern actually matches and runs the integration tests before relying on that job as a real gate.
- **`profiles.units` is dead:** written once at onboarding, read nowhere, and stored as `'lbs'` while `Prefs.weightUnit` is `'lb'`. A kg-at-onboarding user still sees lb until they set it in Settings. Reconciling this is the job of the cross-device pref-sync work (check the planning repo for status).
- **Schema-only, no UI:** `calisthenics_sets` and `daily_checkins` tables (and the `calisthenics` discipline in the type) have no feature or route yet.

## Map of key files

- Entry / shell: `src/main.tsx`, `src/App.tsx`, `src/routes.tsx`, `index.html`, `src/index.css`
- Auth: `src/lib/AuthProvider.tsx`, `src/lib/useAuth.ts`, `src/features/auth/`
- Server state: `src/data/supabase.ts`, `src/data/queries.ts`, `src/data/mutations.ts`
- Program engine: `src/domain/programEngine.ts`, `src/domain/types.ts`, `src/data/queries.ts` (`normalizeScheme`)
- Units / e1RM / PRs: `src/domain/weight.ts`, `src/domain/oneRepMax.ts`, `src/domain/prDetection.ts`, `src/data/personalRecords.ts`
- Prefs / theming: `src/features/settings/prefs.ts`, `src/features/settings/usePrefs.ts`, `src/index.css`, `index.html`
- Shared inputs: `src/components/ui/` (`NumberField`, `WeightField`, `DurationField`, `Select`, `CompactSelect`)
- Backend: `supabase/migrations/`, `supabase/config.toml`
- CI: `.github/workflows/{test,deploy-pages,keepalive}.yml`
