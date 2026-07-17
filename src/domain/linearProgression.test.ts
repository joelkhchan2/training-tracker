import { describe, it, expect } from 'vitest'
import { applyLinearProgression } from './linearProgression'
import type { LinearProgressionConfig } from './types'

// Basic Beginner Routine squat: +5/session, 3x5+ AMRAP last set, >10 reps doubles the jump, deload after 1 miss.
const basicBeginnerSquat: LinearProgressionConfig = {
  increment: 5,
  deloadPercent: 0.1,
  failsBeforeDeload: 1,
  doubleThreshold: 11,
  doubleIncrement: 10,
}

// StrongLifts 5x5 squat: +5/session, deload after 3 consecutive misses, no double-progression.
const strongLiftsSquat: LinearProgressionConfig = {
  increment: 5,
  deloadPercent: 0.1,
  failsBeforeDeload: 3,
}

// Upper-body lift (e.g. bench press): +2.5/session — must survive rounding without being bumped to +5.
const upperLiftBench: LinearProgressionConfig = {
  increment: 2.5,
  deloadPercent: 0.1,
  failsBeforeDeload: 1,
}

describe('applyLinearProgression', () => {
  describe('Basic Beginner squat (doubleThreshold: 11, doubleIncrement: 10)', () => {
    it('met, amrapReps below doubleThreshold: increases by plain increment', () => {
      const result = applyLinearProgression(basicBeginnerSquat, {
        currentWeight: 100, fails: 0, allWorkingSetsMet: true, amrapReps: 5, targetReps: 5,
      })
      expect(result).toEqual({ nextWeight: 105, nextFails: 0, action: 'increase' })
    })

    it('met, amrapReps >= doubleThreshold: doubles the increment', () => {
      const result = applyLinearProgression(basicBeginnerSquat, {
        currentWeight: 100, fails: 0, allWorkingSetsMet: true, amrapReps: 11, targetReps: 5,
      })
      expect(result).toEqual({ nextWeight: 110, nextFails: 0, action: 'increase-double' })
    })

    it('not met, failsBeforeDeload 1: deloads immediately', () => {
      const result = applyLinearProgression(basicBeginnerSquat, {
        currentWeight: 100, fails: 0, allWorkingSetsMet: true, amrapReps: 4, targetReps: 5,
      })
      expect(result).toEqual({ nextWeight: 90, nextFails: 0, action: 'deload' })
    })
  })

  describe('StrongLifts squat (failsBeforeDeload: 3)', () => {
    it('met: increases by increment, resets fails', () => {
      const result = applyLinearProgression(strongLiftsSquat, {
        currentWeight: 100, fails: 2, allWorkingSetsMet: true, amrapReps: 5, targetReps: 5,
      })
      expect(result).toEqual({ nextWeight: 105, nextFails: 0, action: 'increase' })
    })

    it('1st miss: holds weight, increments fails', () => {
      const result = applyLinearProgression(strongLiftsSquat, {
        currentWeight: 100, fails: 0, allWorkingSetsMet: false, amrapReps: 3, targetReps: 5,
      })
      expect(result).toEqual({ nextWeight: 100, nextFails: 1, action: 'hold' })
    })

    it('2nd consecutive miss: still holds, fails now 2', () => {
      const result = applyLinearProgression(strongLiftsSquat, {
        currentWeight: 100, fails: 1, allWorkingSetsMet: false, amrapReps: 3, targetReps: 5,
      })
      expect(result).toEqual({ nextWeight: 100, nextFails: 2, action: 'hold' })
    })

    it('3rd consecutive miss: deloads by 10%, resets fails to 0', () => {
      const result = applyLinearProgression(strongLiftsSquat, {
        currentWeight: 100, fails: 2, allWorkingSetsMet: false, amrapReps: 3, targetReps: 5,
      })
      expect(result).toEqual({ nextWeight: 90, nextFails: 0, action: 'deload' })
    })
  })

  describe('upper-body 2.5 increment (rounding must respect the configured increment)', () => {
    it('met: +2.5 survives rounding as 102.5, not bumped to 105 by nearest-5 rounding', () => {
      const result = applyLinearProgression(upperLiftBench, {
        currentWeight: 100, fails: 0, allWorkingSetsMet: true, amrapReps: 8, targetReps: 5,
      })
      expect(result).toEqual({ nextWeight: 102.5, nextFails: 0, action: 'increase' })
    })

    it('deload from a half-increment weight rounds to the nearest 2.5, not nearest 5', () => {
      const result = applyLinearProgression(upperLiftBench, {
        currentWeight: 102.5, fails: 0, allWorkingSetsMet: false, amrapReps: 2, targetReps: 5,
      })
      // 102.5 * 0.9 = 92.25 -> nearest 2.5 = 92.5
      expect(result).toEqual({ nextWeight: 92.5, nextFails: 0, action: 'deload' })
    })
  })

  describe('not-met precedence over doubleThreshold', () => {
    it('amrapReps high but allWorkingSetsMet false: still counts as not met', () => {
      const result = applyLinearProgression(basicBeginnerSquat, {
        currentWeight: 100, fails: 0, allWorkingSetsMet: false, amrapReps: 20, targetReps: 5,
      })
      expect(result).toEqual({ nextWeight: 90, nextFails: 0, action: 'deload' })
    })
  })
})
