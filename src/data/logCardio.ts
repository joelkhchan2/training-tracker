import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from './supabase'

export interface LogCardioInput {
  clientId: string
  date: string
  activity: string
  durationMinutes: number
  distanceKm: number | null
  notes: string | null
}

/** Saves a cardio session via the atomic, idempotent `log_cardio` RPC, then invalidates
 *  `['sessionHistory']` so History reflects it. Returns the session id. */
export function useLogCardio() {
  const queryClient = useQueryClient()
  return useMutation<string, Error, LogCardioInput>({
    mutationFn: async ({ clientId, date, activity, durationMinutes, distanceKm, notes }) => {
      const { data, error } = await getSupabase().rpc('log_cardio', {
        p_client_id: clientId,
        p_date: date,
        p_activity: activity,
        p_duration_minutes: durationMinutes,
        p_distance_km: distanceKm,
        p_notes: notes,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessionHistory'] })
    },
  })
}
