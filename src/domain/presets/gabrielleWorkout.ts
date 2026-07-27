import type { Program, FixedSet } from '../types'

/** Three straight sets of 12 — the sheet's "Goal 3×12". `weight` bakes in her
 *  target from the sheet; omit it for bodyweight lifts (e.g. Decline Sit-ups). */
const sets3x12 = (weight?: number): FixedSet[] =>
  Array.from({ length: 3 }, () => (weight === undefined ? { reps: 12 } : { reps: 12, weight }))

const lift = (name: string, order: number, weight?: number) => ({
  exerciseName: name,
  order,
  scheme: { type: 'fixed' as const, sets: sets3x12(weight) },
})

/** A treadmill warm-up/cool-down: one check-off set (the model has no zero-set
 *  exercise). Weight/reps are nominal — she just taps ✓. */
const cardio = (name: string, order: number) => ({
  exerciseName: name,
  order,
  scheme: { type: 'fixed' as const, sets: [{ reps: 1 }] as FixedSet[] },
})

export const gabrielleWorkout: Program = {
  name: "Gabrielle's Workout",
  discipline: 'strength',
  days: [
    {
      name: 'Full Body',
      exercises: [
        cardio('Treadmill', 0),
        lift('45° Leg Press', 1, 90),
        lift('Pull-down', 2, 70),
        lift('Leg Extensions', 3, 110),
        lift('Leg Curl', 4, 70),
        lift('Shoulder Press', 5, 40),
        lift('Cable Row', 6, 66),
        lift('Decline Sit-ups', 7),
        cardio('Treadmill', 8),
      ],
    },
  ],
}
