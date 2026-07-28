import { describe, expect, it } from 'vitest'
import { groupStrengthSets, formatSet, shapeClimbingSends } from './sessionDetail'

describe('groupStrengthSets', () => {
  it('groups consecutive sets of the same exercise, preserving order', () => {
    const rows = [
      { exerciseName: 'Squat', weight: 100, reps: 5, rpe: null, isWarmup: true },
      { exerciseName: 'Squat', weight: 140, reps: 5, rpe: 8, isWarmup: false },
      { exerciseName: 'Bench', weight: 80, reps: 5, rpe: null, isWarmup: false },
    ]
    const out = groupStrengthSets(rows)
    expect(out.map(g => g.exerciseName)).toEqual(['Squat', 'Bench'])
    expect(out[0].sets).toHaveLength(2)
    expect(out[1].sets[0]).toEqual({ weight: 80, reps: 5, rpe: null, isWarmup: false })
  })

  it('treats a non-consecutive repeat as a new group (superset order preserved)', () => {
    const rows = [
      { exerciseName: 'A', weight: 1, reps: 1, rpe: null, isWarmup: false },
      { exerciseName: 'B', weight: 2, reps: 2, rpe: null, isWarmup: false },
      { exerciseName: 'A', weight: 3, reps: 3, rpe: null, isWarmup: false },
    ]
    expect(groupStrengthSets(rows).map(g => g.exerciseName)).toEqual(['A', 'B', 'A'])
  })

  it('returns [] for no rows', () => {
    expect(groupStrengthSets([])).toEqual([])
  })
})

describe('formatSet', () => {
  it('renders weight×reps', () => {
    expect(formatSet({ weight: 60, reps: 5, rpe: null, isWarmup: false })).toBe('60×5')
  })
  it('renders BW×reps when weight is null', () => {
    expect(formatSet({ weight: null, reps: 8, rpe: null, isWarmup: false })).toBe('BW×8')
  })
  it('renders 0×reps when weight is 0 (matches ExerciseHistorySheet)', () => {
    expect(formatSet({ weight: 0, reps: 8, rpe: null, isWarmup: false })).toBe('0×8')
  })
  it('appends @rpe when present', () => {
    expect(formatSet({ weight: 100, reps: 3, rpe: 9, isWarmup: false })).toBe('100×3 @9')
  })
  it('drops ×reps when reps is null', () => {
    expect(formatSet({ weight: 100, reps: null, rpe: null, isWarmup: false })).toBe('100')
    expect(formatSet({ weight: null, reps: null, rpe: null, isWarmup: false })).toBe('BW')
  })
})

describe('shapeClimbingSends', () => {
  it('orders highest V-grade first, carries attempts, and totals both', () => {
    const { sends, totalSends, totalAttempts } = shapeClimbingSends([
      { grade: 'V4', count: 1, attempts: 5 },
      { grade: 'V6', count: 0, attempts: 3 },
      { grade: 'V2', count: 2, attempts: 2 },
    ])
    expect(sends.map((s) => s.grade)).toEqual(['V6', 'V4', 'V2'])
    expect(sends[0]).toEqual({ grade: 'V6', count: 0, attempts: 3 })
    expect(totalSends).toBe(3)
    expect(totalAttempts).toBe(10)
  })
  it('keeps unparseable grades (sorted to the end) and still counts them', () => {
    const out = shapeClimbingSends([
      { grade: 'V4', count: 1, attempts: 1 }, { grade: '6C', count: 3, attempts: 3 },
    ])
    expect(out.sends.map(s => s.grade)).toEqual(['V4', '6C'])
    expect(out.totalSends).toBe(4)
    expect(out.totalAttempts).toBe(4)
  })
})
