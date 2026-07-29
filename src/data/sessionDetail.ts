import { useQuery } from '@tanstack/react-query'
import { formatDuration, formatPace, formatWeight, inferInputType, parseVGrade } from '../domain'
import type { Discipline, WeightUnit } from '../domain'
import { getSupabase } from './supabase'

export interface DetailSet {
  weight: number | null
  reps: number | null
  rpe: number | null
  isWarmup: boolean
  durationSeconds: number | null
}

export interface StrengthExerciseGroup {
  exerciseName: string
  sets: DetailSet[]
}

export interface SessionHeader {
  discipline: Discipline
  date: string
  sessionType: string | null
  programVariant: string | null
  programWeek: number | null
  durationMinutes: number | null
  bodyWeight: number | null
  notes: string | null
}

export interface StrengthSessionDetail {
  kind: 'strength'
  header: SessionHeader
  exercises: StrengthExerciseGroup[]
}

export interface CardioSessionDetail {
  kind: 'cardio'
  header: SessionHeader
  activity: string
  distanceKm: number | null
  durationMinutes: number | null
  pace: string | null
}

export interface ClimbingSessionDetail {
  kind: 'climbing'
  header: SessionHeader
  sends: { grade: string; count: number; attempts: number }[]
  totalSends: number
  totalAttempts: number
}

export type SessionDetail = StrengthSessionDetail | CardioSessionDetail | ClimbingSessionDetail

/** Pure: group flat strength rows (already ordered by order_index, set_number) into consecutive
 *  same-exercise groups, preserving the performed order (a superset A,B,A,B → four groups). */
export function groupStrengthSets(
  rows: { exerciseName: string; weight: number | null; reps: number | null; rpe: number | null; isWarmup: boolean; durationSeconds: number | null }[],
): StrengthExerciseGroup[] {
  const groups: StrengthExerciseGroup[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    const set: DetailSet = { weight: r.weight, reps: r.reps, rpe: r.rpe, isWarmup: r.isWarmup, durationSeconds: r.durationSeconds }
    if (last && last.exerciseName === r.exerciseName) last.sets.push(set)
    else groups.push({ exerciseName: r.exerciseName, sets: [set] })
  }
  return groups
}

/** Pure: a set's load, shaped by its inferred input type — "weight×reps" (or "BW×reps"
 *  when weight is null — matches ExerciseHistorySheet) for weighted/bodyweight, a bare
 *  "m:ss" for timed, "weight × m:ss" for weighted_time; "@rpe" appended when present.
 *  Weights render through `formatWeight` in the caller's unit. */
export function formatSet(set: DetailSet, unit: WeightUnit): string {
  const type = inferInputType(set)
  const base =
    type === 'timed' ? formatDuration(set.durationSeconds as number)
    : type === 'weighted_time' ? `${formatWeight(set.weight as number, unit)} × ${formatDuration(set.durationSeconds as number)}`
    : set.reps != null ? `${set.weight != null ? formatWeight(set.weight, unit) : 'BW'}×${set.reps}`
    : (set.weight != null ? formatWeight(set.weight, unit) : 'BW')
  return set.rpe != null ? `${base} @${set.rpe}` : base
}

/** Pure: order climbing sends highest-v-grade-first; unparseable grades (e.g. font) are kept and
 *  sorted to the end by raw string. totalSends counts every row. */
export function shapeClimbingSends(
  rows: { grade: string; count: number; attempts: number }[],
): { sends: { grade: string; count: number; attempts: number }[]; totalSends: number; totalAttempts: number } {
  const sends = [...rows].sort((a, b) => {
    const na = parseVGrade(a.grade)
    const nb = parseVGrade(b.grade)
    if (na != null && nb != null) return nb - na
    if (na != null) return -1
    if (nb != null) return 1
    return a.grade < b.grade ? -1 : a.grade > b.grade ? 1 : 0
  })
  const totalSends = rows.reduce((sum, r) => sum + r.count, 0)
  const totalAttempts = rows.reduce((sum, r) => sum + r.attempts, 0)
  return { sends, totalSends, totalAttempts }
}

const SESSION_COLS = 'id, discipline, date, session_type, program_variant, program_week, duration_minutes, body_weight, notes'

function toHeader(s: {
  discipline: Discipline; date: string; session_type: string | null; program_variant: string | null
  program_week: number | null; duration_minutes: number | null; body_weight: number | null; notes: string | null
}): SessionHeader {
  return {
    discipline: s.discipline,
    date: s.date,
    sessionType: s.session_type,
    programVariant: s.program_variant,
    programWeek: s.program_week,
    durationMinutes: s.duration_minutes,
    bodyWeight: s.body_weight,
    notes: s.notes,
  }
}

/** Fetches one session by id (RLS scopes to the owner → foreign/bad id yields null) plus its
 *  discipline-specific children, shaped into a SessionDetail. */
export function useSessionDetail(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['sessionDetail', sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<SessionDetail | null> => {
      const supabase = getSupabase()
      const { data: s, error } = await supabase
        .from('sessions').select(SESSION_COLS).eq('id', sessionId as string).maybeSingle()
      if (error) throw error
      if (!s) return null
      const header = toHeader(s as Parameters<typeof toHeader>[0])

      if (header.discipline === 'strength') {
        const { data: rows, error: rErr } = await supabase
          .from('strength_sets')
          .select('weight, reps, rpe, is_warmup, order_index, set_number, duration_seconds, exercises(name)')
          .eq('session_id', (s as { id: string }).id)
          .order('order_index', { ascending: true })
          .order('set_number', { ascending: true })
        if (rErr) throw rErr
        const flat = (rows ?? []).map((r) => {
          const row = r as unknown as {
            weight: number | null; reps: number | null; rpe: number | null; is_warmup: boolean
            duration_seconds: number | null; exercises: { name: string } | null
          }
          return {
            exerciseName: row.exercises?.name ?? 'Exercise', weight: row.weight, reps: row.reps, rpe: row.rpe,
            isWarmup: row.is_warmup, durationSeconds: row.duration_seconds ?? null,
          }
        })
        return { kind: 'strength', header, exercises: groupStrengthSets(flat) }
      }

      if (header.discipline === 'cardio') {
        const { data: act, error: aErr } = await supabase
          .from('cardio_activities')
          .select('activity, distance_km, duration_minutes, notes')
          .eq('session_id', (s as { id: string }).id)
          .maybeSingle()
        if (aErr) throw aErr
        const a = (act ?? {}) as { activity?: string; distance_km?: number | null; duration_minutes?: number | null; notes?: string | null }
        const duration = a.duration_minutes ?? header.durationMinutes
        const distance = a.distance_km ?? null
        return {
          kind: 'cardio',
          header: { ...header, notes: a.notes ?? header.notes },
          activity: a.activity ?? 'Cardio',
          distanceKm: distance,
          durationMinutes: duration,
          pace: formatPace(duration, distance),
        }
      }

      // climbing
      const { data: sends, error: cErr } = await supabase
        .from('climbing_sends')
        .select('grade, count, attempts')
        .eq('session_id', (s as { id: string }).id)
      if (cErr) throw cErr
      const shaped = shapeClimbingSends((sends ?? []).map((r) => {
        const row = r as { grade: string; count: number; attempts: number }
        return { grade: row.grade, count: row.count, attempts: row.attempts }
      }))
      return { kind: 'climbing', header, sends: shaped.sends, totalSends: shaped.totalSends, totalAttempts: shaped.totalAttempts }
    },
  })
}
