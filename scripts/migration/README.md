# Migration: load runner

`load.ts` assembles every transform's output (`transform/exercises.ts`,
`transform/log.ts`, `transform/programState.ts`, `transform/records.ts`,
`transform/programs.ts`) into one in-memory graph with real FKs/user_id/ids
wired up, validates FK integrity in memory, and either prints a
reconciliation report (`--dry-run`) or upserts everything into the hosted
Supabase project (real mode).

## Dry run (safe, no DB, no secrets)

```
npx tsx scripts/migration/load.ts --dry-run scripts/migration/.data/export.xlsx
```

Always run this first. It loads the real staged export, assembles every
table's rows, checks that every FK (program_exercise/strength_set/
personal_record → exercise_id, every child row → session_id) resolves, and
prints a per-table row-count reconciliation. It never reads `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, or `SEED_USER_EMAIL`, and never opens a network
connection — it's safe to run any time, by anyone, with no credentials.

Exits non-zero if any dangling FK reference is found.

## Real load (you run this; needs a service-role key)

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SEED_USER_EMAIL=you@example.com \
  npx tsx scripts/migration/load.ts scripts/migration/.data/export.xlsx
```

- `SUPABASE_URL` — the hosted project's REST URL.
- `SUPABASE_SERVICE_ROLE_KEY` — **a secret.** Bypasses RLS; keep it in your
  shell environment only, never commit it, never paste it into a script
  file or a chat.
- `SEED_USER_EMAIL` — the email of the already-created auth user this data
  belongs to. The script resolves it to a real `user_id` via
  `supabase.auth.admin.listUsers()` and fails clearly if no match is found —
  create that user first (e.g. via Supabase Studio → Authentication) if it
  doesn't exist yet.

Real mode re-runs the same in-memory assembly and FK validation as
`--dry-run` (it aborts before touching the DB if any dangling FK turns up),
then upserts in FK-safe order:

```
exercises → programs → program_days → program_exercises → training_maxes
  → program_state → sessions → {strength_sets, climbing_sends,
  cardio_activities} → calisthenics_sets → daily_checkins
  → personal_records → templates
```

Idempotency strategy per table (safe to re-run):

- `exercises`, `training_maxes`, `program_state`, `sessions`,
  `calisthenics_sets`, `daily_checkins`, `personal_records` — real `upsert`
  on the schema's actual unique constraint (`id` for exercises;
  `user_id,key` / `user_id` / `user_id,client_id` / `user_id,client_id` /
  `user_id,date` / `user_id,exercise_id,pr_type` respectively).
- `programs`, `program_days`, `program_exercises`, `templates` — this schema
  has no unique constraint on any of these, so idempotency is delete-then-
  insert scoped to this program's name / these preset names (FK `on delete
  cascade` removes the old days/exercises automatically).
- `strength_sets`, `climbing_sends`, `cardio_activities` — same reasoning
  (no unique constraint); delete-then-insert scoped to the sessions this
  run touches, so re-running fully replaces each touched session's children
  rather than accumulating duplicates.

It prints the same reconciliation table as `--dry-run`, with actual
submitted/confirmed row counts, and never prints the service-role key or any
other secret value.

## Known limitation: "created from log" exercises

`buildNameToId` (in `transform/exercises.ts`) mints a fresh
`crypto.randomUUID()` for every exercise name it finds in the Training Log /
Personal Bests / Templates that has no match in `Exercises_Master` — on
every process run, not looked up from the DB. `load.ts` reconciles this in
real mode only (`reconcileExtraExercises`): before inserting, it checks the
hosted DB's existing global exercises by name and remaps any
already-existing name back to its real DB id, so re-running for real
doesn't insert a second copy of those ~15 rows under a new id.
