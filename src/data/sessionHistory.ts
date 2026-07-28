import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatPace, parseVGrade } from '../domain'
import { getSupabase } from './supabase'
import type { CardioActivityRow, SessionRow } from './types'

export interface CardioHistoryRow {
  kind: 'cardio'
  id: string
  date: string
  activity: string
  durationMinutes: number | null
  distanceKm: number | null
  pace: string | null
}

export interface StrengthHistoryRow {
  kind: 'strength'
  id: string
  date: string
  label: string
  setCount: number
}

export interface ClimbingHistoryRow {
  kind: 'climbing'
  id: string
  date: string
  breakdown: string
  totalSends: number
  totalAttempts: number
}

export type HistoryRow = CardioHistoryRow | StrengthHistoryRow | ClimbingHistoryRow

type HistorySession = Pick<SessionRow, 'id' | 'discipline' | 'date' | 'session_type' | 'duration_minutes'>
type HistoryActivity = Pick<CardioActivityRow, 'activity' | 'duration_minutes' | 'distance_km'>

/** Pure: renders SENT grades (count > 0) as a highest-grade-first summary ("V4×3, V3×2") and the
 *  session's total sends + attempts. Zero-send (projecting) grades are excluded from the string
 *  (no "×0"); the view uses totalAttempts to describe a projecting-only session. Unparseable
 *  grades are dropped. */
export function buildClimbingBreakdown(
  grades: { grade: string; count: number; attempts: number }[],
): { breakdown: string; totalSends: number; totalAttempts: number } {
  const parsed = grades
    .map((g) => ({ n: parseVGrade(g.grade), count: g.count, attempts: g.attempts }))
    .filter((g): g is { n: number; count: number; attempts: number } => g.n !== null)
    .sort((a, b) => b.n - a.n)
  const breakdown = parsed.filter((g) => g.count > 0).map((g) => `V${g.n}×${g.count}`).join(', ')
  const totalSends = parsed.reduce((sum, g) => sum + g.count, 0)
  const totalAttempts = parsed.reduce((sum, g) => sum + g.attempts, 0)
  return { breakdown, totalSends, totalAttempts }
}

/** Pure: turns already-fetched sessions (ordered newest-first) + their joined cardio
 *  activity / strength set-count / climbing sends into display rows; order is preserved. */
export function buildHistoryRows(
  sessions: HistorySession[],
  cardioBySession: Map<string, HistoryActivity>,
  setCountBySession: Map<string, number>,
  climbingBySession: Map<string, { grade: string; count: number; attempts: number }[]> = new Map(),
): HistoryRow[] {
  const rows: HistoryRow[] = []
  for (const s of sessions) {
    if (s.discipline === 'cardio') {
      const act = cardioBySession.get(s.id)
      const duration = act?.duration_minutes ?? s.duration_minutes ?? null
      const distance = act?.distance_km ?? null
      rows.push({
        kind: 'cardio',
        id: s.id,
        date: s.date,
        activity: act?.activity ?? 'Cardio',
        durationMinutes: duration,
        distanceKm: distance,
        pace: formatPace(duration, distance),
      })
    } else if (s.discipline === 'strength') {
      rows.push({
        kind: 'strength',
        id: s.id,
        date: s.date,
        label: s.session_type ?? 'Strength',
        setCount: setCountBySession.get(s.id) ?? 0,
      })
    } else if (s.discipline === 'climbing') {
      const { breakdown, totalSends, totalAttempts } = buildClimbingBreakdown(climbingBySession.get(s.id) ?? [])
      rows.push({ kind: 'climbing', id: s.id, date: s.date, breakdown, totalSends, totalAttempts })
    }
  }
  return rows
}

/** Fetches the viewer's strength + cardio + climbing sessions newest-first and assembles History
 *  rows. Batches the child reads (activities, set counts, sends) by session id, like fetchActiveWorkout. */
export function useSessionHistory(userId: string | undefined) {
  return useQuery({
    queryKey: ['sessionHistory', userId],
    enabled: !!userId,
    queryFn: async (): Promise<HistoryRow[]> => {
      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('sessions')
        .select('id, discipline, date, session_type, duration_minutes, start_time')
        .eq('user_id', userId as string)
        .in('discipline', ['strength', 'cardio', 'climbing'])
        .order('date', { ascending: false })
        .order('start_time', { ascending: false })
      if (error) throw error
      const sessions = (data ?? []) as (HistorySession & { start_time: string })[]

      const cardioIds = sessions.filter(s => s.discipline === 'cardio').map(s => s.id)
      const strengthIds = sessions.filter(s => s.discipline === 'strength').map(s => s.id)
      const cardioBySession = new Map<string, HistoryActivity>()
      const setCountBySession = new Map<string, number>()

      if (cardioIds.length > 0) {
        const { data: acts, error: aErr } = await supabase
          .from('cardio_activities')
          .select('session_id, activity, duration_minutes, distance_km')
          .in('session_id', cardioIds)
        if (aErr) throw aErr
        for (const a of acts ?? []) cardioBySession.set(a.session_id as string, a as HistoryActivity)
      }

      if (strengthIds.length > 0) {
        const { data: sets, error: sErr } = await supabase
          .from('strength_sets')
          .select('session_id')
          .in('session_id', strengthIds)
        if (sErr) throw sErr
        for (const row of sets ?? []) {
          const id = row.session_id as string
          setCountBySession.set(id, (setCountBySession.get(id) ?? 0) + 1)
        }
      }

      const climbingIds = sessions.filter(s => s.discipline === 'climbing').map(s => s.id)
      const climbingBySession = new Map<string, { grade: string; count: number; attempts: number }[]>()
      if (climbingIds.length > 0) {
        const { data: sends, error: cErr } = await supabase
          .from('climbing_sends')
          .select('session_id, grade, count, attempts')
          .in('session_id', climbingIds)
        if (cErr) throw cErr
        for (const row of sends ?? []) {
          const id = row.session_id as string
          const arr = climbingBySession.get(id) ?? []
          arr.push({ grade: row.grade as string, count: row.count as number, attempts: row.attempts as number })
          climbingBySession.set(id, arr)
        }
      }

      return buildHistoryRows(sessions, cardioBySession, setCountBySession, climbingBySession)
    },
  })
}

/** Deletes a session (used for cardio + climbing entries in History); RLS restricts it to the
 *  owner and the DB cascades to the child rows (cardio_activities / climbing_sends). Invalidates
 *  the history list. */
export function useDeleteSession() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (sessionId) => {
      const { error } = await getSupabase().from('sessions').delete().eq('id', sessionId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessionHistory'] }),
  })
}
