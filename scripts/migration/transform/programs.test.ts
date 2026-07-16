import { describe, it, expect } from 'vitest'
import { toProgramSeed } from './programs'

describe('toProgramSeed', () => {
  const { program, days, exercises } = toProgramSeed()

  it('produces exactly one program row named 5/3/1', () => {
    expect(program.name).toBe('5/3/1')
    expect(program.discipline).toBe('strength')
    expect(program.is_public).toBe(true)
    expect(program.user_id).toBeNull()
  })

  it('produces a progression_rule of type cycle_tm_bump', () => {
    expect(program.progression_rule).toBeTruthy()
    expect((program.progression_rule as { type: string }).type).toBe('cycle_tm_bump')
  })

  it('produces one day row per preset day, named and ordered correctly', () => {
    expect(days).toHaveLength(2)
    expect(days.map(d => d.name)).toEqual(['Gym A', 'Gym B'])
    expect(days.map(d => d.order_index)).toEqual([0, 1])
  })

  it('produces a Squat exercise on day 0 with a 4-week percentage scheme keyed to squat', () => {
    const day0Exercises = exercises.filter(e => e.dayIndex === 0)
    const squat = day0Exercises.find(e => e.exerciseName === 'Squat')
    expect(squat).toBeDefined()
    expect(squat?.role_key).toBe('squat')
    expect(squat?.order_index).toBe(0)
    expect(squat?.exercise_id).toBeNull()

    const scheme = squat?.scheme as { type: string; tmKey?: string; weeks?: unknown[] }
    expect(scheme.type).toBe('percentage')
    expect(scheme.tmKey).toBe('squat')
    expect(scheme.weeks).toHaveLength(4)
  })

  it('carries dayIndex + order_index linkage for every exercise row so the load step can wire FKs', () => {
    for (const ex of exercises) {
      expect(typeof ex.dayIndex).toBe('number')
      expect(typeof ex.order_index).toBe('number')
      expect(ex.exercise_id).toBeNull()
      expect(typeof ex.exerciseName).toBe('string')
    }
  })

  it('assigns role_key null for accessory exercises without a tmKey', () => {
    const pullups = exercises.find(e => e.exerciseName === 'Pull-ups')
    expect(pullups?.role_key).toBeNull()
  })
})
