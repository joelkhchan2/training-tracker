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
      { weight: 135, reps: 5, done: false, isFsl: undefined, isAmrap: undefined, targetReps: undefined, prescriptionIndex: 0, prescribedWeight: 135, prescribedReps: 5 },
      { weight: 155, reps: 5, done: false, isFsl: true, isAmrap: undefined, targetReps: undefined, prescriptionIndex: 1, prescribedWeight: 155, prescribedReps: 5 },
      { weight: 175, reps: 3, done: false, isFsl: undefined, isAmrap: undefined, targetReps: undefined, prescriptionIndex: 2, prescribedWeight: 175, prescribedReps: 3 },
    ])

    const pushup = state.exercises[1]
    expect(pushup.exerciseName).toBe('Push-up')
    expect(pushup.tmKey).toBeUndefined()
    expect(pushup.sets).toEqual([
      { weight: null, reps: 10, done: false, isFsl: undefined, isAmrap: undefined, targetReps: undefined, prescriptionIndex: 0, prescribedWeight: undefined, prescribedReps: 10 },
      { weight: null, reps: 10, done: false, isFsl: undefined, isAmrap: undefined, targetReps: undefined, prescriptionIndex: 1, prescribedWeight: undefined, prescribedReps: 10 },
    ])
  })
})

describe('startFromPrescription seeding prescribedWeight/prescribedReps', () => {
  it('records the original prescribed target for each seeded set', () => {
    const ascendingPrescription: PrescribedExercise[] = [
      {
        exerciseName: 'Squat',
        tmKey: 'squat',
        sets: [
          { weight: 275, reps: 3 },
          { weight: 315, reps: 3 },
          { weight: 355, reps: 3 },
        ],
      },
    ]
    useSessionStore.getState().startFromPrescription(ascendingPrescription, meta)

    const sets = useSessionStore.getState().exercises[0].sets
    expect(sets[0]).toMatchObject({ prescribedWeight: 275, prescribedReps: 3 })
    expect(sets[1]).toMatchObject({ prescribedWeight: 315, prescribedReps: 3 })
    expect(sets[2]).toMatchObject({ prescribedWeight: 355, prescribedReps: 3 })
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

describe('updateSet smart carry-forward', () => {
  const straightSetPrescription: PrescribedExercise[] = [
    {
      exerciseName: 'Bench Press',
      sets: [
        { weight: 100, reps: 8 },
        { weight: 100, reps: 8 },
        { weight: 100, reps: 8 },
      ],
    },
  ]

  const ascendingPrescription: PrescribedExercise[] = [
    {
      exerciseName: 'Squat',
      tmKey: 'squat',
      sets: [
        { weight: 275, reps: 3 },
        { weight: 315, reps: 3 },
        { weight: 355, reps: 3 },
      ],
    },
  ]

  it('propagates a weight edit forward to later not-done sets sharing the same prescribed weight (straight sets)', () => {
    useSessionStore.getState().startFromPrescription(straightSetPrescription, meta)
    useSessionStore.getState().updateSet(0, 0, { weight: 95 })

    const sets = useSessionStore.getState().exercises[0].sets
    expect(sets[0].weight).toBe(95)
    expect(sets[1].weight).toBe(95)
    expect(sets[2].weight).toBe(95)
  })

  it('propagates a reps edit forward to later not-done sets sharing the same prescribed reps (straight sets)', () => {
    useSessionStore.getState().startFromPrescription(straightSetPrescription, meta)
    useSessionStore.getState().updateSet(0, 0, { reps: 7 })

    const sets = useSessionStore.getState().exercises[0].sets
    expect(sets[0].reps).toBe(7)
    expect(sets[1].reps).toBe(7)
    expect(sets[2].reps).toBe(7)
  })

  it('does NOT propagate a weight edit across sets with different prescribed weights (ascending 5/3/1 scheme)', () => {
    useSessionStore.getState().startFromPrescription(ascendingPrescription, meta)
    useSessionStore.getState().updateSet(0, 0, { weight: 270 })

    const sets = useSessionStore.getState().exercises[0].sets
    expect(sets[0].weight).toBe(270)
    expect(sets[1].weight).toBe(315)
    expect(sets[2].weight).toBe(355)
  })

  it('DOES propagate a reps edit across ascending-weight sets that share the same prescribed reps', () => {
    useSessionStore.getState().startFromPrescription(ascendingPrescription, meta)
    useSessionStore.getState().updateSet(0, 0, { reps: 2 })

    const sets = useSessionStore.getState().exercises[0].sets
    expect(sets[0].reps).toBe(2)
    expect(sets[1].reps).toBe(2)
    expect(sets[2].reps).toBe(2)
  })

  it('does not overwrite a later set that is already marked done', () => {
    useSessionStore.getState().startFromPrescription(straightSetPrescription, meta)
    useSessionStore.getState().toggleDone(0, 1)
    useSessionStore.getState().updateSet(0, 0, { weight: 95 })

    const sets = useSessionStore.getState().exercises[0].sets
    expect(sets[0].weight).toBe(95)
    expect(sets[1].weight).toBe(100) // done set untouched
    expect(sets[2].weight).toBe(95)
  })

  it('only propagates forward — editing a later set does not affect earlier sets', () => {
    useSessionStore.getState().startFromPrescription(straightSetPrescription, meta)
    useSessionStore.getState().updateSet(0, 2, { weight: 95 })

    const sets = useSessionStore.getState().exercises[0].sets
    expect(sets[0].weight).toBe(100)
    expect(sets[1].weight).toBe(100)
    expect(sets[2].weight).toBe(95)
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

const exMgmtMeta = { sessionType: 'Gym A', dayName: 'Gym A', dayIndex: 0, clientId: 'c1', startedAt: '2026-07-22T00:00:00Z' }

describe('sessionStore — exercise management', () => {
  beforeEach(() => useSessionStore.getState().reset())

  it('startFromPrescription assigns a unique id and default kind to each exercise', () => {
    useSessionStore.getState().startFromPrescription(
      [
        { exerciseName: 'Squat', tmKey: 'squat', sets: [{ weight: 100, reps: 5 }] },
        { exerciseName: 'Bench Press', tmKey: 'benchPress', sets: [{ weight: 80, reps: 5 }] },
      ] as never,
      exMgmtMeta,
    )
    const ex = useSessionStore.getState().exercises
    expect(ex[0].id).toBeTruthy()
    expect(ex[1].id).toBeTruthy()
    expect(ex[0].id).not.toBe(ex[1].id)
    expect(ex[0].kind).toBe('strength')
    expect(ex[0].adhoc).toBeFalsy()
  })

  it('addExercise appends an adhoc exercise with 3 empty sets, its kind, an id, and no tmKey', () => {
    useSessionStore.getState().startFromPrescription([{ exerciseName: 'Squat', tmKey: 'squat', sets: [{ weight: 100, reps: 5 }] }] as never, exMgmtMeta)
    useSessionStore.getState().addExercise({ exerciseName: 'Face Pulls', kind: 'strength' })
    const ex = useSessionStore.getState().exercises
    expect(ex).toHaveLength(2)
    const added = ex[1]
    expect(added).toMatchObject({ exerciseName: 'Face Pulls', kind: 'strength', adhoc: true, exerciseId: null, tmKey: undefined })
    expect(added.id).toBeTruthy()
    expect(added.sets).toHaveLength(3)
    expect(added.sets.every((s) => s.weight === null && s.reps === null && s.done === false)).toBe(true)
  })

  it('removeExercise drops the exercise at the index', () => {
    useSessionStore.getState().startFromPrescription([{ exerciseName: 'Squat', tmKey: 'squat', sets: [{ weight: 100, reps: 5 }] }] as never, exMgmtMeta)
    useSessionStore.getState().addExercise({ exerciseName: 'Curl', kind: 'strength' })
    useSessionStore.getState().removeExercise(0)
    const ex = useSessionStore.getState().exercises
    expect(ex).toHaveLength(1)
    expect(ex[0].exerciseName).toBe('Curl')
  })

  it('replaceExercise keeps the id and set count, clears values + prescription metadata, sets adhoc + new name/kind', () => {
    useSessionStore.getState().startFromPrescription(
      [{ exerciseName: 'Squat', tmKey: 'squat', sets: [{ weight: 100, reps: 5, isAmrap: true, targetReps: 5 }, { weight: 100, reps: 5 }] }] as never,
      exMgmtMeta,
    )
    const originalId = useSessionStore.getState().exercises[0].id
    useSessionStore.getState().replaceExercise(0, { exerciseName: 'Leg Press', kind: 'strength' })
    const ex = useSessionStore.getState().exercises[0]
    expect(ex.id).toBe(originalId)
    expect(ex.exerciseName).toBe('Leg Press')
    expect(ex.kind).toBe('strength')
    expect(ex.adhoc).toBe(true)
    expect(ex.exerciseId).toBeNull()
    expect(ex.tmKey).toBeUndefined()
    expect(ex.sets).toHaveLength(2)
    expect(ex.sets.every((s) => s.weight === null && s.reps === null && !s.done && s.prescriptionIndex === undefined && s.isAmrap === undefined && s.targetReps === undefined)).toBe(true)
  })

  it('reorderExercises moves an item (down, up, no-op, out-of-range)', () => {
    useSessionStore.getState().startFromPrescription([{ exerciseName: 'A', sets: [] }] as never, exMgmtMeta)
    useSessionStore.getState().addExercise({ exerciseName: 'B', kind: 'strength' })
    useSessionStore.getState().addExercise({ exerciseName: 'C', kind: 'strength' })
    const names = () => useSessionStore.getState().exercises.map((e) => e.exerciseName)

    useSessionStore.getState().reorderExercises(0, 2)
    expect(names()).toEqual(['B', 'C', 'A'])
    useSessionStore.getState().reorderExercises(2, 0)
    expect(names()).toEqual(['A', 'B', 'C'])
    useSessionStore.getState().reorderExercises(1, 1)
    expect(names()).toEqual(['A', 'B', 'C'])
    useSessionStore.getState().reorderExercises(0, 9)
    expect(names()).toEqual(['A', 'B', 'C']) // out-of-range is a no-op
  })
})
