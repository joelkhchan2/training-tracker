import type { Program, Cursor, TrainingMaxes } from './types'

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
