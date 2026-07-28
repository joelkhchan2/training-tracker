import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { getSupabase } from './supabase'

/** The one row shape every ExercisePicker section (suggested, favorite, recent, search
 *  result) renders — camelCase, so it can be built either by mapping a raw DB row here
 *  or, for suggested/alternates callers, from an already-camelCase domain shape. */
export interface ExerciseListItem {
  id: string
  name: string
  exerciseType: string | null
  primaryMuscles: string | null
  equipment: string | null
}

/** The raw `exercises` row shape the picker-backing queries select (snake_case, as
 *  Supabase returns it) before mapping to ExerciseListItem. */
export interface RawExerciseListRow {
  id: string
  name: string
  exercise_type: string | null
  primary_muscles: string | null
  equipment: string | null
}

/** Maps a raw `exercises` row to the camelCase ExerciseListItem every picker section
 *  renders — the same map-on-read style `alternateExercises.ts` uses for
 *  CandidateExercise/AlternateExercise. Shared by useExerciseSearch, useCommonExercises,
 *  and resolveExerciseListItems so the snake->camel mapping lives in exactly one place. */
export function toExerciseListItem(row: RawExerciseListRow): ExerciseListItem {
  return {
    id: row.id,
    name: row.name,
    exerciseType: row.exercise_type,
    primaryMuscles: row.primary_muscles,
    equipment: row.equipment,
  }
}

async function searchExercises(term: string, userId: string): Promise<ExerciseListItem[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, exercise_type, primary_muscles, equipment')
    .eq('is_active', true)
    .is('canonical_id', null)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .ilike('name', `%${term}%`)
    .limit(25)
  if (error) throw error

  return ((data ?? []) as RawExerciseListRow[]).map(toExerciseListItem)
}

/**
 * Catalog search backing the exercise picker: active, canonical exercises
 * (`canonical_id is null` excludes alias rows, which redirect to a canonical
 * exercise instead of being distinct search results) that are either global
 * (`user_id is null`) or owned by `userId`, whose name contains `term`
 * (case-insensitive), capped at 25 rows — mirrors the same `is_active` +
 * global-or-own scoping `resolveDraftExerciseIds`/`resolveExerciseIds` use for
 * the catalog read, plus an `ilike` name filter and a result cap since this
 * is an interactive search rather than a full-catalog fetch.
 *
 * Stays disabled (no fetch) for a blank/whitespace-only `term` or an unknown
 * `userId` — nothing useful to search yet, same "wait until the caller has what
 * it needs" shape as `usePublicPrograms`. The picker itself only calls this with
 * a *committed* search term (on submit, not per keystroke) to avoid firing a
 * query on every keypress.
 */
export function useExerciseSearch(term: string, userId: string | undefined): UseQueryResult<ExerciseListItem[]> {
  const trimmed = term.trim()

  return useQuery({
    queryKey: ['exerciseSearch', term, userId],
    queryFn: () => searchExercises(trimmed, userId as string),
    enabled: trimmed.length > 0 && !!userId,
  })
}
