import type { Program, LinearSet, LinearProgressionConfig } from '../types'

const straight = (reps: number, count: number): LinearSet[] =>
  Array.from({ length: count }, () => ({ reps }))

// StrongLifts 5x5 progression: complete all 25 reps across all working sets -> +weight next
// session; 3 consecutive stalls on a lift -> deload it ~10%. No AMRAP set — every rep of
// every set is a straight working set, so `allWorkingSetsMet` alone drives progression.
const lower: LinearProgressionConfig = { increment: 5, deloadPercent: 0.1, failsBeforeDeload: 3 }
const upper: LinearProgressionConfig = { increment: 2.5, deloadPercent: 0.1, failsBeforeDeload: 3 }

const ex = (name: string, count: number, order: number, progression: LinearProgressionConfig) => ({
  exerciseName: name,
  order,
  scheme: { type: 'linear' as const, sets: straight(5, count), progression },
})

export const strongLifts5x5: Program = {
  name: 'StrongLifts 5x5',
  discipline: 'strength',
  progressionRule: { type: 'amrap_linear' },
  days: [
    { name: 'Workout A', exercises: [
      ex('Squat', 5, 0, lower),
      ex('Bench Press', 5, 1, upper),
      ex('Barbell Row', 5, 2, lower),
    ] },
    { name: 'Workout B', exercises: [
      ex('Squat', 5, 0, lower),
      ex('Overhead Press', 5, 1, upper),
      ex('Barbell Deadlift', 1, 2, lower),
    ] },
  ],
}
