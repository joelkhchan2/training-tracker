import type { Program, PercentageSet } from '../types'

// weeks 1-3 working sets (pct,reps); week 4 deload; fsl % per week (null in wk4)
const WEEKS = [
  { pcts: [0.65, 0.75, 0.85], reps: [5, 5, 5], fsl: 0.65 },
  { pcts: [0.70, 0.80, 0.90], reps: [3, 3, 3], fsl: 0.70 },
  { pcts: [0.75, 0.85, 0.95], reps: [5, 3, 1], fsl: 0.75 },
  { pcts: [0.40, 0.50, 0.60], reps: [5, 5, 5], fsl: null as number | null },
]

function mainLiftWeeks(fslSetCount: number): { sets: PercentageSet[] }[] {
  return WEEKS.map(w => {
    const working: PercentageSet[] = w.pcts.map((pct, i) => ({ pct, reps: w.reps[i], fsl: false }))
    const fsl: PercentageSet[] = w.fsl == null ? []
      : Array.from({ length: fslSetCount }, () => ({ pct: w.fsl as number, reps: 5, fsl: true }))
    return { sets: [...working, ...fsl] }
  })
}

const acc = (name: string, sets: number, reps: number, order: number) => ({
  exerciseName: name, order,
  scheme: { type: 'fixed' as const, sets: Array.from({ length: sets }, () => ({ reps })) },
})

export const fiveThreeOne: Program = {
  name: '5/3/1',
  discipline: 'strength',
  progressionRule: { type: 'cycle_tm_bump', bumps: { squat: 10, benchPress: 5, barbellDeadlift: 10, overheadPress: 5 } },
  days: [
    { name: 'Gym A', exercises: [
      { exerciseName: 'Squat', tmKey: 'squat', order: 0, scheme: { type: 'percentage', tmKey: 'squat', weeks: mainLiftWeeks(3) } },
      { exerciseName: 'Bench Press', tmKey: 'benchPress', order: 1, scheme: { type: 'percentage', tmKey: 'benchPress', weeks: mainLiftWeeks(3) } },
      acc('Pull-ups', 3, 5, 2), acc('Chest-Supported Row', 3, 8, 3), acc('Face Pulls', 3, 15, 4),
    ] },
    { name: 'Gym B', exercises: [
      { exerciseName: 'Barbell Deadlift', tmKey: 'barbellDeadlift', order: 0, scheme: { type: 'percentage', tmKey: 'barbellDeadlift', weeks: mainLiftWeeks(2) } },
      { exerciseName: 'Overhead Press', tmKey: 'overheadPress', order: 1, scheme: { type: 'percentage', tmKey: 'overheadPress', weeks: mainLiftWeeks(2) } },
      acc('Squat', 3, 8, 2), acc('Hanging Leg Raises', 3, 10, 3), acc('External Rotation', 3, 15, 4),
    ] },
  ],
}
