import type { Program, Cursor, TrainingMaxes, PrescribedExercise, PrescribedSet } from './types'

export function r5(n: number): number { return Math.round(n / 5) * 5 }

export function programWeekCount(program: Program): number {
  let weeks = 1
  for (const day of program.days) {
    for (const ex of day.exercises) {
      if (ex.scheme.type === 'percentage') weeks = Math.max(weeks, ex.scheme.weeks.length)
    }
  }
  return weeks
}

export function advanceCursor(program: Program, cursor: Cursor): { cursor: Cursor; cycleComplete: boolean } {
  const dayCount = program.days.length
  const weekCount = programWeekCount(program)
  let { dayIndex, week, cycle } = cursor
  dayIndex += 1
  if (dayIndex >= dayCount) {
    dayIndex = 0
    week += 1
    if (week > weekCount) { week = 1; cycle += 1; return { cursor: { dayIndex, week, cycle }, cycleComplete: true } }
  }
  return { cursor: { dayIndex, week, cycle }, cycleComplete: false }
}

export function applyProgression(program: Program, maxes: TrainingMaxes): TrainingMaxes {
  const rule = program.progressionRule
  if (!rule) return { ...maxes }
  const out: TrainingMaxes = { ...maxes }
  if (rule.type === 'cycle_tm_bump') {
    for (const [k, inc] of Object.entries(rule.bumps)) out[k] = (out[k] ?? 0) + inc
  } else if (rule.type === 'linear') {
    for (const k of Object.keys(out)) out[k] = out[k] + rule.add
  }
  return out
}

export function getPrescription(
  program: Program,
  cursor: Cursor,
  maxes: TrainingMaxes,
  workingWeights?: Record<string, number>,
): PrescribedExercise[] {
  const day = program.days[cursor.dayIndex]
  if (!day) return []
  return day.exercises.map(ex => {
    let sets: PrescribedSet[]
    if (ex.scheme.type === 'percentage') {
      const tm = maxes[ex.scheme.tmKey] ?? 0
      const wk = ex.scheme.weeks[Math.min(cursor.week, ex.scheme.weeks.length) - 1] ?? { sets: [] }
      sets = wk.sets.map(s => ({ weight: r5(tm * s.pct), reps: s.reps, isFsl: !!s.fsl }))
    } else if (ex.scheme.type === 'fixed') {
      sets = ex.scheme.sets.map(s => ({ weight: s.weight, reps: s.reps }))
    } else {
      // 'linear' scheme: weight comes from the per-exercise working weight (progressed
      // externally via applyLinearProgression), keyed by ex.tmKey if present else exerciseName.
      const key = ex.tmKey ?? ex.exerciseName
      const weight = workingWeights?.[key] ?? 0
      sets = ex.scheme.sets.map(s => {
        const set: PrescribedSet = { weight, reps: s.reps }
        if (s.amrap) { set.isAmrap = true; set.targetReps = s.targetReps ?? s.reps }
        return set
      })
    }
    return { exerciseName: ex.exerciseName, tmKey: ex.tmKey, sets }
  })
}
