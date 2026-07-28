import { useQuery } from '@tanstack/react-query'
import { suggestAlternates, type AlternateExercise, type CandidateExercise } from '../domain/alternates'
import { getSupabase } from './supabase'

/** Fetches the canonical global-or-own exercise pool (with muscle + equipment metadata), finds
 *  the current exercise in it (by id, else case-insensitive name), and returns ranked
 *  shared-muscle alternates. */
export function useAlternateExercises(
  currentExerciseId: string | null | undefined,
  currentName: string,
  userId: string | undefined,
) {
  const name = currentName.trim()
  return useQuery({
    queryKey: ['alternates', currentExerciseId ?? name, userId],
    enabled: !!userId && (!!currentExerciseId || name.length > 0),
    queryFn: async (): Promise<AlternateExercise[]> => {
      const { data, error } = await getSupabase()
        .from('exercises')
        .select('id, name, exercise_type, primary_muscles, movement_pattern, equipment')
        .eq('is_active', true)
        .is('canonical_id', null)
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(2000)
      if (error) throw error
      const pool: CandidateExercise[] = (data ?? []).map((r) => {
        const row = r as {
          id: string; name: string; exercise_type: string | null
          primary_muscles: string | null; movement_pattern: string | null; equipment: string | null
        }
        return {
          id: row.id, name: row.name, exerciseType: row.exercise_type,
          primaryMuscles: row.primary_muscles, movementPattern: row.movement_pattern, equipment: row.equipment,
        }
      })
      const current =
        (currentExerciseId ? pool.find((c) => c.id === currentExerciseId) : undefined) ??
        pool.find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
        null
      return suggestAlternates(current, pool)
    },
  })
}
