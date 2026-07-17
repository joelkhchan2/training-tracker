import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTodaysPrescription } from './useTodaysPrescription'
import type { ActiveWorkoutBundle } from '../../data/queries'
import type { LinearProgressionConfig } from '../../domain/types'

const { useActiveWorkout } = vi.hoisted(() => ({ useActiveWorkout: vi.fn() }))

vi.mock('../../data/queries', () => ({ useActiveWorkout }))
vi.mock('../../lib/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

const LINEAR_CONFIG: LinearProgressionConfig = { increment: 5, failsBeforeDeload: 3, deloadPercent: 0.1 }

const linearBundle: ActiveWorkoutBundle = {
  program: {
    name: 'Linear Program',
    discipline: 'strength',
    days: [
      {
        name: 'Squat Day',
        exercises: [
          {
            exerciseName: 'Squat',
            tmKey: 'squat',
            order: 0,
            scheme: {
              type: 'linear',
              sets: [{ reps: 5 }, { reps: 5 }, { reps: 5, amrap: true, targetReps: 5 }],
              progression: LINEAR_CONFIG,
            },
          },
        ],
      },
    ],
  },
  days: [],
  programExercises: [],
  exercisesById: {},
  trainingMaxes: {},
  cursor: { dayIndex: 0, week: 1, cycle: 1 },
  personalRecords: [],
  workingWeights: { squat: { weight: 100, fails: 0 } },
  workingWeightValues: { squat: 100 },
}

beforeEach(() => {
  useActiveWorkout.mockReset()
})

describe('useTodaysPrescription', () => {
  it('passes the bundle workingWeightValues into getPrescription so a linear-scheme lift gets its working weight and AMRAP flag/target', () => {
    useActiveWorkout.mockReturnValue({ data: linearBundle, isLoading: false })

    const { result } = renderHook(() => useTodaysPrescription())

    expect(result.current.hasProgram).toBe(true)
    const squat = result.current.prescription[0]
    expect(squat.exerciseName).toBe('Squat')
    expect(squat.sets[0]).toEqual({ weight: 100, reps: 5 })
    expect(squat.sets[1]).toEqual({ weight: 100, reps: 5 })
    expect(squat.sets[2]).toEqual({ weight: 100, reps: 5, isAmrap: true, targetReps: 5 })
  })

  it('leaves a percentage-scheme lift unaffected by workingWeightValues', () => {
    const percentageBundle: ActiveWorkoutBundle = {
      ...linearBundle,
      program: {
        name: 'Percentage Program',
        discipline: 'strength',
        days: [
          {
            name: 'Bench Day',
            exercises: [
              {
                exerciseName: 'Bench Press',
                tmKey: 'benchPress',
                order: 0,
                scheme: { type: 'percentage', tmKey: 'benchPress', weeks: [{ sets: [{ pct: 0.7, reps: 5 }] }] },
              },
            ],
          },
        ],
      },
      trainingMaxes: { benchPress: 200 },
    }
    useActiveWorkout.mockReturnValue({ data: percentageBundle, isLoading: false })

    const { result } = renderHook(() => useTodaysPrescription())

    expect(result.current.prescription[0].sets[0]).toEqual({ weight: 140, reps: 5, isFsl: false })
  })
})
