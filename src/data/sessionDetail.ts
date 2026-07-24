import { parseVGrade } from '../domain'
import type { Discipline } from '../domain'

export interface DetailSet {
  weight: number | null
  reps: number | null
  rpe: number | null
  isWarmup: boolean
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
  sends: { grade: string; count: number }[]
  totalSends: number
}

export type SessionDetail = StrengthSessionDetail | CardioSessionDetail | ClimbingSessionDetail

/** Pure: group flat strength rows (already ordered by order_index, set_number) into consecutive
 *  same-exercise groups, preserving the performed order (a superset A,B,A,B → four groups). */
export function groupStrengthSets(
  rows: { exerciseName: string; weight: number | null; reps: number | null; rpe: number | null; isWarmup: boolean }[],
): StrengthExerciseGroup[] {
  const groups: StrengthExerciseGroup[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    const set: DetailSet = { weight: r.weight, reps: r.reps, rpe: r.rpe, isWarmup: r.isWarmup }
    if (last && last.exerciseName === r.exerciseName) last.sets.push(set)
    else groups.push({ exerciseName: r.exerciseName, sets: [set] })
  }
  return groups
}

/** Pure: a set's load as "weight×reps" (or "BW×reps" when weight is null — matches
 *  ExerciseHistorySheet), "@rpe" appended when present; drops "×reps" when reps is null. */
export function formatSet(set: DetailSet): string {
  const load = set.weight != null ? String(set.weight) : 'BW'
  const base = set.reps != null ? `${load}×${set.reps}` : load
  return set.rpe != null ? `${base} @${set.rpe}` : base
}

/** Pure: order climbing sends highest-v-grade-first; unparseable grades (e.g. font) are kept and
 *  sorted to the end by raw string. totalSends counts every row. */
export function shapeClimbingSends(
  rows: { grade: string; count: number }[],
): { sends: { grade: string; count: number }[]; totalSends: number } {
  const sends = [...rows].sort((a, b) => {
    const na = parseVGrade(a.grade)
    const nb = parseVGrade(b.grade)
    if (na != null && nb != null) return nb - na
    if (na != null) return -1
    if (nb != null) return 1
    return a.grade < b.grade ? -1 : a.grade > b.grade ? 1 : 0
  })
  const totalSends = rows.reduce((sum, r) => sum + r.count, 0)
  return { sends, totalSends }
}
