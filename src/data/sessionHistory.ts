import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatPace } from '../domain'
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

export type HistoryRow = CardioHistoryRow | StrengthHistoryRow

type HistorySession = Pick<SessionRow, 'id' | 'discipline' | 'date' | 'session_type' | 'duration_minutes'>
type HistoryActivity = Pick<CardioActivityRow, 'activity' | 'duration_minutes' | 'distance_km'>

/** Pure: turns already-fetched sessions (ordered newest-first) + their joined cardio
 *  activity / strength set-count into display rows. Sessions that are neither strength nor
 *  cardio are dropped (no renderer yet); order is preserved. */
export function buildHistoryRows(
  sessions: HistorySession[],
  cardioBySession: Map<string, HistoryActivity>,
  setCountBySession: Map<string, number>,
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
    }
  }
  return rows
}

/** Fetches the viewer's strength + cardio sessions newest-first and assembles History rows.
 *  Batches the child reads (activities, set counts) by session id, like fetchActiveWorkout. */
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
        .in('discipline', ['strength', 'cardio'])
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

      return buildHistoryRows(sessions, cardioBySession, setCountBySession)
    },
  })
}

/** Deletes a session (used for cardio entries in History); RLS restricts it to the owner and
 *  the DB cascades to cardio_activities. Invalidates the history list. */
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
