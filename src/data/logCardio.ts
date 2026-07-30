import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Cursor } from '../domain'
import { getSupabase } from './supabase'

export interface LogCardioInput {
  clientId: string
  date: string
  activity: string
  durationMinutes: number
  distanceKm: number | null
  notes: string | null
  /** Program-linked advance (from Home's day card). Omitted for ad-hoc tab logs. When present,
   *  the RPC advances program_state.cursor in the same transaction. */
  nextCursor?: Cursor
  lastAdvanceKey?: string
}

/** Saves a cardio session via the atomic, idempotent `log_cardio` RPC, then invalidates
 *  `['sessionHistory']` (and `['activeWorkout']` when the save advanced the cursor). Returns the
 *  session id. */
export function useLogCardio() {
  const queryClient = useQueryClient()
  return useMutation<string, Error, LogCardioInput>({
    mutationFn: async ({ clientId, date, activity, durationMinutes, distanceKm, notes, nextCursor, lastAdvanceKey }) => {
      const params: Record<string, unknown> = {
        p_client_id: clientId,
        p_date: date,
        p_activity: activity,
        p_duration_minutes: durationMinutes,
        p_distance_km: distanceKm,
        p_notes: notes,
      }
      if (nextCursor) {
        params.p_next_cursor = nextCursor
        params.p_last_advance_key = lastAdvanceKey ?? null
      }
      const { data, error } = await getSupabase().rpc('log_cardio', params)
      if (error) throw error
      return data as string
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sessionHistory'] })
      if (variables.nextCursor) queryClient.invalidateQueries({ queryKey: ['activeWorkout'] })
    },
  })
}
