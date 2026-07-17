import type { Program, LinearSet, LinearProgressionConfig } from '../types'

/** 3x5+ — two straight sets followed by an AMRAP set targeting the same rep count. */
const threeByFivePlus = (targetReps = 5): LinearSet[] => [
  { reps: 5 },
  { reps: 5 },
  { reps: 5, amrap: true, targetReps },
]

// r/Fitness Basic Beginner Routine: every main lift is 3x5+ each session. +5/session lower,
// +2.5/session upper; an AMRAP set of >10 reps doubles next session's jump; missing the AMRAP
// deloads the lift ~10% immediately (failsBeforeDeload: 1 approximates the wiki's "<15 total
// reps" stall rule since the engine tracks consecutive AMRAP misses, not total rep counts).
const lower: LinearProgressionConfig = { increment: 5, deloadPercent: 0.1, failsBeforeDeload: 1, doubleThreshold: 11, doubleIncrement: 10 }
const upper: LinearProgressionConfig = { increment: 2.5, deloadPercent: 0.1, failsBeforeDeload: 1, doubleThreshold: 11, doubleIncrement: 5 }

const ex = (name: string, order: number, progression: LinearProgressionConfig) => ({
  exerciseName: name,
  order,
  scheme: { type: 'linear' as const, sets: threeByFivePlus(), progression },
})

export const basicBeginner: Program = {
  name: 'r/Fitness Basic Beginner Routine',
  discipline: 'strength',
  progressionRule: { type: 'amrap_linear' },
  days: [
    { name: 'Workout A', exercises: [
      ex('Squat', 0, lower),
      ex('Bench Press', 1, upper),
      ex('Barbell Row', 2, upper),
    ] },
    { name: 'Workout B', exercises: [
      ex('Barbell Deadlift', 0, lower),
      ex('Overhead Press', 1, upper),
      ex('Pull-ups', 2, upper),
    ] },
  ],
}
