-- Fix: percentage-scheme programs (5/3/1) never increased across cycles.
--
-- 5/3/1 derives every working set from training_maxes[tmKey] * pct. The training max is
-- meant to bump each completed cycle (program.progressionRule = cycle_tm_bump), but nothing
-- ever wrote the bump: the client save path applied only linear working-weight progression
-- (exercise_progress), and this RPC advanced the cursor without touching training_maxes. So
-- every new cycle re-derived the exact same weights. See src/domain/programEngine.ts
-- (applyProgression) — the domain function existed and was unit-tested, but was never wired
-- into the save path.
--
-- This widens log_workout with a new positional p_training_maxes argument: an array of
-- { key, value, prev_value } upserted into training_maxes in the SAME transaction as the
-- cursor advance, so the cycle rollover and its TM bump can never disagree. The client sends
-- ABSOLUTE new values (progressionRule applied to the pre-save maxes), only on cycle
-- completion — absolute (not delta) values keep a replayed save idempotent: it re-writes the
-- same numbers rather than bumping twice.
--
-- Widening the positional argument list means the old 6-arg signature must be dropped first
-- (create-or-replace can't change the argument list), mirroring 0005/0006. A fresh grant on
-- the new 7-arg signature follows.
drop function if exists log_workout(text, jsonb, jsonb, jsonb, text, jsonb);

create or replace function log_workout(
  p_client_id text,
  p_session jsonb,
  p_sets jsonb,
  p_next_cursor jsonb default null,
  p_last_advance_key text default null,
  p_progress jsonb default null,
  p_training_maxes jsonb default null
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
  v_tm jsonb;
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
      user_id, session_id, exercise_id, set_number, weight, reps, rpe, is_warmup, order_index, duration_seconds
    ) values (
      v_uid,
      v_session_id,
      (v_set->>'exercise_id')::uuid,
      (v_set->>'set_number')::integer,
      (v_set->>'weight')::numeric,
      (v_set->>'reps')::integer,
      (v_set->>'rpe')::numeric,
      coalesce((v_set->>'is_warmup')::boolean, false),
      coalesce((v_set->>'order_index')::integer, 0),
      (v_set->>'duration_seconds')::integer
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

  if p_training_maxes is not null then
    for v_tm in select * from jsonb_array_elements(p_training_maxes)
    loop
      insert into training_maxes (user_id, key, value, prev_value, updated_at)
      values (
        v_uid,
        v_tm->>'key',
        (v_tm->>'value')::numeric,
        (v_tm->>'prev_value')::numeric,
        now()
      )
      on conflict (user_id, key) do update set
        value = excluded.value,
        prev_value = excluded.prev_value,
        updated_at = excluded.updated_at;
    end loop;
  end if;

  return v_session_id;
end;
$$;

grant execute on function log_workout(text, jsonb, jsonb, jsonb, text, jsonb, jsonb) to authenticated;
