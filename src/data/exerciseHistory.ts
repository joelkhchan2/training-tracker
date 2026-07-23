import { useQuery } from '@tanstack/react-query'
import { epley1RM, round1 } from '../domain'
import { getSupabase } from './supabase'
import type { ActiveWorkoutBundle } from './queries'
import type { PrescribedExercise } from '../domain/types'

export interface ExerciseHistorySession {
  sessionId: string
  date: string
  sets: { weight: number | null; reps: number | null; isWarmup: boolean }[]
  e1rm: number
  volume: number
}

interface HistoryRow {
  session_id: string
  date: string
  set_number: number
  weight: number | null
  reps: number | null
  is_warmup: boolean
}

/** Pure: group flat rows (each carrying its session date) into sessions newest-first (≤10). Sets
 *  are ordered by set_number; e1RM (top epley) + volume computed over non-warmup sets only (warmup
 *  sets stay in `sets` for display). */
export function buildExerciseHistory(rows: HistoryRow[]): ExerciseHistorySession[] {
  const bySession = new Map<string, ExerciseHistorySession>()
  for (const r of rows) {
    let s = bySession.get(r.session_id)
    if (!s) { s = { sessionId: r.session_id, date: r.date, sets: [], e1rm: 0, volume: 0 }; bySession.set(r.session_id, s) }
    s.sets.push({ weight: r.weight, reps: r.reps, isWarmup: r.is_warmup })
  }
  const sessions = [...bySession.values()]
  for (const s of sessions) {
    let top = 0
    let vol = 0
    for (const set of s.sets) {
      if (set.isWarmup || set.weight == null || set.reps == null) continue
      top = Math.max(top, epley1RM(set.weight, set.reps))
      vol += set.weight * set.reps
    }
    s.e1rm = round1(top)
    s.volume = vol
  }
  sessions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) // newest-first
  return sessions.slice(0, 10)
}

/** Flattens the `select` (embeds `sessions(date)`), ordered by set_number, into HistoryRows. */
function toHistoryRows(data: unknown[]): HistoryRow[] {
  return (data ?? []).map((r) => {
    const row = r as { session_id: string; set_number: number; weight: number | null; reps: number | null; is_warmup: boolean; sessions: { date: string } | null }
    return { session_id: row.session_id, set_number: row.set_number, weight: row.weight, reps: row.reps, is_warmup: row.is_warmup, date: row.sessions?.date ?? '' }
  })
}

/** Render-time hook: an exercise's recent-session history (hint + history sheet). */
export function useExerciseHistory(exerciseId: string | null, userId: string | undefined) {
  return useQuery({
    queryKey: ['exerciseHistory', exerciseId, userId],
    enabled: !!exerciseId && !!userId,
    queryFn: async (): Promise<ExerciseHistorySession[]> => {
      const { data, error } = await getSupabase()
        .from('strength_sets')
        .select('session_id, set_number, weight, reps, is_warmup, sessions(date)')
        .eq('exercise_id', exerciseId!)
        .eq('user_id', userId!)
        .order('set_number', { ascending: true })
      if (error) throw error
      return buildExerciseHistory(toHistoryRows(data ?? []))
    },
  })
}

/** Event-handler fetch (start autofill + swap re-prefill): each exercise's LAST session's ordered
 *  non-warmup working sets. Not a hook — called imperatively. */
export async function fetchLastSetsByExercise(
  exerciseIds: string[],
  userId: string,
): Promise<Record<string, { weight: number | null; reps: number | null }[]>> {
  const result: Record<string, { weight: number | null; reps: number | null }[]> = {}
  if (exerciseIds.length === 0) return result
  const { data, error } = await getSupabase()
    .from('strength_sets')
    .select('exercise_id, session_id, set_number, weight, reps, is_warmup, sessions(date)')
    .in('exercise_id', exerciseIds)
    .eq('user_id', userId)
    .order('set_number', { ascending: true })
  if (error) throw error
  const byExercise = new Map<string, HistoryRow[]>()
  for (const r of data ?? []) {
    const row = r as { exercise_id: string } & Record<string, unknown>
    const list = byExercise.get(row.exercise_id) ?? []
    list.push(toHistoryRows([r])[0])
    byExercise.set(row.exercise_id, list)
  }
  for (const [id, rows] of byExercise) {
    const latest = buildExerciseHistory(rows)[0]
    if (!latest) continue
    result[id] = latest.sets.filter((s) => !s.isWarmup).map((s) => ({ weight: s.weight, reps: s.reps }))
  }
  return result
}

/** Pure: fill each prescribed exercise's no-weight sets (weight null OR 0) from the same-index set
 *  of that exercise's last session, matched by NAME. Fills weight only (prescribed reps stays the
 *  target). Program-weighted sets and unmatched indices are left untouched. */
export function applyAutofill(
  prescription: PrescribedExercise[],
  lastSetsByName: Record<string, { weight: number | null; reps: number | null }[]>,
): PrescribedExercise[] {
  return prescription.map((ex) => {
    const last = lastSetsByName[ex.exerciseName]
    if (!last) return ex
    return {
      ...ex,
      sets: ex.sets.map((s, i) => {
        if (s.weight != null && s.weight !== 0) return s // real prescribed weight — authoritative
        const l = last[i]
        if (!l || l.weight == null) return s
        return { ...s, weight: l.weight }
      }),
    }
  })
}

/** Pure: name→exercise_id for TODAY's program day only (not the whole program), for read-only
 *  hint/history resolution. */
export function buildTodayExerciseIdMap(bundle: ActiveWorkoutBundle): Record<string, string> {
  const todayDayId = bundle.days[bundle.cursor.dayIndex]?.id
  const map: Record<string, string> = {}
  if (!todayDayId) return map
  for (const pe of bundle.programExercises) {
    if (pe.program_day_id !== todayDayId || !pe.exercise_id) continue
    const name = bundle.exercisesById[pe.exercise_id]?.name
    if (name) map[name] = pe.exercise_id
  }
  return map
}
