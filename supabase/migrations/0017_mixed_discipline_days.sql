-- supabase/migrations/0017_mixed_discipline_days.sql
-- Mixed-discipline programs + flexible day selection.
--
-- (1) Per-day discipline + optional free-text target. Existing rows default to strength,
--     so getPrescription and the whole strength flow are byte-for-byte unchanged.
alter table program_days
  add column discipline text not null default 'strength'
    check (discipline in ('strength','climbing','cardio'));
alter table program_days
  add column target text;

-- (2) Cleanup: correct the dead program_state.cursor DEFAULT to the dayIndex shape every
--     writer/reader actually uses. No existing row reads this default; purely for consistency.
alter table program_state
  alter column cursor set default '{"dayIndex":0,"week":1,"cycle":1}'::jsonb;

-- (3) Extend log_cardio to optionally advance the cursor, mirroring log_workout (0005).
--     CREATE OR REPLACE cannot change a function's argument signature, so DROP first then
--     recreate with the two appended optional params (exactly as 0005 did for log_workout).
drop function if exists log_cardio(text, date, text, integer, numeric, text);
create or replace function log_cardio(
  p_client_id text,
  p_date date,
  p_activity text,
  p_duration_minutes integer,
  p_distance_km numeric,
  p_notes text,
  p_next_cursor jsonb default null,
  p_last_advance_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_session_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'log_cardio requires an authenticated user';
  end if;

  insert into sessions (user_id, client_id, discipline, date, duration_minutes, status)
  values (v_uid, p_client_id, 'cardio', coalesce(p_date, current_date), p_duration_minutes, 'completed')
  on conflict (user_id, client_id) do update set
    discipline = excluded.discipline,
    date = excluded.date,
    duration_minutes = excluded.duration_minutes,
    status = excluded.status
  returning id into v_session_id;

  delete from cardio_activities where session_id = v_session_id and user_id = v_uid;

  insert into cardio_activities (user_id, session_id, activity, duration_minutes, distance_km, notes)
  values (v_uid, v_session_id, p_activity, p_duration_minutes, p_distance_km, p_notes);

  -- Advance block: same transaction as log_workout 0005:92-98, plus a last_advance_key
  -- no-op gate (the `is distinct from` clause). `is distinct from` is null-safe, so the
  -- first advance after activation (stored key null) still applies.
  if p_next_cursor is not null then
    update program_state
       set cursor = p_next_cursor, last_advance_key = p_last_advance_key, updated_at = now()
     where user_id = v_uid
       and (last_advance_key is distinct from p_last_advance_key);
  end if;

  return v_session_id;
end;
$$;

grant execute on function
  log_cardio(text, date, text, integer, numeric, text, jsonb, text) to authenticated;

-- (4) Same treatment for log_climbing. 0012 body verbatim, then the IDENTICAL gated advance
--     block placed AFTER the PR writes and BEFORE the final return jsonb_build_object(...).
drop function if exists log_climbing(text, date, text, jsonb);
create or replace function log_climbing(
  p_client_id text,
  p_date date,
  p_notes text,
  p_sends jsonb,
  p_next_cursor jsonb default null,
  p_last_advance_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_session_id uuid;
  v_send jsonb;
  v_exercise_id uuid;
  v_session_high integer;
  v_prev numeric;
  v_new_max numeric;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'log_climbing requires an authenticated user';
  end if;

  if p_sends is null or jsonb_array_length(p_sends) = 0 then
    raise exception 'log_climbing requires at least one send';
  end if;

  insert into sessions (user_id, client_id, discipline, date, notes, status)
  values (v_uid, p_client_id, 'climbing', coalesce(p_date, current_date), p_notes, 'completed')
  on conflict (user_id, client_id) do update set
    discipline = excluded.discipline,
    date = excluded.date,
    notes = excluded.notes,
    status = excluded.status
  returning id into v_session_id;

  delete from climbing_sends where session_id = v_session_id and user_id = v_uid;

  for v_send in select * from jsonb_array_elements(p_sends)
  loop
    insert into climbing_sends (user_id, session_id, grade_system, grade, count, attempts)
    values (
      v_uid, v_session_id, 'v_scale', v_send->>'grade',
      (v_send->>'count')::integer,
      greatest((v_send->>'count')::integer, coalesce((v_send->>'attempts')::integer, 0))
    );
  end loop;

  -- Highest numeric grade this session AMONG SENT GRADES (count > 0), regex-guarded so
  -- 'VX'/garbage yields null, not 22P02. Projecting-only (count = 0) rows never set a PR.
  select max(case when grade ~ '^V[0-9]+$' then (substring(grade from 2))::int end)
    into v_session_high
    from climbing_sends
   where session_id = v_session_id and user_id = v_uid and grade_system = 'v_scale' and count > 0;

  select id into v_exercise_id from exercises where name = 'Climbing' and user_id is null limit 1;

  select value into v_prev
    from personal_records
   where user_id = v_uid and exercise_id = v_exercise_id and pr_type = 'max_v_grade';

  if v_session_high is not null and v_exercise_id is not null then
    insert into personal_records
      (user_id, exercise_id, pr_type, value, previous_value, date_achieved, session_id)
    values
      (v_uid, v_exercise_id, 'max_v_grade', v_session_high, v_prev,
       coalesce(p_date, current_date), v_session_id)
    on conflict (user_id, exercise_id, pr_type) do update set
      value = excluded.value,
      previous_value = personal_records.value,
      date_achieved = excluded.date_achieved,
      session_id = excluded.session_id
    where personal_records.value < excluded.value;
  end if;

  select value into v_new_max
    from personal_records
   where user_id = v_uid and exercise_id = v_exercise_id
     and pr_type = 'max_v_grade' and session_id = v_session_id;

  -- Advance block goes HERE — after all PR writes, before the return. Identical to
  -- log_cardio's, including the last_advance_key no-op gate.
  if p_next_cursor is not null then
    update program_state
       set cursor = p_next_cursor, last_advance_key = p_last_advance_key, updated_at = now()
     where user_id = v_uid
       and (last_advance_key is distinct from p_last_advance_key);
  end if;

  return jsonb_build_object(
    'session_id', v_session_id,
    'new_max_grade', v_new_max,
    'previous_max_grade', v_prev
  );
end;
$$;

grant execute on function log_climbing(text, date, text, jsonb, jsonb, text) to authenticated;
