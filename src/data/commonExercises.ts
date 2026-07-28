import { useQuery } from '@tanstack/react-query'
import { getSupabase } from './supabase'
import { toExerciseListItem, type ExerciseListItem, type RawExerciseListRow } from './exerciseCatalog'

const COMMON_LIMIT = 8

/**
 * Active canonical global-or-own exercises (same is_active/canonical_id/user_id scoping
 * useExerciseSearch and useAlternateExercises already use), ordered most-popular first,
 * capped at 8 — the add flow's "Common" suggested section. No canonicalization chase
 * needed: the source query already excludes alias rows at read time.
 */
export function useCommonExercises(userId: string | undefined) {
  return useQuery({
    queryKey: ['commonExercises', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ExerciseListItem[]> => {
      const { data, error } = await getSupabase()
        .from('exercises')
        .select('id, name, exercise_type, primary_muscles, equipment')
        .eq('is_active', true)
        .is('canonical_id', null)
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(COMMON_LIMIT)
      if (error) throw error
      return ((data ?? []) as RawExerciseListRow[]).map(toExerciseListItem)
    },
  })
}
