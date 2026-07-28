import { useQuery } from '@tanstack/react-query'
import { getSupabase } from './supabase'
import { resolveExerciseListItems } from './exerciseListItems'
import type { ExerciseListItem } from './exerciseCatalog'

const RECENT_LIMIT = 8
const SESSION_LOOKBACK = 50

/**
 * Most-recently-logged distinct exercises, strength-only (climbing logs to one shared
 * "Climbing" row; cardio doesn't log to `exercises` at all), capped at 8. Pipeline, batched
 * by id (matching sessionHistory.ts's style rather than an embedded-select join):
 * 1. Strength sessions newest-first, capped generously (50) so repeat-lifter users still
 *    surface enough distinct exercises.
 * 2. That session's sets' exercise_ids, walked session-by-session (newest first) and
 *    deduped by raw id to build a recency-ordered candidate list.
 * 3. resolveExerciseListItems chases canonicalization, dedupes by RESOLVED id, caps at 8,
 *    fetches display rows, and drops any since-deactivated row.
 */
export function useRecentExercises(userId: string | undefined) {
  return useQuery({
    queryKey: ['recentExercises', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ExerciseListItem[]> => {
      const supabase = getSupabase()

      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', userId as string)
        .eq('discipline', 'strength')
        .order('date', { ascending: false })
        .limit(SESSION_LOOKBACK)
      if (sessionsError) throw sessionsError

      const sessionIdsNewestFirst = (sessions ?? []).map((s) => s.id as string)
      if (sessionIdsNewestFirst.length === 0) return []

      const { data: sets, error: setsError } = await supabase
        .from('strength_sets')
        .select('session_id, exercise_id')
        .eq('user_id', userId as string)
        .in('session_id', sessionIdsNewestFirst)
        .not('exercise_id', 'is', null)
      if (setsError) throw setsError

      const exerciseIdsBySession = new Map<string, string[]>()
      for (const row of sets ?? []) {
        const sessionId = row.session_id as string
        const exerciseId = row.exercise_id as string
        const arr = exerciseIdsBySession.get(sessionId) ?? []
        arr.push(exerciseId)
        exerciseIdsBySession.set(sessionId, arr)
      }

      const rawIdsInOrder: string[] = []
      const seenRaw = new Set<string>()
      for (const sessionId of sessionIdsNewestFirst) {
        for (const exerciseId of exerciseIdsBySession.get(sessionId) ?? []) {
          if (!seenRaw.has(exerciseId)) {
            seenRaw.add(exerciseId)
            rawIdsInOrder.push(exerciseId)
          }
        }
      }

      return resolveExerciseListItems(rawIdsInOrder, userId as string, RECENT_LIMIT)
    },
  })
}
