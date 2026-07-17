import type { Program, FixedSet } from '../types'

const fixed = (reps: number, count: number): FixedSet[] => Array.from({ length: count }, () => ({ reps }))

const ex = (name: string, reps: number, count: number, order: number) => ({
  exerciseName: name, order,
  scheme: { type: 'fixed' as const, sets: fixed(reps, count) },
})

export const pushPullLegs: Program = {
  name: 'Push/Pull/Legs',
  discipline: 'strength',
  days: [
    { name: 'Push', exercises: [
      ex('Bench Press', 8, 4, 0),
      ex('Overhead Press', 10, 3, 1),
      ex('Triceps Pushdown', 12, 3, 2),
      ex('Lateral Raise', 12, 3, 3),
    ] },
    { name: 'Pull', exercises: [
      ex('Pull-ups', 8, 4, 0),
      ex('Barbell Row', 8, 4, 1),
      ex('Face Pulls', 12, 3, 2),
      ex('Bicep Curl', 12, 3, 3),
    ] },
    { name: 'Legs', exercises: [
      ex('Squat', 8, 4, 0),
      ex('Romanian Deadlift', 10, 3, 1),
      ex('Bulgarian Split Squat', 10, 3, 2),
      ex('Calf Raise', 12, 3, 3),
    ] },
  ],
}
