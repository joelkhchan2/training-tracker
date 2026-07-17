import type { Program, FixedSet } from '../types'

const fixed = (reps: number, count: number): FixedSet[] => Array.from({ length: count }, () => ({ reps }))

const ex = (name: string, reps: number, count: number, order: number) => ({
  exerciseName: name, order,
  scheme: { type: 'fixed' as const, sets: fixed(reps, count) },
})

export const strongLifts5x5: Program = {
  name: 'StrongLifts 5x5',
  discipline: 'strength',
  progressionRule: { type: 'linear', add: 5, unit: 'lbs', on: 'session' },
  days: [
    { name: 'Workout A', exercises: [
      ex('Squat', 5, 5, 0),
      ex('Bench Press', 5, 5, 1),
      ex('Barbell Row', 5, 5, 2),
    ] },
    { name: 'Workout B', exercises: [
      ex('Squat', 5, 5, 0),
      ex('Overhead Press', 5, 5, 1),
      ex('Barbell Deadlift', 5, 1, 2),
    ] },
  ],
}
