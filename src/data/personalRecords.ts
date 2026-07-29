import { useQuery } from '@tanstack/react-query'
import { epley1RM, round1, parseVGrade } from '../domain'
import { getSupabase } from './supabase'

export interface StrengthRecord {
  exerciseId: string
  exerciseName: string
  bestE1rm: number
  bestE1rmWeight: number | null
  bestE1rmReps: number | null
  bestVolume: number
  /** Longest held duration (seconds) across timed/weighted_time sets; 0 = none,
   *  matching bestE1rm/bestVolume's "0 = unset" convention. */
  bestDuration: number
  /** Weight logged alongside bestDuration (a weighted_time hold); null for a
   *  bodyweight timed hold, or when bestDuration is unset. */
  bestDurationWeight: number | null
  movementPattern: string | null
}

export interface SeededStrengthRow {
  exerciseId: string
  name: string
  prType: 'e1rm' | 'volume' | 'max_duration'
  value: number
  weight: number | null
  reps: number | null
}

export interface LiveStrengthRow {
  exerciseId: string
  name: string
  sessionId: string
  weight: number
  reps: number
  movementPattern?: string | null
}

export interface LiveDurationRow {
  exerciseId: string
  name: string
  weight: number | null
  durationSeconds: number
  movementPattern: string | null
}

interface Acc {
  exerciseId: string
  name: string
  liveE1rm: number
  liveE1rmWeight: number | null
  liveE1rmReps: number | null
  volumeBySession: Map<string, number>
  seededE1rm: number
  seededE1rmWeight: number | null
  seededE1rmReps: number | null
  seededVolume: number
  liveDuration: number
  liveDurationWeight: number | null
  seededDuration: number
  seededDurationWeight: number | null
  movementPattern: string | null
}

/** Pure: reconcile seeded personal_records with live strength_sets, per exercise_id, keeping the
 *  larger of the two for both e1RM and best-single-session volume. Preserves older all-time PRs
 *  that predate the logged set history while still surfacing newer live PRs. Sorted by e1RM desc. */
export function buildStrengthRecords(
  seeded: SeededStrengthRow[],
  live: LiveStrengthRow[],
  liveDurations: LiveDurationRow[] = [],
): StrengthRecord[] {
  const acc = new Map<string, Acc>()
  const get = (exerciseId: string, name: string): Acc => {
    let a = acc.get(exerciseId)
    if (!a) {
      a = {
        exerciseId, name,
        liveE1rm: 0, liveE1rmWeight: null, liveE1rmReps: null,
        volumeBySession: new Map(),
        seededE1rm: 0, seededE1rmWeight: null, seededE1rmReps: null, seededVolume: 0,
        liveDuration: 0, liveDurationWeight: null,
        seededDuration: 0, seededDurationWeight: null,
        movementPattern: null,
      }
      acc.set(exerciseId, a)
    } else if (name && (!a.name || a.name === 'Exercise')) {
      a.name = name
    }
    return a
  }

  for (const r of live) {
    const a = get(r.exerciseId, r.name)
    const e = round1(epley1RM(r.weight, r.reps))
    if (e > a.liveE1rm) { a.liveE1rm = e; a.liveE1rmWeight = r.weight; a.liveE1rmReps = r.reps }
    a.volumeBySession.set(r.sessionId, (a.volumeBySession.get(r.sessionId) ?? 0) + r.weight * r.reps)
    if (r.movementPattern != null) a.movementPattern = r.movementPattern
  }

  for (const d of liveDurations) {
    const a = get(d.exerciseId, d.name)
    if (d.durationSeconds > a.liveDuration) { a.liveDuration = d.durationSeconds; a.liveDurationWeight = d.weight }
    if (d.movementPattern != null) a.movementPattern = d.movementPattern
  }

  for (const s of seeded) {
    const a = get(s.exerciseId, s.name)
    if (s.prType === 'e1rm') {
      if (s.value > a.seededE1rm) { a.seededE1rm = s.value; a.seededE1rmWeight = s.weight; a.seededE1rmReps = s.reps }
    } else if (s.prType === 'volume') {
      if (s.value > a.seededVolume) a.seededVolume = s.value
    } else {
      if (s.value > a.seededDuration) { a.seededDuration = s.value; a.seededDurationWeight = s.weight }
    }
  }

  const out: StrengthRecord[] = []
  for (const a of acc.values()) {
    const liveVolume = a.volumeBySession.size > 0 ? Math.max(...a.volumeBySession.values()) : 0
    const bestVolume = Math.max(a.seededVolume, liveVolume)
    let bestE1rm: number
    let bestE1rmWeight: number | null
    let bestE1rmReps: number | null
    if (a.liveE1rm >= a.seededE1rm) {
      bestE1rm = a.liveE1rm; bestE1rmWeight = a.liveE1rmWeight; bestE1rmReps = a.liveE1rmReps
    } else {
      bestE1rm = a.seededE1rm; bestE1rmWeight = a.seededE1rmWeight; bestE1rmReps = a.seededE1rmReps
    }
    let bestDuration: number
    let bestDurationWeight: number | null
    if (a.liveDuration >= a.seededDuration) {
      bestDuration = a.liveDuration; bestDurationWeight = a.liveDurationWeight
    } else {
      bestDuration = a.seededDuration; bestDurationWeight = a.seededDurationWeight
    }
    if (bestE1rm <= 0 && bestVolume <= 0 && bestDuration <= 0) continue // nothing recorded for this exercise
    out.push({
      exerciseId: a.exerciseId, exerciseName: a.name || 'Exercise',
      bestE1rm, bestE1rmWeight, bestE1rmReps, bestVolume,
      bestDuration, bestDurationWeight,
      movementPattern: a.movementPattern,
    })
  }
  out.sort((x, y) => y.bestE1rm - x.bestE1rm)
  return out
}

/** Pure: best V-grade = max(seeded max_v_grade, max parseable live grade); null when neither exists. */
export function buildClimbingRecord(seededMaxGrade: number | null, liveGrades: string[]): number | null {
  let best = seededMaxGrade ?? -1
  for (const g of liveGrades) {
    const n = parseVGrade(g)
    if (n != null && n > best) best = n
  }
  return best < 0 ? null : best
}

/** Reads seeded personal_records + live strength_sets/climbing_sends (all owner-scoped by RLS) and
 *  reconciles them into display records. */
export function usePersonalRecords(userId: string | undefined) {
  return useQuery({
    queryKey: ['personalRecords', userId],
    enabled: !!userId,
    queryFn: async (): Promise<{ strength: StrengthRecord[]; climbingMaxGrade: number | null }> => {
      const supabase = getSupabase()

      const { data: prs, error: prErr } = await supabase
        .from('personal_records')
        .select('exercise_id, pr_type, value, weight, reps, exercises(name)')
        .eq('user_id', userId as string)
      if (prErr) throw prErr

      const { data: sets, error: sErr } = await supabase
        .from('strength_sets')
        .select('exercise_id, session_id, weight, reps, exercises(name, movement_pattern)')
        .eq('user_id', userId as string)
        .eq('is_warmup', false)
        .not('weight', 'is', null)
        .not('reps', 'is', null)
        .limit(5000)
      if (sErr) throw sErr

      // Separate query, not a relaxed version of the one above: the e1RM/volume query's
      // `.not('weight','is',null).not('reps','is',null)` filter structurally excludes
      // every duration-bearing row (a `timed` row has weight=null, a `weighted_time`
      // row has reps=null) — relaxing it would break epley1RM/tonnage's non-null
      // assumptions.
      const { data: durSets, error: dErr } = await supabase
        .from('strength_sets')
        .select('exercise_id, weight, duration_seconds, exercises(name, movement_pattern)')
        .eq('user_id', userId as string)
        .eq('is_warmup', false)
        .not('duration_seconds', 'is', null)
        .limit(5000)
      if (dErr) throw dErr

      const { data: sends, error: cErr } = await supabase
        .from('climbing_sends')
        .select('grade')
        .eq('user_id', userId as string)
        .gt('count', 0)
      if (cErr) throw cErr

      const seeded: SeededStrengthRow[] = []
      let seededMaxGrade: number | null = null
      for (const r of (prs ?? []) as unknown as {
        exercise_id: string | null; pr_type: string; value: number; weight: number | null; reps: number | null; exercises: { name: string } | null
      }[]) {
        if (r.pr_type === 'max_v_grade') {
          seededMaxGrade = seededMaxGrade == null ? Number(r.value) : Math.max(seededMaxGrade, Number(r.value))
        } else if ((r.pr_type === 'e1rm' || r.pr_type === 'volume' || r.pr_type === 'max_duration') && r.exercise_id) {
          seeded.push({ exerciseId: r.exercise_id, name: r.exercises?.name ?? 'Exercise', prType: r.pr_type, value: Number(r.value), weight: r.weight, reps: r.reps })
        }
      }

      const live: LiveStrengthRow[] = ((sets ?? []) as unknown as {
        exercise_id: string | null; session_id: string; weight: number; reps: number; exercises: { name: string; movement_pattern: string | null } | null
      }[])
        .filter((r) => r.exercise_id)
        .map((r) => ({ exerciseId: r.exercise_id as string, name: r.exercises?.name ?? 'Exercise', sessionId: r.session_id, weight: r.weight, reps: r.reps, movementPattern: r.exercises?.movement_pattern ?? null }))

      const liveDurations: LiveDurationRow[] = ((durSets ?? []) as unknown as {
        exercise_id: string | null; weight: number | null; duration_seconds: number; exercises: { name: string; movement_pattern: string | null } | null
      }[])
        .filter((r) => r.exercise_id)
        .map((r) => ({ exerciseId: r.exercise_id as string, name: r.exercises?.name ?? 'Exercise', weight: r.weight, durationSeconds: r.duration_seconds, movementPattern: r.exercises?.movement_pattern ?? null }))

      const liveGrades = ((sends ?? []) as { grade: string }[]).map((r) => r.grade)

      return {
        strength: buildStrengthRecords(seeded, live, liveDurations),
        climbingMaxGrade: buildClimbingRecord(seededMaxGrade, liveGrades),
      }
    },
  })
}

/** Pure: filter by name substring (case-insensitive) and movement pattern, then sort. */
export function filterSortRecords(
  records: StrengthRecord[],
  opts: { query: string; pattern: string; sort: 'e1rm' | 'volume' | 'name' },
): StrengthRecord[] {
  const q = opts.query.trim().toLowerCase()
  let out = records.filter(r => (q === '' || r.exerciseName.toLowerCase().includes(q)))
  if (opts.pattern !== 'all') {
    out = out.filter(r => opts.pattern === 'other' ? r.movementPattern == null : r.movementPattern === opts.pattern)
  }
  const sorted = [...out]
  if (opts.sort === 'name') sorted.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))
  else if (opts.sort === 'volume') sorted.sort((a, b) => b.bestVolume - a.bestVolume)
  else sorted.sort((a, b) => b.bestE1rm - a.bestE1rm)
  return sorted
}
