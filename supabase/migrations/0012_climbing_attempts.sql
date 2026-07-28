-- supabase/migrations/0012_climbing_attempts.sql
-- Track ATTEMPTS alongside sends per grade. Additive column, added in the correct order
-- (column -> backfill -> checks) so validation passes against existing rows, then a replaced
-- log_climbing that stores attempts (clamped attempts >= count) and only lets SENT grades
-- (count > 0) set the max-V-grade PR.

-- (1) Column first, with a default so existing rows get a value. No check yet.
alter table climbing_sends add column if not exists attempts integer not null default 0;

-- (2) Backfill: every historical send implies at least one attempt (safe lower bound).
update climbing_sends set attempts = count where attempts < count;

-- (3) Now the invariants hold on all rows, so the checks validate cleanly.
alter table climbing_sends add constraint climbing_sends_count_nonneg check (count >= 0);
alter table climbing_sends add constraint climbing_sends_attempts_gte_count check (attempts >= count);

-- (4) Replace the RPC: store attempts (clamped), and filter the PR aggregate to sent grades.
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

  return jsonb_build_object(
    'session_id', v_session_id,
    'new_max_grade', v_new_max,
    'previous_max_grade', v_prev
  );
end;
$$;

grant execute on function log_climbing(text, date, text, jsonb) to authenticated;
