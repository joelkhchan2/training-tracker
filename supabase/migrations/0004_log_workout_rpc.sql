-- Fix program_state.cursor default to match the domain Cursor shape
-- (dayIndex, not day). Existing rows are unaffected; this only changes
-- the default applied to future inserts that omit `cursor`.
alter table program_state
  alter column cursor set default '{"dayIndex":0,"week":1,"cycle":1}'::jsonb;

-- Atomic, idempotent save of a strength session + its sets.
--
-- p_client_id: client-generated idempotency key for the session (unique per user).
-- p_session: jsonb object with session fields — discipline, session_type, date,
--   start_time, end_time, duration_minutes, body_weight, program_variant,
--   program_week, notes, status.
-- p_sets: jsonb array of set objects — exercise_id, set_number, weight, reps,
--   rpe, is_warmup, order_index.
--
-- Idempotency: re-calling with the same p_client_id upserts the SAME session
-- row (on conflict (user_id, client_id)) and replaces its strength_sets
-- wholesale (delete + reinsert), so repeated saves never duplicate rows.
--
-- Isolation: auth.uid() is captured once and used explicitly for every row
-- written, so even though this function runs security definer, a caller can
-- only ever read/write rows under their own uid.
create or replace function log_workout(
  p_client_id text,
  p_session jsonb,
  p_sets jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_session_id uuid;
  v_set jsonb;
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

  return v_session_id;
end;
$$;

grant execute on function log_workout(text, jsonb, jsonb) to authenticated;
