import { describe, it, expect } from 'vitest'
import { r5, programWeekCount, advanceCursor, applyProgression, getPrescription } from './programEngine'
import type { Program } from './types'
import { fiveThreeOne } from './presets/fiveThreeOne'

// Minimal 2-day, 4-week percentage program (structure only; sets filled in Task 4 tests)
const P4: Program = {
  name: 'test', discipline: 'strength',
  progressionRule: { type: 'cycle_tm_bump', bumps: { squat: 10, benchPress: 5 } },
  days: [
    { name: 'A', exercises: [{ exerciseName: 'Squat', tmKey: 'squat', order: 0,
      scheme: { type: 'percentage', tmKey: 'squat', weeks: [ {sets:[]},{sets:[]},{sets:[]},{sets:[]} ] } }] },
    { name: 'B', exercises: [{ exerciseName: 'Deadlift', tmKey: 'barbellDeadlift', order: 0,
      scheme: { type: 'percentage', tmKey: 'barbellDeadlift', weeks: [ {sets:[]},{sets:[]},{sets:[]},{sets:[]} ] } }] },
  ],
}

describe('r5', () => {
  it('rounds to nearest 5', () => { expect(r5(133)).toBe(135); expect(r5(137.5)).toBe(140); expect(r5(130)).toBe(130) })
})

describe('programWeekCount', () => {
  it('is the max weeks across percentage schemes', () => { expect(programWeekCount(P4)).toBe(4) })
})

describe('advanceCursor', () => {
  it('advances day within a week', () => {
    expect(advanceCursor(P4, { dayIndex: 0, week: 1, cycle: 1 }))
      .toEqual({ cursor: { dayIndex: 1, week: 1, cycle: 1 }, cycleComplete: false })
  })
  it('wraps to next week after last day', () => {
    expect(advanceCursor(P4, { dayIndex: 1, week: 1, cycle: 1 }))
      .toEqual({ cursor: { dayIndex: 0, week: 2, cycle: 1 }, cycleComplete: false })
  })
  it('completes the cycle after last day of last week', () => {
    expect(advanceCursor(P4, { dayIndex: 1, week: 4, cycle: 1 }))
      .toEqual({ cursor: { dayIndex: 0, week: 1, cycle: 2 }, cycleComplete: true })
  })
})

describe('applyProgression', () => {
  it('cycle_tm_bump adds per-lift increments', () => {
    expect(applyProgression(P4, { squat: 200, benchPress: 150 }))
      .toEqual({ squat: 210, benchPress: 155 })
  })
  it('linear adds a flat amount to every max', () => {
    const lin: Program = { ...P4, progressionRule: { type: 'linear', add: 5, unit: 'lbs', on: 'session' } }
    expect(applyProgression(lin, { squat: 200, benchPress: 150 })).toEqual({ squat: 205, benchPress: 155 })
  })
  it('no rule returns maxes unchanged', () => {
    const none: Program = { ...P4, progressionRule: undefined }
    expect(applyProgression(none, { squat: 200 })).toEqual({ squat: 200 })
  })
})

describe('getPrescription (5/3/1 preset)', () => {
  const maxes = { squat: 200, benchPress: 200, barbellDeadlift: 200, overheadPress: 200 }

  it('week 1, day A squat = 3 working + 3 FSL, FSL reps are 5', () => {
    const day = getPrescription(fiveThreeOne, { dayIndex: 0, week: 1, cycle: 1 }, maxes)
    const squat = day.find(e => e.exerciseName === 'Squat')!
    expect(squat.sets).toEqual([
      { weight: 130, reps: 5, isFsl: false },
      { weight: 150, reps: 5, isFsl: false },
      { weight: 170, reps: 5, isFsl: false },
      { weight: 130, reps: 5, isFsl: true },
      { weight: 130, reps: 5, isFsl: true },
      { weight: 130, reps: 5, isFsl: true },
    ])
  })

  it('week 1, day B deadlift = 3 working + 2 FSL (5 sets total)', () => {
    const day = getPrescription(fiveThreeOne, { dayIndex: 1, week: 1, cycle: 1 }, maxes)
    const dl = day.find(e => e.exerciseName === 'Barbell Deadlift')!
    expect(dl.sets.filter(s => s.isFsl).length).toBe(2)
    expect(dl.sets.length).toBe(5)
  })

  it('week 4 (deload) squat = 3 working sets, no FSL', () => {
    const day = getPrescription(fiveThreeOne, { dayIndex: 0, week: 4, cycle: 1 }, maxes)
    const squat = day.find(e => e.exerciseName === 'Squat')!
    expect(squat.sets).toEqual([
      { weight: 80, reps: 5, isFsl: false },
      { weight: 100, reps: 5, isFsl: false },
      { weight: 120, reps: 5, isFsl: false },
    ])
  })

  it('fixed-scheme accessory has no weight prescribed', () => {
    const day = getPrescription(fiveThreeOne, { dayIndex: 0, week: 1, cycle: 1 }, maxes)
    const acc = day.find(e => e.exerciseName === 'Pull-ups')!
    expect(acc.sets.every(s => s.weight === undefined)).toBe(true)
    expect(acc.sets.length).toBe(3)
  })
})
