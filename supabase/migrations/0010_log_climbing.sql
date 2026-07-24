-- supabase/migrations/0010_log_climbing.sql
-- Atomic, idempotent save of a climbing (bouldering) session + its per-grade send counts,
-- plus max-V-grade PR detection & persistence.
--
-- Mirrors log_cardio (0009): upsert the session on (user_id, client_id), then
-- delete-and-reinsert the child climbing_sends rows, so replaying the same p_client_id never
-- duplicates rows. auth.uid() is captured once and used for every write.
--
-- Beyond cardio: the RPC detects a new max V-grade against the user's stored max_v_grade PR
-- (keyed to the global "Climbing" exercise) and upserts it. The grade aggregate is
-- regex-guarded so a malformed grade can never raise 22P02 and roll back the whole save.
-- new_max_grade is derived from whether THIS session owns the PR row, so a lost-response
-- retry with the same client_id still reports the PR (replay-safe celebration).

-- (1) Ensure the global "Climbing" exercise exists (idempotent across environments: prod
--     already has it -> no-op; a bare test DB -> created). The max_v_grade PR keys to this row.
insert into exercises (name, user_id, exercise_type, is_active)
select 'Climbing', null, 'weighted', true
where not exists (
  select 1 from exercises where name = 'Climbing' and user_id is null
);

-- (2) The function.
create or replace function log_climbing(
  p_client_id text,
  p_date date,
  p_notes text,
  p_sends jsonb
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
    insert into climbing_sends (user_id, session_id, grade_system, grade, count)
    values (v_uid, v_session_id, 'v_scale', v_send->>'grade', (v_send->>'count')::integer);
  end loop;

  -- Highest numeric grade this session, regex-guarded so 'VX'/garbage yields null, not 22P02.
  select max(case when grade ~ '^V[0-9]+$' then (substring(grade from 2))::int end)
    into v_session_high
    from climbing_sends
   where session_id = v_session_id and user_id = v_uid and grade_system = 'v_scale';

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

  -- Replay-safe: the PR value only when THIS session owns the winning row, else null.
  select value into v_new_max
    from personal_records
   where user_id = v_uid and exercise_id = v_exercise_id
     and pr_type = 'max_v_grade' and session_id = v_session_id;

  return jsonb_build_object(
    'session_id', v_session_id,
    'new_max_grade', v_new_max,
    'previous_max_grade', v_prev
  );
end;
$$;

grant execute on function log_climbing(text, date, text, jsonb) to authenticated;
