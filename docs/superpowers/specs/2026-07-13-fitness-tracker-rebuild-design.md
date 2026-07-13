# Fitness Tracker — General Multi-Discipline Rebuild Design

**Date:** 2026-07-13
**Status:** Approved design (revised after /spec-review + goal change), pending implementation plan
**Author:** Joel Chan (with Claude)

---

## Context

Joel's daily-use app is a **Google Apps Script HTML-service web app backed by one Google Sheet** (script id `1zY2OaCO93bIAyocs8ncEP3chkYREHV0j5vD_Tw-gfLFgr5UJg7xtUMGe`). It is mature (~9,200 lines) and personal: 5/3/1 lifting with an idempotent cycle "slot" state machine, climbing, cardio, a "grease the groove" (GTG) daily tracker, daily check-ins, an 8-tab progress suite, goals, templates, timers, a curated ~700-exercise catalog, offline-tolerant write queues, and stale-while-revalidate caching. It is hardcoded to Joel (seeded PRs, his gyms/schedule, `America/Toronto`, one program).

A prior Next.js + Supabase rebuild (this repo's `frontend/`) **stalled**: over-scoped (40 features, 15 sprints), ran two competing backends at once, never usable. Reference only.

**This rebuild's goal has shifted.** It is no longer "port Joel's personal Sheet." It is a **general, multi-discipline training tracker that anyone can use**, with Joel's proven Sheet logic as the starting point and Joel as user #1.

## Goals

1. **A general product** — a multi-discipline training tracker (strength, climbing, cardio, calisthenics) usable by any new user with zero prior data, not tailored to one person.
2. **Dev workflow** — a real codebase with git/PR/CI; no editor-run scripts, no server/client config duplication, no Sheets quirks.
3. **UX / performance** — fast, installable, offline-capable mobile experience.
4. **Hosting / ownership** — version-controlled on GitHub, hosted, on a custom domain; open to public signup when ready.
5. **Learning / portfolio** — a well-structured, tested project worth showing.

## Non-goals / anti-goals

- **Not Joel-specific.** No seeded personal PRs, gyms, schedule, or hardcoded timezone as app defaults. Joel's data enters only as user #1's migrated rows, never as global defaults.
- **Not out-featuring incumbents.** Hevy/Strong/Liftosaur/Boostcamp exist. The wedge is *percentage-based programs + a clean program builder done well* across disciplines, not feature-count parity with commercial apps.
- **Not a Liftosaur-class logic DSL.** Programs are data-driven config, not a programmable language.
- **Not parity with Joel's Sheet.** Personal-Sheet parity is explicitly abandoned as an exit criterion; v1's bar is the general strength spine (Phases 0–4) usable by a stranger, per the phase plan.
- **Public signup is deferred**, not day-one (see multi-user decision).

## Guiding principles

- **Port the logic, generalize the product.** The Sheet solved the hard domain math (1RM, 5/3/1, PR detection, volume). Reuse that; generalize everything personal.
- **Every feature works in two states: empty (a brand-new stranger) and seeded (Joel).** This replaces "runs on real migrated data" as the correctness bar.
- **Strength is the spine; other disciplines are independent modules.** The general strength product must stand alone and be usable by a stranger. Climbing, cardio, calisthenics/GTG each ship as separable modules so there is never a big-bang.
- **Pure-domain core** in framework-free, fully-tested TypeScript (no React/Supabase imports) — the single source of truth that kills config triplication and stays portable to a future native app.

## Key decisions (locked)

| Decision | Choice |
|---|---|
| Product intent | General, multi-discipline tracker for anyone (not a personal port) |
| Disciplines | Strength (spine) + climbing + cardio + calisthenics/GTG, each a separable module |
| Users | Fully general / multi-user architecture from day 1 (real auth, `user_id` + RLS on every row, onboarding, per-user defaults, preset program library). **Ship to Joel first; open public signup in a later phase.** |
| v1 shippable spine | General **strength** product (Phases 0–4): onboard → pick/build a program → log strength → see progress/PRs. Disciplines and public signup are additive. |
| Build method | Incremental modules, each usable by both an empty and a seeded user; Joel keeps the Sheet as daily driver until his needed modules reach cutover quality |
| Stack | **Vite + React + TypeScript + Supabase + Tailwind**, PWA, GitHub Pages via Actions (+ keepalive). No Next.js. |
| Program model | **Data-driven configurable program engine + a seeded preset library** (now core to the product, not speculative) |
| Joel's data | Migrated as user #1's history (seed), not as app defaults; the app must never depend on it existing |
| Charts / DnD / server-state / session-state | Recharts / dnd-kit / TanStack Query (persisted) / Zustand (persisted) |

Stack rationale draws on prior shipped work: `joelkhchan2/grocery-list-app` (2026-07-12) is a Supabase-backed static PWA on GitHub Pages built with this same spec→plan flow. This follows that deployment recipe, adding React (for genuinely complex UI: forms, charts, drag-reorder) and TypeScript (the old rebuild's worst bugs were type-contract mismatches).

## Architecture

Browser → Supabase JS client → Postgres, RLS scoping every row to `auth.uid()`. No custom backend server, **except** a small set of Postgres RPCs (SECURITY DEFINER) for atomic multi-row writes (see idempotency). Multi-row saves and progression advances go through RPCs; simple reads/writes go direct.

```
src/
  domain/        # pure TS, framework-free, fully unit-tested
  data/          # supabase client, typed queries, RPC wrappers, generated DB types
  features/      # onboarding/ strength/ programs/ progress/ climbing/ cardio/ calisthenics/ goals/ home/ exercises/ settings/
  components/    # shared UI primitives, empty states
  lib/           # hooks, offline queue, cache, PWA
supabase/        # schema.sql, migrations, RPC functions (checked in)
scripts/         # one-time Sheet -> Supabase seed of user #1
docs/superpowers/# spec + plans
.github/workflows/ # pages deploy, tests, supabase keepalive
```

## Data model (Supabase / Postgres)

Normalized relational tables (replacing the Sheet's 33-column mega-row). All user-scoped tables carry `user_id` and RLS (`user_id = auth.uid()` for select/insert/update/delete).

**User / product**
- `profiles` — 1/user: display name, **timezone**, units (lbs/kg), **enabled disciplines** (a stranger who only lifts never sees climbing), onboarding-complete flag, experience level.
- `program_state` — 1/user: active `program_id`, `cursor` (day index + week + cycle), `last_advance_key`.
- `training_maxes` — `user_id`, key (`squat`/`bench`/…), value, prev_value. Generic per-user; no hardcoded lifts.

**Logging**
- `sessions` — 1/workout: date, `session_type`, discipline, start/end, duration, body weight, `program_variant`/`program_week`, status, **`client_id` (unique per user, idempotency)**.
- `strength_sets` — `session_id`, `exercise_id` (FK), set #, weight, reps, rpe, is_warmup, order.
- `climbing_sends` — `session_id`, grade (V-scale and/or font), count. General grade systems, not Joel-specific.
- `cardio_activities` — `session_id`, activity, duration, distance, notes.
- `calisthenics_sets` (generalized GTG) — `user_id`, date, exercise, value, `client_id`. A general frequency/greasing tracker, not Joel's four fixed exercises.
- `daily_checkins` — 1/user/day (unique): body weight, sleep hrs/quality, energy, soreness, steps.

**Reference / derived**
- `exercises` — shared catalog: name, muscles, equipment, movement pattern, `exercise_type`, popularity, `is_active`. **Global rows (`user_id` null)** are the canonical catalog, curated/maintained via migration/service-role only; **users add their own custom exercises** as `user_id`-scoped rows they can rename/edit. (Resolves the review's RLS-write ambiguity: normal users cannot mutate global rows; they own their custom ones.)
- `personal_records` — materialized PR cache, recomputed by domain logic on save.
- `goals` — label, type, metric_key, target, current, achieved.
- `templates` — name, exercises jsonb, is_preset.

**Program engine**
- `programs` — id, `user_id` (null = built-in preset in the shared **library**), name, description, discipline, `progression_rule` (jsonb), is_public.
- `program_days` — `program_id`, name, order_index.
- `program_exercises` — `program_day_id`, `exercise_id` or role key, order_index, `scheme` (jsonb).

**Schema fixes carried from the review**
1. Exercises have real IDs; sets FK to `exercise_id` (kills the name-migration class). Global catalog is admin/migration-maintained; user custom rows are user-owned.
2. e1RM is **computed** in `domain/oneRepMax.ts`, never stored as a duplicated formula.
3. `client_id` unique on **`sessions`** (not just calisthenics) so a double-tapped workout save can't duplicate.
4. Program state is per-user; no global program singleton.

**`scheme` (jsonb per program exercise)** — sets are **enumerated explicitly** (fixing the review's FSL-count gap: 3-vs-2 First-Set-Last sets differ per lift and can't be a single `fsl?` flag):
- `fixed` → `{ sets: [ {reps:5, rpe?:8}, … ] }`
- `percentage` → `{ tmKey: "squat", weeks: [ { sets: [ {pct:.65,reps:5}, {pct:.65,reps:5,fsl:true}, … ] }, … ] }` — every working and FSL set listed, so counts are data.

**`progression_rule` (jsonb per program)**
- `{ type: "cycle_tm_bump", bumps: { squat:10, bench:5, … } }` (5/3/1)
- `{ type: "linear", add: 5, unit: "lb", on: "session" }` (linear / GZCLP)

## Program engine

`domain/programEngine.ts`: `(program + trainingMaxes + cursor)` → today's prescription; `advanceCursor`; `applyProgression`. A **seeded preset library** (5/3/1, 5×5/StrongLifts, PPL, a linear-progression beginner program) ships as global `programs` rows any user can browse, pick, and clone-to-edit. Joel's current 5/3/1 becomes one preset + his personalized instance during migration.

The **Programs** feature area (browse library, pick, create, edit, clone, switch active) is now **core product surface**, not deferred. Workout prefill calls the engine; "complete cycle → bump TMs" applies the program's `progression_rule`.

## Domain core & testing

Pure, framework-free TS, one `.test.ts` per module: `oneRepMax`, `programEngine`, `prDetection`, `volume`, `strengthStandards`, `streaks`. Ports the math from `Utilities.js`, `detectPRs` (`ServerApi.js:564`), `getVolumeAnalytics` (`:688`), the slot machine (`:394`), `getDailyStreak` (`:1224`).

**Testing approach**
- Vitest unit tests per module, porting cases from the Sheet's `Tests.js`.
- **Golden test (oracle defined per review):** run Joel's migrated history through `prDetection` + `volume`; compare **volume over the same ~8-week window** the Sheet uses (`ServerApi.js:704-716`) and **PRs as a from-history recompute** against the exported `Personal Bests` table, with a documented tolerance for any pre-existing beaten-then-edited PBs. Proves the domain port is faithful.
- Domain: high coverage. UI: light. **Empty-state tests**: every feature is tested with a zero-data user.

## Feature areas & phase plan

The general **strength** product (Phases 0–4) is the shippable spine and must be usable by a stranger. Disciplines (5–6) and public signup (9) are additive modules. Every phase must work for both an empty new user and Joel's seeded account.

| Phase | Ships | Usable checkpoint |
|---|---|---|
| **0. Foundations** | Repo scaffold (Vite `base` + SPA 404 fallback), Supabase project + schema + RLS, Google auth, profile/onboarding shell, CI (Pages deploy + tests + RLS check + keepalive). Atomic-save RPC → Phase 2 (first consumer); seed-user migration → its own plan immediately after Foundations | A fresh test account logs in to an empty app |
| **1. Domain core** | All pure modules + unit tests + golden test + empty-state tests | Green suite proving math parity |
| **2. Strength logging + program engine** | Seeded preset library, engine prescription, strength logging w/ prefill, **atomic save via RPC**, rest/session timers, draft autosave, summary, exercise picker (global + custom) | Any user picks a preset and logs a strength workout |
| **3. Program builder** | Browse library, create/edit/clone/switch programs | A stranger builds or customizes a program |
| **4. Strength progress** | PRs, 1RM calc, volume/tonnage, body weight, history | Full strength analytics on real or empty data |
| **5. Climbing module** | Climbing grades (V + font), sessions, climbing progress | Climbers can log & track independently |
| **6. Cardio + calisthenics/GTG + check-ins** | Cardio activities, generalized calisthenics/frequency tracker + streaks + offline queue, daily check-in | Endurance/calisthenics users covered |
| **7. Onboarding + Home + Goals** | Full onboarding (units, disciplines, experience, starter program), discipline toggles, Home dashboard, goals, empty states, picker polish | A stranger self-serves start-to-finish |
| **8. Hardening + Joel cutover** | **Recurring DB backup/export + one test-restore**, client error monitoring, cost/free-tier review, PWA polish, custom domain | Joel retires his Sheet; product is signup-ready |
| **9. Public signup (later)** | Open registration, signup polish, abuse/rate limits | Anyone can sign up |

Each phase is its own spec→plan→implement cycle. Phases 0–2 get detailed plans first. **De-scope trigger:** if the spine (0–4) slips past its planned window, ship it standalone and treat disciplines 5–6 as a separate later effort rather than blocking.

## Data migration (Phase 0, reframed)

Now "seed user #1," not the centerpiece. The app must fully function for users with no migrated data. Delivered as **its own plan immediately after the Foundations plan**, not bundled into it (Foundations ships an empty-but-working app first).
1. Add `exportForMigration()` to the existing Apps Script (clasp set up); returns every tab as JSON; run once.
2. `scripts/seed-user.ts` transforms JSON → Joel's `user_id`-scoped Supabase rows, plus promotes the curated `Exercises_Master` (active rows) into the **global** exercise catalog and seeds the **preset program library** (5/3/1 etc.).

**Trickiest part (unchanged):** historical strength sets reference exercises by name; FK to `exercise_id`. Reuse `_normExName` (`ExerciseCuration.js:21`) to match; log unmatched names via a report (auto-create as global or Joel-custom) so nothing silently drops.

**Verification:** reconciliation report (rows in vs out per table); output feeds the Phase 1 golden test.

**Secrets:** uses the Supabase **service-role key** from an environment variable, never committed or printed; runs only locally.

## Backup & data ownership (resolves review blocker)

Because Joel will retire an always-exportable Sheet, and because a general product holds *other people's* data, owner-controlled backup is a hard requirement:
- A recurring backup (scheduled `pg_dump` / Supabase backup) to owner-controlled storage, plus a user-facing "export all my data (JSON/CSV)" button.
- **Gate:** Joel does not retire his Sheet (Phase 8) until an automated backup exists and a restore has been exercised once.

## Cross-cutting concerns

- **Auth / multi-user:** Supabase Auth (Google to start); RLS enforces per-user isolation on every table; global catalog + preset library rows are read-only to normal users.
- **Idempotency + atomicity:** workout saves (session + N sets + PR recompute) go through a single SECURITY DEFINER RPC guarded by the `sessions.client_id` unique key — the true equivalent of the Sheet's `requestId` dedup, and atomic (no orphaned sessions on partial failure).
- **PWA / offline:** `vite-plugin-pwa` (Workbox); offline write queue in localStorage for calisthenics sets + workout draft, flushed on reconnect/`visibilitychange` (ports `flushGTGSets` + `WorkoutDraft`).
- **Server-state caching:** TanStack Query (persisted) = stale-while-revalidate, invalidated on save.
- **Timezone:** all timestamps `timestamptz` (UTC), displayed in each user's profile timezone.
- **Config single source:** session types, exercise-type classifier, muscle-group map defined once in `domain/` (+ DB), imported everywhere.
- **Hosting specifics:** Vite `base: '/<repo>/'` (or custom domain) + SPA 404 fallback for deep links; Supabase OAuth redirect URIs reconfigured at the Phase 8 domain cutover.
- **Cost / free-tier:** documented envelope — Supabase free tier row/storage/egress limits and inactivity pause; GitHub Pages bandwidth; a **keepalive** workflow (cadence chosen to cover Supabase's pause window — to verify in Phase 0). Named upgrade trigger before opening public signup (Phase 9).
- **Monitoring:** client error logging (e.g. Sentry free tier) landed by Phase 8, since a client-only shared product has no server logs.

## Out of scope for v1

- Liftosaur-class programmable-logic DSL.
- Native mobile app (the pure-domain core keeps this open later).
- Rich media (exercise GIFs/videos), trainer/client mode, in-app messaging, social features.
- Payments / premium tiers.

## Open questions / to confirm during planning

- New GitHub repo name under `joelkhchan2`; scaffold in a fresh directory (recommended) vs this folder.
- Exercise-catalog licensing/provenance for a public product (the ~700 rows were ported from an open dataset via a prior project — confirm license before opening signup).
- Which preset programs seed the initial library (proposed: 5/3/1, StrongLifts 5×5, PPL, a beginner linear program).
- Grade systems to support for climbing at launch (V-scale + Font?).
- Joel's specific new 5/3/1 split edits (captured via the Programs builder in Phase 3).
