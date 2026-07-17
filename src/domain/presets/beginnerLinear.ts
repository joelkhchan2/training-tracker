import type { Program, FixedSet } from '../types'

const fixed = (reps: number, count: number): FixedSet[] => Array.from({ length: count }, () => ({ reps }))

const ex = (name: string, reps: number, count: number, order: number) => ({
  exerciseName: name, order,
  scheme: { type: 'fixed' as const, sets: fixed(reps, count) },
})

export const beginnerLinear: Program = {
  name: 'Beginner Linear Progression',
  discipline: 'strength',
  progressionRule: { type: 'linear', add: 5, unit: 'lbs', on: 'session' },
  days: [
    { name: 'Day 1', exercises: [
      ex('Squat', 5, 3, 0),
      ex('Bench Press', 5, 3, 1),
      ex('Barbell Row', 5, 3, 2),
    ] },
    { name: 'Day 2', exercises: [
      ex('Squat', 5, 3, 0),
      ex('Overhead Press', 5, 3, 1),
      ex('Barbell Deadlift', 5, 3, 2),
    ] },
    { name: 'Day 3', exercises: [
      ex('Squat', 5, 3, 0),
      ex('Bench Press', 5, 3, 1),
      ex('Barbell Row', 5, 3, 2),
    ] },
  ],
}
