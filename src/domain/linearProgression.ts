import type { LinearProgressionConfig } from './types'

export interface LinearProgressionResult {
  currentWeight: number
  fails: number
  allWorkingSetsMet: boolean
  amrapReps: number
  targetReps: number
}

export type LinearProgressionAction = 'increase' | 'increase-double' | 'hold' | 'deload'

export interface LinearProgressionOutcome {
  nextWeight: number
  nextFails: number
  action: LinearProgressionAction
}

/**
 * Round to the nearest 2.5 (rather than programEngine's r5, nearest-5).
 *
 * Rounding decision: real-world linear-progression increments include 2.5 lb
 * upper-body jumps (bench/press) alongside 5 lb and 10 lb lower-body/double
 * jumps. r5 would round 100 + 2.5 = 102.5 up to 105 — silently doubling a
 * 2.5 lb increment into a 5 lb one. r2_5 is a strict refinement of r5 for any
 * weight that's already a multiple of 5 (squat/deadlift-style progressions
 * are unaffected), while preserving exact 2.5 lb increments and deloads.
 */
function r2_5(n: number): number {
  return Math.round(n / 2.5) * 2.5
}

/**
 * Pure domain function: given a per-exercise linear-progression config and the
 * outcome of a session (working sets met + AMRAP top-set reps), decides the
 * next training weight, the updated consecutive-fails counter, and which
 * action was taken.
 */
export function applyLinearProgression(
  cfg: LinearProgressionConfig,
  result: LinearProgressionResult,
): LinearProgressionOutcome {
  const { currentWeight, fails, allWorkingSetsMet, amrapReps, targetReps } = result
  const met = allWorkingSetsMet && amrapReps >= targetReps

  if (met) {
    if (cfg.doubleThreshold != null && amrapReps >= cfg.doubleThreshold) {
      return { nextWeight: r2_5(currentWeight + (cfg.doubleIncrement ?? cfg.increment)), nextFails: 0, action: 'increase-double' }
    }
    return { nextWeight: r2_5(currentWeight + cfg.increment), nextFails: 0, action: 'increase' }
  }

  const newFails = fails + 1
  if (newFails >= cfg.failsBeforeDeload) {
    return { nextWeight: r2_5(currentWeight * (1 - cfg.deloadPercent)), nextFails: 0, action: 'deload' }
  }
  return { nextWeight: currentWeight, nextFails: newFails, action: 'hold' }
}
