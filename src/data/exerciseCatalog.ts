import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { getSupabase } from './supabase'
import type { ExerciseRow } from './types'

/** The subset of an `exercises` row the picker's search results need. */
export type ExerciseSearchResult = Pick<ExerciseRow, 'id' | 'name' | 'exercise_type'>

async function searchExercises(term: string, userId: string): Promise<ExerciseSearchResult[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, exercise_type')
    .eq('is_active', true)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .ilike('name', `%${term}%`)
    .limit(25)
  if (error) throw error

  return (data ?? []) as ExerciseSearchResult[]
}

/**
 * Catalog search backing the exercise picker (Task 9): active exercises that are
 * either global (`user_id is null`) or owned by `userId`, whose name contains
 * `term` (case-insensitive), capped at 25 rows — mirrors the same
 * `is_active` + global-or-own scoping `resolveDraftExerciseIds`/`resolveExerciseIds`
 * use for the catalog read, plus an `ilike` name filter and a result cap since this
 * is an interactive search rather than a full-catalog fetch.
 *
 * Stays disabled (no fetch) for a blank/whitespace-only `term` or an unknown
 * `userId` — nothing useful to search yet, same "wait until the caller has what
 * it needs" shape as `usePublicPrograms`. The picker itself only calls this with
 * a *committed* search term (on submit, not per keystroke) to avoid firing a
 * query on every keypress.
 */
export function useExerciseSearch(term: string, userId: string | undefined): UseQueryResult<ExerciseSearchResult[]> {
  const trimmed = term.trim()

  return useQuery({
    queryKey: ['exerciseSearch', term, userId],
    queryFn: () => searchExercises(trimmed, userId as string),
    enabled: trimmed.length > 0 && !!userId,
  })
}
