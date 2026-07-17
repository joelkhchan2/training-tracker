import type { Program, LinearSet, LinearProgressionConfig } from '../types'

const straight = (reps: number, count: number): LinearSet[] =>
  Array.from({ length: count }, () => ({ reps }))

// Starting Strength novice progression: +10 lbs/session on squat & deadlift, +5 lbs/session
// on bench & press. No AMRAP set — straight sets — and 3 consecutive missed sessions on a
// lift triggers a ~10% reset (the book's "you've stalled" reset, approximated here since the
// engine only tracks consecutive fails, not multi-session stall detection).
const squatDeadlift: LinearProgressionConfig = { increment: 10, deloadPercent: 0.1, failsBeforeDeload: 3 }
const pressBench: LinearProgressionConfig = { increment: 5, deloadPercent: 0.1, failsBeforeDeload: 3 }

const ex = (name: string, count: number, order: number, progression: LinearProgressionConfig) => ({
  exerciseName: name,
  order,
  scheme: { type: 'linear' as const, sets: straight(5, count), progression },
})

export const startingStrength: Program = {
  name: 'Starting Strength',
  discipline: 'strength',
  progressionRule: { type: 'amrap_linear' },
  days: [
    { name: 'Workout A', exercises: [
      ex('Squat', 3, 0, squatDeadlift),
      ex('Bench Press', 3, 1, pressBench),
      ex('Barbell Deadlift', 1, 2, squatDeadlift),
    ] },
    { name: 'Workout B', exercises: [
      ex('Squat', 3, 0, squatDeadlift),
      ex('Overhead Press', 3, 1, pressBench),
      ex('Barbell Deadlift', 1, 2, squatDeadlift),
    ] },
  ],
}
