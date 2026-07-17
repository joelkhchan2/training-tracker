import { describe, it, expect } from 'vitest'
import { PRESETS } from './index'
import { getPrescription } from '../programEngine'
import { applyLinearProgression } from '../linearProgression'

const LP_PRESET_IDS = ['strongLifts5x5', 'startingStrength', 'basicBeginner', 'greyskullLP']

describe('PRESETS registry', () => {
  it('has 7 entries', () => {
    expect(PRESETS.length).toBe(7)
  })

  it('flags fiveThreeOne as requiring training maxes', () => {
    const five31 = PRESETS.find(p => p.id === 'fiveThreeOne')
    expect(five31).toBeDefined()
    expect(five31?.requiresTrainingMaxes).toBe(true)
    expect(five31?.tmKeys).toEqual(['squat', 'benchPress', 'barbellDeadlift', 'overheadPress'])
  })

  it('flags every non-5/3/1 preset as not requiring training maxes', () => {
    const others = PRESETS.filter(p => p.id !== 'fiveThreeOne')
    expect(others.length).toBe(6)
    for (const preset of others) {
      expect(preset.requiresTrainingMaxes).toBe(false)
      expect(preset.tmKeys).toEqual([])
    }
  })

  it('flags the four linear-progression presets as requiring starting weights, with a non-empty lift list', () => {
    for (const presetId of LP_PRESET_IDS) {
      const preset = PRESETS.find(p => p.id === presetId)
      expect(preset).toBeDefined()
      expect(preset?.requiresStartingWeights).toBe(true)
      expect(preset?.startingWeightLifts.length).toBeGreaterThan(0)
      for (const lift of preset!.startingWeightLifts) {
        expect(lift.exerciseName).toBeTruthy()
        expect(lift.label).toBeTruthy()
      }
    }
  })

  it('flags every other preset as not requiring starting weights', () => {
    const nonLp = PRESETS.filter(p => !LP_PRESET_IDS.includes(p.id))
    expect(nonLp.length).toBe(3)
    for (const preset of nonLp) {
      expect(preset.requiresStartingWeights).toBe(false)
      expect(preset.startingWeightLifts).toEqual([])
    }
  })

  it('derives daysPerWeek from program.days.length', () => {
    for (const preset of PRESETS) {
      expect(preset.daysPerWeek).toBe(preset.program.days.length)
    }
  })

  for (const presetId of ['strongLifts5x5', 'pushPullLegs', 'beginnerLinear', 'fiveThreeOne', 'startingStrength', 'basicBeginner', 'greyskullLP']) {
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
            if (exercise.scheme.type === 'percentage') {
              expect(exercise.scheme.weeks.length).toBeGreaterThan(0)
            } else {
              expect(exercise.scheme.sets.length).toBeGreaterThan(0)
              if (exercise.scheme.type === 'linear') {
                expect(exercise.scheme.progression).toBeDefined()
                expect(exercise.scheme.progression.increment).toBeGreaterThan(0)
              }
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

  describe('linear-progression presets — getPrescription resolves the supplied working weight', () => {
    for (const presetId of LP_PRESET_IDS) {
      it(`${presetId}: every linear-scheme exercise is prescribed at the supplied working weight, with AMRAP flagged where the scheme defines it`, () => {
        const preset = PRESETS.find(p => p.id === presetId)!
        const program = preset.program

        // Every linear-scheme exercise across every day, keyed by exerciseName (no tmKey
        // used for these presets — confirmed by activateProgram's exercise_progress seeding).
        const workingWeights: Record<string, number> = {}
        for (const day of program.days) {
          for (const ex of day.exercises) {
            if (ex.scheme.type === 'linear') workingWeights[ex.exerciseName] = 100
          }
        }

        for (let dayIndex = 0; dayIndex < program.days.length; dayIndex++) {
          const prescription = getPrescription(program, { dayIndex, week: 1, cycle: 1 }, {}, workingWeights)
          const day = program.days[dayIndex]

          prescription.forEach((prescribedEx, exIdx) => {
            const dayEx = day.exercises[exIdx]
            if (dayEx.scheme.type !== 'linear') return

            for (const set of prescribedEx.sets) expect(set.weight).toBe(100)

            dayEx.scheme.sets.forEach((definedSet, setIdx) => {
              const prescribedSet = prescribedEx.sets[setIdx]
              if (definedSet.amrap) {
                expect(prescribedSet.isAmrap).toBe(true)
                expect(prescribedSet.targetReps).toBe(definedSet.targetReps ?? definedSet.reps)
              } else {
                expect(prescribedSet.isAmrap).toBeFalsy()
              }
            })
          })
        }
      })
    }
  })

  describe('linear-progression presets — applyLinearProgression runs with each config', () => {
    for (const presetId of LP_PRESET_IDS) {
      it(`${presetId}: every linear-scheme exercise's progression config produces increase/hold/deload outcomes`, () => {
        const preset = PRESETS.find(p => p.id === presetId)!

        for (const day of preset.program.days) {
          for (const ex of day.exercises) {
            if (ex.scheme.type !== 'linear') continue
            const cfg = ex.scheme.progression
            const lastSet = ex.scheme.sets[ex.scheme.sets.length - 1]
            const targetReps = lastSet.amrap ? (lastSet.targetReps ?? lastSet.reps) : 0
            const amrapMet = lastSet.amrap ? targetReps : 0

            // Met session: increases and resets fails.
            const met = applyLinearProgression(cfg, {
              currentWeight: 100, fails: 0, allWorkingSetsMet: true, amrapReps: amrapMet, targetReps,
            })
            expect(met.action === 'increase' || met.action === 'increase-double').toBe(true)
            expect(met.nextWeight).toBeGreaterThan(100)
            expect(met.nextFails).toBe(0)

            // Missed session: holds until failsBeforeDeload, then deloads.
            let fails = 0
            let outcome = applyLinearProgression(cfg, {
              currentWeight: 100, fails, allWorkingSetsMet: false, amrapReps: 0, targetReps,
            })
            for (let i = 1; i < cfg.failsBeforeDeload; i++) {
              expect(outcome.action).toBe('hold')
              fails = outcome.nextFails
              outcome = applyLinearProgression(cfg, {
                currentWeight: 100, fails, allWorkingSetsMet: false, amrapReps: 0, targetReps,
              })
            }
            expect(outcome.action).toBe('deload')
            expect(outcome.nextWeight).toBeLessThan(100)
            expect(outcome.nextFails).toBe(0)
          }
        }
      })
    }
  })
})
