-- Persist per-user starred exercises so the shared ExercisePicker can surface a
-- Favorites section instantly, before any search. Composite PK (user_id, exercise_id)
-- rather than a surrogate id — a user can only favorite a given exercise once, and the
-- toggle mutation (insert/delete) addresses rows by that exact pair. FKs cascade on
-- delete: if a user or exercise row were ever hard-deleted, their favorite rows would go
-- with it — defense-in-depth, since exercises today are only ever soft-deactivated
-- (is_active) or merged (canonical_id), never hard-deleted. Own-only RLS mirrors
-- climbing_sends/training_maxes/exercise_progress. No grant statement needed —
-- 0003_grants.sql's `alter default privileges` already covers new tables.
create table favorite_exercises (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
create index on favorite_exercises(user_id);
alter table favorite_exercises enable row level security;
create policy "own favorite_exercises - all" on favorite_exercises for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
