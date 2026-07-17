import { describe, it, expect } from 'vitest'
import { PRESETS } from './index'
import { getPrescription } from '../programEngine'

describe('PRESETS registry', () => {
  it('has 4 entries', () => {
    expect(PRESETS.length).toBe(4)
  })

  it('flags fiveThreeOne as requiring training maxes', () => {
    const five31 = PRESETS.find(p => p.id === 'fiveThreeOne')
    expect(five31).toBeDefined()
    expect(five31?.requiresTrainingMaxes).toBe(true)
    expect(five31?.tmKeys).toEqual(['squat', 'benchPress', 'barbellDeadlift', 'overheadPress'])
  })

  it('flags the three new presets as not requiring training maxes', () => {
    const others = PRESETS.filter(p => p.id !== 'fiveThreeOne')
    expect(others.length).toBe(3)
    for (const preset of others) {
      expect(preset.requiresTrainingMaxes).toBe(false)
      expect(preset.tmKeys).toEqual([])
    }
  })

  it('derives daysPerWeek from program.days.length', () => {
    for (const preset of PRESETS) {
      expect(preset.daysPerWeek).toBe(preset.program.days.length)
    }
  })

  for (const presetId of ['strongLifts5x5', 'pushPullLegs', 'beginnerLinear', 'fiveThreeOne']) {
    describe(presetId, () => {
      const preset = PRESETS.find(p => p.id === presetId)

      it('is registered', () => {
        expect(preset).toBeDefined()
      })

      it('is a well-formed Program', () => {
        const program = preset!.program
        expect(program.days.length).toBeGreaterThan(0)
        for (const day of program.days) {
          expect(day.exercises.length).toBeGreaterThan(0)
          for (const exercise of day.exercises) {
            expect(exercise.scheme).toBeDefined()
            if (exercise.scheme.type === 'fixed') {
              expect(exercise.scheme.sets.length).toBeGreaterThan(0)
            } else {
              expect(exercise.scheme.weeks.length).toBeGreaterThan(0)
            }
          }
        }
      })

      it('produces a prescription without throwing for every day at week 1', () => {
        const program = preset!.program
        for (let dayIndex = 0; dayIndex < program.days.length; dayIndex++) {
          const prescription = getPrescription(program, { dayIndex, week: 1, cycle: 1 }, {})
          expect(prescription.length).toBe(program.days[dayIndex].exercises.length)
          for (const exercise of prescription) {
            expect(exercise.sets.length).toBeGreaterThan(0)
            for (const set of exercise.sets) {
              expect(set.reps).toBeGreaterThan(0)
              // Fixed schemes may leave weight undefined; percentage schemes with empty
              // maxes resolve to a weight of 0. Either is acceptable here.
              if (set.weight !== undefined) expect(set.weight).toBeGreaterThanOrEqual(0)
            }
          }
        }
      })
    })
  }
})
