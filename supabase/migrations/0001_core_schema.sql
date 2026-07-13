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
