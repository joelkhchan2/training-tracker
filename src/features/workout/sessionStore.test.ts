import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore } from './sessionStore'
import type { PrescribedExercise } from '../../domain/types'

const prescription: PrescribedExercise[] = [
  {
    exerciseName: 'Squat',
    tmKey: 'squat',
    sets: [
      { weight: 135, reps: 5 },
      { weight: 155, reps: 5, isFsl: true },
      { weight: 175, reps: 3 },
    ],
  },
  {
    exerciseName: 'Push-up',
    sets: [
      { reps: 10 },
      { reps: 10 },
    ],
  },
]

const meta = {
  sessionType: '5/3/1',
  dayName: 'A',
  dayIndex: 0,
  clientId: 'client-123',
  startedAt: '2026-07-12T00:00:00.000Z',
}

beforeEach(() => {
  useSessionStore.getState().reset()
})

describe('startFromPrescription', () => {
  it('maps a prescription into editable sets with prefilled values, done=false, and status active', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    const state = useSessionStore.getState()

    expect(state.status).toBe('active')
    expect(state.clientId).toBe('client-123')
    expect(state.sessionType).toBe('5/3/1')
    expect(state.dayName).toBe('A')
    expect(state.dayIndex).toBe(0)
    expect(state.startedAt).toBe('2026-07-12T00:00:00.000Z')
    expect(state.exercises).toHaveLength(2)

    const squat = state.exercises[0]
    expect(squat.exerciseId).toBeNull()
    expect(squat.exerciseName).toBe('Squat')
    expect(squat.tmKey).toBe('squat')
    expect(squat.sets).toEqual([
      { weight: 135, reps: 5, done: false, isFsl: undefined },
      { weight: 155, reps: 5, done: false, isFsl: true },
      { weight: 175, reps: 3, done: false, isFsl: undefined },
    ])

    const pushup = state.exercises[1]
    expect(pushup.exerciseName).toBe('Push-up')
    expect(pushup.tmKey).toBeUndefined()
    expect(pushup.sets).toEqual([
      { weight: null, reps: 10, done: false, isFsl: undefined },
      { weight: null, reps: 10, done: false, isFsl: undefined },
    ])
  })
})

describe('startFromPrescription with an AMRAP set', () => {
  it('carries isAmrap/targetReps through onto the matching session set only', () => {
    const amrapPrescription: PrescribedExercise[] = [
      {
        exerciseName: 'Squat',
        tmKey: 'squat',
        sets: [
          { weight: 100, reps: 5 },
          { weight: 100, reps: 5, isAmrap: true, targetReps: 8 },
        ],
      },
    ]
    useSessionStore.getState().startFromPrescription(amrapPrescription, meta)

    const state = useSessionStore.getState()
    expect(state.exercises[0].sets[0]).toMatchObject({ isAmrap: undefined, targetReps: undefined })
    expect(state.exercises[0].sets[1]).toMatchObject({ weight: 100, reps: 5, isAmrap: true, targetReps: 8 })
  })
})

describe('updateSet', () => {
  it('patches weight/reps on the target set only', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    useSessionStore.getState().updateSet(0, 1, { weight: 160, reps: 6 })

    const state = useSessionStore.getState()
    expect(state.exercises[0].sets[1]).toMatchObject({ weight: 160, reps: 6 })
    // sibling sets unaffected
    expect(state.exercises[0].sets[0]).toMatchObject({ weight: 135, reps: 5 })
    expect(state.exercises[1].sets[0]).toMatchObject({ weight: null, reps: 10 })
  })
})

describe('toggleDone', () => {
  it('flips done on the target set only', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    useSessionStore.getState().toggleDone(0, 0)

    let state = useSessionStore.getState()
    expect(state.exercises[0].sets[0].done).toBe(true)
    expect(state.exercises[0].sets[1].done).toBe(false)

    useSessionStore.getState().toggleDone(0, 0)
    state = useSessionStore.getState()
    expect(state.exercises[0].sets[0].done).toBe(false)
  })
})

describe('addSet', () => {
  it('appends a set copying the last set weight/reps, done=false', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    useSessionStore.getState().addSet(0)

    const state = useSessionStore.getState()
    expect(state.exercises[0].sets).toHaveLength(4)
    expect(state.exercises[0].sets[3]).toEqual({ weight: 175, reps: 3, done: false })
    // other exercise untouched
    expect(state.exercises[1].sets).toHaveLength(2)
  })
})

describe('removeSet', () => {
  it('removes only the targeted set', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    useSessionStore.getState().removeSet(0, 1)

    const state = useSessionStore.getState()
    expect(state.exercises[0].sets).toHaveLength(2)
    expect(state.exercises[0].sets.map((s) => s.reps)).toEqual([5, 3])
  })
})

describe('reset', () => {
  it('returns the store to idle/empty', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    useSessionStore.getState().reset()

    const state = useSessionStore.getState()
    expect(state.status).toBe('idle')
    expect(state.clientId).toBeNull()
    expect(state.sessionType).toBeNull()
    expect(state.dayName).toBeNull()
    expect(state.dayIndex).toBeNull()
    expect(state.startedAt).toBeNull()
    expect(state.exercises).toEqual([])
  })
})

describe('persistence config', () => {
  it('is configured with the tt-active-session storage key', () => {
    const options = useSessionStore.persist.getOptions()
    expect(options.name).toBe('tt-active-session')
  })
})
