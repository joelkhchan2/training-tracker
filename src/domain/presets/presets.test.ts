import { describe, it, expect } from 'vitest'
import { PRESETS } from './index'
import { getPrescription } from '../programEngine'
import { applyLinearProgression } from '../linearProgression'

const LP_PRESET_IDS = ['strongLifts5x5', 'startingStrength', 'basicBeginner', 'greyskullLP']

describe('PRESETS registry', () => {
  it('has 8 entries', () => {
    expect(PRESETS.length).toBe(8)
  })

  it('flags fiveThreeOne as requiring training maxes', () => {
    const five31 = PRESETS.find(p => p.id === 'fiveThreeOne')
    expect(five31).toBeDefined()
    expect(five31?.requiresTrainingMaxes).toBe(true)
    expect(five31?.tmKeys).toEqual(['squat', 'benchPress', 'barbellDeadlift', 'overheadPress'])
  })

  it('flags every non-5/3/1 preset as not requiring training maxes', () => {
    const others = PRESETS.filter(p => p.id !== 'fiveThreeOne')
    expect(others.length).toBe(7)
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
    expect(nonLp.length).toBe(4)
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

  for (const presetId of ['strongLifts5x5', 'pushPullLegs', 'beginnerLinear', 'fiveThreeOne', 'startingStrength', 'basicBeginner', 'greyskullLP', 'gabrielleWorkout']) {
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

  describe('gabrielleWorkout — single-day 3×12 with baked-in weights', () => {
    const preset = PRESETS.find(p => p.id === 'gabrielleWorkout')!

    it('is a single "Full Body" day of nine exercises in order', () => {
      expect(preset.program.days.length).toBe(1)
      const day = preset.program.days[0]
      expect(day.name).toBe('Full Body')
      expect(day.exercises.map(e => e.exerciseName)).toEqual([
        'Treadmill', '45° Leg Press', 'Pull-down', 'Leg Extensions', 'Leg Curl',
        'Shoulder Press', 'Cable Row', 'Decline Sit-ups', 'Treadmill',
      ])
      expect(day.exercises.map(e => e.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    })

    it('has no progression rule (weights are managed manually)', () => {
      expect(preset.program.progressionRule).toBeUndefined()
      expect(preset.requiresTrainingMaxes).toBe(false)
      expect(preset.requiresStartingWeights).toBe(false)
    })

    it('prescribes 3×12 at the sheet weights for lifts, and a single check-off set for treadmill', () => {
      const [prescription] = [getPrescription(preset.program, { dayIndex: 0, week: 1, cycle: 1 }, {})]
      const byName = (name: string) => prescription.filter(e => e.exerciseName === name)

      const weights: Record<string, number> = {
        '45° Leg Press': 90, 'Pull-down': 70, 'Leg Extensions': 110,
        'Leg Curl': 70, 'Shoulder Press': 40, 'Cable Row': 66,
      }
      for (const [name, weight] of Object.entries(weights)) {
        const ex = byName(name)[0]
        expect(ex.sets.length).toBe(3)
        for (const set of ex.sets) {
          expect(set.reps).toBe(12)
          expect(set.weight).toBe(weight)
        }
      }

      // Decline Sit-ups: 3×12 bodyweight — no target weight.
      const situps = byName('Decline Sit-ups')[0]
      expect(situps.sets.length).toBe(3)
      for (const set of situps.sets) {
        expect(set.reps).toBe(12)
        expect(set.weight).toBeUndefined()
      }

      // Two treadmill entries (warm-up + cool-down), each one check-off set, no weight.
      const treadmills = byName('Treadmill')
      expect(treadmills.length).toBe(2)
      for (const t of treadmills) {
        expect(t.sets.length).toBe(1)
        expect(t.sets[0].weight).toBeUndefined()
      }
    })
  })

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
