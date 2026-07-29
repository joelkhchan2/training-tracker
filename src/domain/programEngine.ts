import type { Program, Cursor, TrainingMaxes, PrescribedExercise, PrescribedSet } from './types'

export function r5(n: number): number { return Math.round(n / 5) * 5 }

export function programWeekCount(program: Program): number {
  let weeks = 1
  if (!Array.isArray(program.days)) return weeks
  for (const day of program.days) {
    if (!Array.isArray(day.exercises)) continue
    for (const ex of day.exercises) {
      // `scheme` is jsonb; a malformed row can have a non-array `weeks`. Guard so a bad
      // row can't turn the count into NaN (which would break advanceCursor's week math).
      if (ex.scheme.type === 'percentage' && Array.isArray(ex.scheme.weeks)) {
        weeks = Math.max(weeks, ex.scheme.weeks.length)
      }
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
  if (!Array.isArray(program.days)) return []
  const day = program.days[cursor.dayIndex]
  if (!day || !Array.isArray(day.exercises)) return []
  // `scheme` is jsonb from the DB — a malformed/legacy row can have a non-array (or
  // missing) `sets`/`weeks`. Coerce to [] at every access so a bad row yields an empty
  // prescription instead of throwing and white-screening the workout screen.
  return day.exercises.map(ex => {
    let sets: PrescribedSet[]
    if (ex.scheme.type === 'percentage') {
      const tm = maxes[ex.scheme.tmKey] ?? 0
      const weeks = Array.isArray(ex.scheme.weeks) ? ex.scheme.weeks : []
      const wk = weeks[Math.min(cursor.week, weeks.length) - 1] ?? { sets: [] }
      const wkSets = Array.isArray(wk.sets) ? wk.sets : []
      sets = wkSets.map(s => ({ weight: r5(tm * s.pct), reps: s.reps, isFsl: !!s.fsl }))
    } else if (ex.scheme.type === 'fixed') {
      const fixedSets = Array.isArray(ex.scheme.sets) ? ex.scheme.sets : []
      sets = fixedSets.map(s => ({ weight: s.weight, reps: s.reps }))
    } else if (ex.scheme.type === 'timed') {
      // A timed scheme has no weight/reps concept at all — every set is just a
      // prescribed hold duration. `reps` is intentionally omitted (undefined), not
      // faked as 0, matching PrescribedSet's null-pattern convention.
      const timedSets = Array.isArray(ex.scheme.sets) ? ex.scheme.sets : []
      sets = timedSets.map(s => ({ durationSeconds: s.seconds }))
    } else {
      // 'linear' scheme (the remaining catch-all): weight comes from the per-exercise
      // working weight (progressed externally via applyLinearProgression), keyed by
      // ex.tmKey if present else exerciseName.
      const key = ex.tmKey ?? ex.exerciseName
      const weight = workingWeights?.[key] ?? 0
      const linearSets = Array.isArray(ex.scheme.sets) ? ex.scheme.sets : []
      sets = linearSets.map(s => {
        const set: PrescribedSet = { weight, reps: s.reps }
        if (s.amrap) { set.isAmrap = true; set.targetReps = s.targetReps ?? s.reps }
        return set
      })
    }
    return { exerciseName: ex.exerciseName, tmKey: ex.tmKey, sets }
  })
}
