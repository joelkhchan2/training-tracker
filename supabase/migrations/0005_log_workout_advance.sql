-- Make the program-cursor advance atomic with the session/set save.
--
-- Previously the client called log_workout() then did a *separate*
-- `program_state` update from the browser. If the tab closed, the network
-- dropped, or the second call errored between those two round-trips, the
-- session would be saved but the cursor would never advance (or vice versa
-- on a retry), silently desyncing "what you logged" from "what program day
-- you're on". Folding the cursor write into the same plpgsql function makes
-- both writes commit-or-rollback together in one transaction.
--
-- p_next_cursor / p_last_advance_key are optional (default null) so existing
-- callers that only want to save a session (no advance) keep working. When
-- p_next_cursor is provided, this upserts a single `program_state` row for
-- the caller's own uid — same idempotency guarantee as the session/set
-- writes: re-applying the same next_cursor value just re-writes the same
-- value, it never "advances twice".
drop function if exists log_workout(text, jsonb, jsonb);

create or replace function log_workout(
  p_client_id text,
  p_session jsonb,
  p_sets jsonb,
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

  if p_next_cursor is not null then
    update program_state
    set cursor = p_next_cursor,
        last_advance_key = p_last_advance_key,
        updated_at = now()
    where user_id = v_uid;
  end if;

  return v_session_id;
end;
$$;

grant execute on function log_workout(text, jsonb, jsonb, jsonb, text) to authenticated;
