import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Cursor } from '../domain'
import { getSupabase } from './supabase'

export interface ClimbingSendInput {
  grade: string
  count: number
  attempts: number
}

export interface LogClimbingInput {
  clientId: string
  date: string
  notes: string | null
  sends: ClimbingSendInput[]
  /** Program-linked advance (from Home's day card). Omitted for ad-hoc tab logs. When present,
   *  the RPC advances program_state.cursor in the same transaction. */
  nextCursor?: Cursor
  lastAdvanceKey?: string
}

export interface LogClimbingResult {
  sessionId: string
  newMaxGrade: number | null
  previousMaxGrade: number | null
}

/** Saves a climbing session via the atomic, idempotent `log_climbing` RPC (session +
 *  climbing_sends + max_v_grade PR upsert), then invalidates `['sessionHistory']` (and
 *  `['activeWorkout']` when the save advanced the cursor). Returns the session id plus PR info:
 *  `newMaxGrade` is non-null only when this save set a new max-grade PR (the caller's signal to
 *  celebrate); `previousMaxGrade` is the grade being beaten (or null). */
export function useLogClimbing() {
  const queryClient = useQueryClient()
  return useMutation<LogClimbingResult, Error, LogClimbingInput>({
    mutationFn: async ({ clientId, date, notes, sends, nextCursor, lastAdvanceKey }) => {
      const params: Record<string, unknown> = {
        p_client_id: clientId,
        p_date: date,
        p_notes: notes,
        p_sends: sends,
      }
      if (nextCursor) {
        params.p_next_cursor = nextCursor
        params.p_last_advance_key = lastAdvanceKey ?? null
      }
      const { data, error } = await getSupabase().rpc('log_climbing', params)
      if (error) throw error
      const r = data as { session_id: string; new_max_grade: number | null; previous_max_grade: number | null }
      return {
        sessionId: r.session_id,
        newMaxGrade: r.new_max_grade == null ? null : Number(r.new_max_grade),
        previousMaxGrade: r.previous_max_grade == null ? null : Number(r.previous_max_grade),
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sessionHistory'] })
      if (variables.nextCursor) queryClient.invalidateQueries({ queryKey: ['activeWorkout'] })
    },
  })
}
