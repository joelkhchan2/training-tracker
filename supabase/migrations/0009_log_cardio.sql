-- supabase/migrations/0009_log_cardio.sql
-- Atomic, idempotent save of a cardio session + its single activity row.
--
-- Mirrors log_workout (0004/0005): upsert the session on (user_id, client_id),
-- then delete-and-reinsert the child cardio_activities row, so replaying the
-- same p_client_id never duplicates rows and always leaves exactly one activity.
-- auth.uid() is captured once and used for every write, so this security-definer
-- function can only ever touch the caller's own rows.
--
-- cardio_activities.duration_minutes is the authoritative duration; the value is
-- also mirrored onto sessions.duration_minutes for at-a-glance session reads.
create or replace function log_cardio(
  p_client_id text,
  p_date date,
  p_activity text,
  p_duration_minutes integer,
  p_distance_km numeric,
  p_notes text
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

  return v_session_id;
end;
$$;

grant execute on function log_cardio(text, date, text, integer, numeric, text) to authenticated;
