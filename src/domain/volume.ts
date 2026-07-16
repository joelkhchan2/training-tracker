import type { LoggedSet } from './types'

const MUSCLE_OVERRIDES: Record<string, string> = {
  'Squat': 'Legs', 'Bench Press': 'Chest', 'Barbell Deadlift': 'Back', 'Overhead Press': 'Shoulders',
  'Pull-ups': 'Back', 'Chest-Supported Row': 'Back', 'Face Pulls': 'Shoulders',
  'Hanging Leg Raises': 'Core', 'External Rotation': 'Shoulders', 'Romanian Deadlift': 'Back',
  'Bulgarian Split Squat': 'Legs', 'Calf Raise': 'Legs',
}

export function muscleGroupFor(name: string, musclesText = ''): string {
  if (MUSCLE_OVERRIDES[name]) return MUSCLE_OVERRIDES[name]
  const m = String(musclesText).toLowerCase()
  if (/chest|pec/.test(m)) return 'Chest'
  if (/lat|back|trap|rhomboid|row/.test(m)) return 'Back'
  if (/quad|hamstring|glute|calf|\bleg/.test(m)) return 'Legs'
  if (/delt|shoulder/.test(m)) return 'Shoulders'
  if (/bicep|tricep|forearm/.test(m)) return 'Arms'
  if (/\bab|core|oblique/.test(m)) return 'Core'
  return 'Unknown'
}

export function sessionTonnage(sets: LoggedSet[]): number {
  return sets.reduce((sum, s) => sum + s.weight * s.reps, 0)
}

export function setsByMuscleGroup(sets: Array<{ exerciseName: string; muscles?: string }>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of sets) { const g = muscleGroupFor(s.exerciseName, s.muscles); out[g] = (out[g] ?? 0) + 1 }
  return out
}
