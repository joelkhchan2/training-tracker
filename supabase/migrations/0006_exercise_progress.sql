-- Persist per-user linear-progression state (current working weight +
-- consecutive-fail streak) per (program, exercise), and let log_workout
-- upsert it atomically with the session/set save so a save + progression
-- update can never desync (mirrors the program_state cursor pattern from
-- 0005).
create table exercise_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  exercise_id uuid references exercises(id),
  current_weight numeric not null,
  consecutive_fails integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, program_id, exercise_id)
);
alter table exercise_progress enable row level security;
create policy "own exercise_progress - all" on exercise_progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Extend log_workout with an optional p_progress jsonb array of
-- {program_id, exercise_id, current_weight, consecutive_fails}. Each element
-- is upserted into exercise_progress for the caller's own uid, on conflict
-- (user_id, program_id, exercise_id), in the same transaction as the
-- session/set save (and cursor advance, if provided) — so linear progression
-- state commits-or-rolls-back with everything else. p_progress defaults to
-- null so existing 5-arg callers are unaffected.
--
-- CREATE OR REPLACE cannot widen a function's argument-type list (even by
-- appending a defaulted parameter) — Postgres treats that as a distinct
-- overload, not a replacement, which left both the 5-arg and 6-arg versions
-- registered and made PostgREST unable to pick one for 5-arg calls
-- (PGRST203). Drop the prior signature first, as 0005 did for the same
-- reason.
drop function if exists log_workout(text, jsonb, jsonb, jsonb, text);

create or replace function log_workout(
  p_client_id text,
  p_session jsonb,
  p_sets jsonb,
  p_next_cursor jsonb default null,
  p_last_advance_key text default null,
  p_progress jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_session_id uuid;
  v_set jsonb;
  v_prog jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'log_workout requires an authenticated user';
  end if;

  insert into sessions (
    user_id, client_id, discipline, session_type, date, start_time, end_time,
    duration_minutes, body_weight, program_variant, program_week, notes, status
  )
  values (
    v_uid,
    p_client_id,
    p_session->>'discipline',
    p_session->>'session_type',
    coalesce((p_session->>'date')::date, current_date),
    coalesce((p_session->>'start_time')::timestamptz, now()),
    (p_session->>'end_time')::timestamptz,
    (p_session->>'duration_minutes')::integer,
    (p_session->>'body_weight')::numeric,
    p_session->>'program_variant',
    (p_session->>'program_week')::integer,
    p_session->>'notes',
    coalesce(p_session->>'status', 'active')
  )
  on conflict (user_id, client_id) do update set
    discipline = excluded.discipline,
    session_type = excluded.session_type,
    date = excluded.date,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    duration_minutes = excluded.duration_minutes,
    body_weight = excluded.body_weight,
    program_variant = excluded.program_variant,
    program_week = excluded.program_week,
    notes = excluded.notes,
    status = excluded.status
  returning id into v_session_id;

  delete from strength_sets where session_id = v_session_id and user_id = v_uid;

  for v_set in select * from jsonb_array_elements(p_sets)
  loop
    insert into strength_sets (
      user_id, session_id, exercise_id, set_number, weight, reps, rpe, is_warmup, order_index
    ) values (
      v_uid,
      v_session_id,
      (v_set->>'exercise_id')::uuid,
      (v_set->>'set_number')::integer,
      (v_set->>'weight')::numeric,
      (v_set->>'reps')::integer,
      (v_set->>'rpe')::numeric,
      coalesce((v_set->>'is_warmup')::boolean, false),
      coalesce((v_set->>'order_index')::integer, 0)
    );
  end loop;

  if p_next_cursor is not null then
    update program_state
    set cursor = p_next_cursor,
        last_advance_key = p_last_advance_key,
        updated_at = now()
    where user_id = v_uid;
  end if;

  if p_progress is not null then
    for v_prog in select * from jsonb_array_elements(p_progress)
    loop
      insert into exercise_progress (
        user_id, program_id, exercise_id, current_weight, consecutive_fails, updated_at
      ) values (
        v_uid,
        (v_prog->>'program_id')::uuid,
        (v_prog->>'exercise_id')::uuid,
        (v_prog->>'current_weight')::numeric,
        coalesce((v_prog->>'consecutive_fails')::integer, 0),
        now()
      )
      on conflict (user_id, program_id, exercise_id) do update set
        current_weight = excluded.current_weight,
        consecutive_fails = excluded.consecutive_fails,
        updated_at = excluded.updated_at;
    end loop;
  end if;

  return v_session_id;
end;
$$;

grant execute on function log_workout(text, jsonb, jsonb, jsonb, text, jsonb) to authenticated;
