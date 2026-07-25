import { epley1RM, round1, parseVGrade } from '../domain'

export interface StrengthRecord {
  exerciseId: string
  exerciseName: string
  bestE1rm: number
  bestE1rmWeight: number | null
  bestE1rmReps: number | null
  bestVolume: number
}

export interface SeededStrengthRow {
  exerciseId: string
  name: string
  prType: 'e1rm' | 'volume'
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
}

/** Pure: reconcile seeded personal_records with live strength_sets, per exercise_id, keeping the
 *  larger of the two for both e1RM and best-single-session volume. Preserves older all-time PRs
 *  that predate the logged set history while still surfacing newer live PRs. Sorted by e1RM desc. */
export function buildStrengthRecords(seeded: SeededStrengthRow[], live: LiveStrengthRow[]): StrengthRecord[] {
  const acc = new Map<string, Acc>()
  const get = (exerciseId: string, name: string): Acc => {
    let a = acc.get(exerciseId)
    if (!a) {
      a = {
        exerciseId, name,
        liveE1rm: 0, liveE1rmWeight: null, liveE1rmReps: null,
        volumeBySession: new Map(),
        seededE1rm: 0, seededE1rmWeight: null, seededE1rmReps: null, seededVolume: 0,
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
  }

  for (const s of seeded) {
    const a = get(s.exerciseId, s.name)
    if (s.prType === 'e1rm') {
      if (s.value > a.seededE1rm) { a.seededE1rm = s.value; a.seededE1rmWeight = s.weight; a.seededE1rmReps = s.reps }
    } else {
      if (s.value > a.seededVolume) a.seededVolume = s.value
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
    if (bestE1rm <= 0 && bestVolume <= 0) continue // nothing recorded for this exercise
    out.push({ exerciseId: a.exerciseId, exerciseName: a.name || 'Exercise', bestE1rm, bestE1rmWeight, bestE1rmReps, bestVolume })
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
