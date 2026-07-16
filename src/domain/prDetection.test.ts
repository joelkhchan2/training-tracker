import { describe, it, expect } from 'vitest'
import { detectStrengthPRs, detectClimbingPR } from './prDetection'

describe('detectStrengthPRs', () => {
  const sets = [
    { exerciseName: 'Bench Press', weight: 225, reps: 5 },
    { exerciseName: 'Bench Press', weight: 200, reps: 8 },
  ]
  it('flags an e1RM PR (best across sets, strictly greater)', () => {
    const prs = detectStrengthPRs(sets, [{ exerciseName: 'Bench Press', prType: 'e1rm', value: 250 }])
    const e = prs.find(p => p.prType === 'e1rm')!
    expect(e).toEqual({ exerciseName: 'Bench Press', prType: 'e1rm', oldValue: 250, newValue: 262.5 })
  })
  it('flags a volume PR (sum weight*reps)', () => {
    const prs = detectStrengthPRs(sets, [{ exerciseName: 'Bench Press', prType: 'volume', value: 2600 }])
    const v = prs.find(p => p.prType === 'volume')!
    expect(v).toEqual({ exerciseName: 'Bench Press', prType: 'volume', oldValue: 2600, newValue: 2725 })
  })
  it('no PR when not strictly greater', () => {
    expect(detectStrengthPRs(sets, [
      { exerciseName: 'Bench Press', prType: 'e1rm', value: 262.5 },
      { exerciseName: 'Bench Press', prType: 'volume', value: 2725 },
    ])).toEqual([])
  })
  it('any positive value is a PR when no existing record', () => {
    const prs = detectStrengthPRs([{ exerciseName: 'Squat', weight: 100, reps: 5 }], [])
    expect(prs.find(p => p.prType === 'e1rm')?.oldValue).toBeNull()
  })
})

describe('detectClimbingPR', () => {
  it('flags a max-grade PR (highest sent grade > stored)', () => {
    expect(detectClimbingPR({ 5: 1, 3: 4 }, 4)).toEqual({
      exerciseName: 'Climbing', prType: 'max_v_grade', oldValue: 4, newValue: 5,
    })
  })
  it('no PR when highest grade not greater', () => {
    expect(detectClimbingPR({ 3: 2 }, 4)).toBeNull()
  })
})
