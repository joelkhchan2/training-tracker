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

  it('accessory reps match the source Config.js SESSION_TEMPLATES defaultReps', () => {
    const dayA = getPrescription(fiveThreeOne, { dayIndex: 0, week: 1, cycle: 1 }, maxes)
    const dayB = getPrescription(fiveThreeOne, { dayIndex: 1, week: 1, cycle: 1 }, maxes)

    const pullUps = dayA.find(e => e.exerciseName === 'Pull-ups')!
    expect(pullUps.sets.every(s => s.reps === 5)).toBe(true)

    const row = dayA.find(e => e.exerciseName === 'Chest-Supported Row')!
    expect(row.sets.every(s => s.reps === 8)).toBe(true)

    const facePulls = dayA.find(e => e.exerciseName === 'Face Pulls')!
    expect(facePulls.sets.every(s => s.reps === 15)).toBe(true)

    const squatAcc = dayB.find(e => e.exerciseName === 'Squat')!
    expect(squatAcc.sets.every(s => s.reps === 8)).toBe(true)

    const legRaises = dayB.find(e => e.exerciseName === 'Hanging Leg Raises')!
    expect(legRaises.sets.every(s => s.reps === 10)).toBe(true)

    const externalRotation = dayB.find(e => e.exerciseName === 'External Rotation')!
    expect(externalRotation.sets.every(s => s.reps === 15)).toBe(true)
  })

  it('week 5 (past program length) clamps to week 4 deload — squat 3 working sets, no FSL', () => {
    const day = getPrescription(fiveThreeOne, { dayIndex: 0, week: 5, cycle: 1 }, maxes)
    const squat = day.find(e => e.exerciseName === 'Squat')!
    expect(squat.sets).toEqual([
      { weight: 80, reps: 5, isFsl: false },
      { weight: 100, reps: 5, isFsl: false },
      { weight: 120, reps: 5, isFsl: false },
    ])
  })

  it('empty maxes ({}) — percentage sets get weight 0 via r5(0)', () => {
    const day = getPrescription(fiveThreeOne, { dayIndex: 0, week: 1, cycle: 1 }, {})
    const squat = day.find(e => e.exerciseName === 'Squat')!
    expect(squat.sets.every(s => s.weight === 0)).toBe(true)
  })
})

describe('getPrescription (linear scheme)', () => {
  const linearProgram: Program = {
    name: 'linear-test', discipline: 'strength',
    days: [
      { name: 'A', exercises: [{ exerciseName: 'Squat', tmKey: 'squat', order: 0,
        scheme: { type: 'linear', sets: [{ reps: 5 }, { reps: 5 }, { reps: 5, amrap: true, targetReps: 5 }] } }] },
    ],
  }

  it('every set gets the working weight, and the amrap set carries isAmrap + targetReps', () => {
    const day = getPrescription(linearProgram, { dayIndex: 0, week: 1, cycle: 1 }, {}, { squat: 100 })
    const squat = day.find(e => e.exerciseName === 'Squat')!
    expect(squat.sets).toEqual([
      { weight: 100, reps: 5 },
      { weight: 100, reps: 5 },
      { weight: 100, reps: 5, isAmrap: true, targetReps: 5 },
    ])
  })

  it('falls back to weight 0 when the working weight is missing', () => {
    const day = getPrescription(linearProgram, { dayIndex: 0, week: 1, cycle: 1 }, {}, {})
    const squat = day.find(e => e.exerciseName === 'Squat')!
    expect(squat.sets.every(s => s.weight === 0)).toBe(true)
  })

  it('falls back to weight 0 when workingWeights is omitted entirely (back-compat call)', () => {
    const day = getPrescription(linearProgram, { dayIndex: 0, week: 1, cycle: 1 }, {})
    const squat = day.find(e => e.exerciseName === 'Squat')!
    expect(squat.sets.every(s => s.weight === 0)).toBe(true)
  })

  it('defaults targetReps to the set reps when amrap is true but targetReps is omitted', () => {
    const noTargetProgram: Program = {
      ...linearProgram,
      days: [{ name: 'A', exercises: [{ exerciseName: 'Squat', tmKey: 'squat', order: 0,
        scheme: { type: 'linear', sets: [{ reps: 5, amrap: true }] } }] }],
    }
    const day = getPrescription(noTargetProgram, { dayIndex: 0, week: 1, cycle: 1 }, {}, { squat: 100 })
    const squat = day.find(e => e.exerciseName === 'Squat')!
    expect(squat.sets).toEqual([{ weight: 100, reps: 5, isAmrap: true, targetReps: 5 }])
  })

  it('uses exerciseName as the workingWeights key when the exercise has no tmKey', () => {
    const noTmKeyProgram: Program = {
      ...linearProgram,
      days: [{ name: 'A', exercises: [{ exerciseName: 'Squat', order: 0,
        scheme: { type: 'linear', sets: [{ reps: 5 }] } }] }],
    }
    const day = getPrescription(noTmKeyProgram, { dayIndex: 0, week: 1, cycle: 1 }, {}, { Squat: 135 })
    const squat = day.find(e => e.exerciseName === 'Squat')!
    expect(squat.sets).toEqual([{ weight: 135, reps: 5 }])
  })
})
