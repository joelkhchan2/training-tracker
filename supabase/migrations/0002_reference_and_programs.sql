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
