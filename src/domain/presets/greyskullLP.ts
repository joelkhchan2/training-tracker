import type { Program, LinearSet, LinearProgressionConfig } from '../types'

/** 2x5, 1x5+ — two straight sets followed by an AMRAP set targeting the same rep count. */
const twoByFivePlusOne = (targetReps = 5): LinearSet[] => [
  { reps: 5 },
  { reps: 5 },
  { reps: 5, amrap: true, targetReps },
]

/** Deadlift is kept to a single top-set AMRAP to manage fatigue, per common GSLP templates. */
const onePlus = (targetReps = 5): LinearSet[] => [{ reps: 5, amrap: true, targetReps }]

// Greyskull LP: +2.5/session upper, +5/session lower; missing the AMRAP resets that lift
// ~10% immediately (no double-progression rule in GSLP, unlike Basic Beginner).
const lower: LinearProgressionConfig = { increment: 5, deloadPercent: 0.1, failsBeforeDeload: 1 }
const upper: LinearProgressionConfig = { increment: 2.5, deloadPercent: 0.1, failsBeforeDeload: 1 }

const ex = (name: string, order: number, sets: LinearSet[], progression: LinearProgressionConfig) => ({
  exerciseName: name,
  order,
  scheme: { type: 'linear' as const, sets, progression },
})

export const greyskullLP: Program = {
  name: 'Greyskull LP',
  discipline: 'strength',
  progressionRule: { type: 'amrap_linear' },
  days: [
    { name: 'Workout A', exercises: [
      ex('Squat', 0, twoByFivePlusOne(), lower),
      ex('Bench Press', 1, twoByFivePlusOne(), upper),
      ex('Barbell Row', 2, twoByFivePlusOne(), upper),
    ] },
    { name: 'Workout B', exercises: [
      ex('Squat', 0, twoByFivePlusOne(), lower),
      ex('Overhead Press', 1, twoByFivePlusOne(), upper),
      ex('Barbell Deadlift', 2, onePlus(), lower),
    ] },
  ],
}
