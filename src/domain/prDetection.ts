import type { LoggedSet, ClimbingSends, PersonalRecord, DetectedPR } from './types'
import { epley1RM, round1 } from './oneRepMax'

export function detectStrengthPRs(sets: LoggedSet[], existing: PersonalRecord[]): DetectedPR[] {
  const byExercise = new Map<string, LoggedSet[]>()
  for (const s of sets) {
    const arr = byExercise.get(s.exerciseName) ?? []
    arr.push(s); byExercise.set(s.exerciseName, arr)
  }
  const find = (name: string, t: 'e1rm' | 'volume') =>
    existing.find(p => p.exerciseName === name && p.prType === t) ?? null

  const out: DetectedPR[] = []
  for (const [name, exSets] of byExercise) {
    const bestE1RM = round1(Math.max(...exSets.map(s => epley1RM(s.weight, s.reps))))
    const volume = exSets.reduce((sum, s) => sum + s.weight * s.reps, 0)
    const e = find(name, 'e1rm')
    if (bestE1RM > 0 && (!e || bestE1RM > e.value))
      out.push({ exerciseName: name, prType: 'e1rm', oldValue: e ? e.value : null, newValue: bestE1RM })
    const v = find(name, 'volume')
    if (volume > 0 && (!v || volume > v.value))
      out.push({ exerciseName: name, prType: 'volume', oldValue: v ? v.value : null, newValue: volume })
  }
  return out
}

export function detectClimbingPR(sends: ClimbingSends, existingMaxGrade: number | null): DetectedPR | null {
  let highest = -1
  for (let g = 8; g >= 0; g--) { if ((sends[g] ?? 0) > 0) { highest = g; break } }
  if (highest < 0) return null
  if (existingMaxGrade == null || highest > existingMaxGrade)
    return { exerciseName: 'Climbing', prType: 'max_v_grade', oldValue: existingMaxGrade, newValue: highest }
  return null
}
