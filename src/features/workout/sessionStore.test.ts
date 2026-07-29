import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore, migrateSession, SESSION_STORE_VERSION } from './sessionStore'
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
      { weight: 135, reps: 5, done: false, isFsl: undefined, isAmrap: undefined, targetReps: undefined, prescriptionIndex: 0, prescribedWeight: 135, prescribedReps: 5, durationSeconds: null },
      { weight: 155, reps: 5, done: false, isFsl: true, isAmrap: undefined, targetReps: undefined, prescriptionIndex: 1, prescribedWeight: 155, prescribedReps: 5, durationSeconds: null },
      { weight: 175, reps: 3, done: false, isFsl: undefined, isAmrap: undefined, targetReps: undefined, prescriptionIndex: 2, prescribedWeight: 175, prescribedReps: 3, durationSeconds: null },
    ])
    expect(squat.inputType).toBe('weighted')

    const pushup = state.exercises[1]
    expect(pushup.exerciseName).toBe('Push-up')
    expect(pushup.tmKey).toBeUndefined()
    expect(pushup.sets).toEqual([
      { weight: null, reps: 10, done: false, isFsl: undefined, isAmrap: undefined, targetReps: undefined, prescriptionIndex: 0, prescribedWeight: undefined, prescribedReps: 10, durationSeconds: null },
      { weight: null, reps: 10, done: false, isFsl: undefined, isAmrap: undefined, targetReps: undefined, prescriptionIndex: 1, prescribedWeight: undefined, prescribedReps: 10, durationSeconds: null },
    ])
    expect(pushup.inputType).toBe('weighted') // prescription-sourced always defaults to weighted, even a bodyweight-named lift
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
  it('appends a set copying the last set weight/reps (not durationSeconds), done=false', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    useSessionStore.getState().addSet(0)

    const state = useSessionStore.getState()
    expect(state.exercises[0].sets).toHaveLength(4)
    expect(state.exercises[0].sets[3]).toEqual({ weight: 175, reps: 3, done: false, durationSeconds: null })
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

  it('is configured with SESSION_STORE_VERSION and a migrate hook', () => {
    const options = useSessionStore.persist.getOptions()
    expect(options.version).toBe(SESSION_STORE_VERSION)
    expect(typeof options.migrate).toBe('function')
  })
})

describe('migrateSession', () => {
  it('leaves a state already at the current version untouched', () => {
    const current = {
      status: 'active',
      exercises: [
        { id: '1', exerciseId: null, exerciseName: 'Squat', kind: 'strength', inputType: 'weighted', sets: [] },
      ],
    }
    expect(migrateSession(current, SESSION_STORE_VERSION)).toBe(current)
  })

  it('backfills missing inputType (bodyweight/weighted by kind) and missing durationSeconds on a pre-v1 persisted state', () => {
    const legacy = {
      status: 'active',
      clientId: 'client-123',
      sessionType: '5/3/1',
      dayName: 'A',
      dayIndex: 0,
      startedAt: '2026-07-12T00:00:00.000Z',
      notes: '',
      bodyWeight: null,
      exercises: [
        {
          id: '1',
          exerciseId: null,
          exerciseName: 'Squat',
          kind: 'strength',
          // no inputType — pre-v1 shape
          sets: [
            { weight: 135, reps: 5, done: false }, // no durationSeconds — pre-v1 shape
          ],
        },
        {
          id: '2',
          exerciseId: null,
          exerciseName: 'Pull-up',
          kind: 'bodyweight',
          sets: [{ weight: null, reps: 10, done: false }],
        },
      ],
    }

    const migrated = migrateSession(legacy, 0)

    expect(migrated.exercises[0].inputType).toBe('weighted')
    expect(migrated.exercises[0].sets[0].durationSeconds).toBeNull()
    expect(migrated.exercises[1].inputType).toBe('bodyweight')
    expect(migrated.exercises[1].sets[0].durationSeconds).toBeNull()
    // untouched fields survive
    expect(migrated.clientId).toBe('client-123')
    expect(migrated.exercises[0].sets[0]).toMatchObject({ weight: 135, reps: 5, done: false })
  })

  it('passes through a null/undefined persisted state (first-ever load, nothing in storage)', () => {
    expect(migrateSession(undefined, 0)).toBeUndefined()
    expect(migrateSession(null, 0)).toBeNull()
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

describe('insertExerciseAt', () => {
  beforeEach(() => useSessionStore.getState().reset())

  function seedThree() {
    useSessionStore.getState().startFromPrescription(
      [{ exerciseName: 'Squat', tmKey: 'squat', sets: [{ weight: 100, reps: 5 }] }] as never,
      exMgmtMeta,
    )
    useSessionStore.getState().addExercise({ exerciseName: 'Bench', kind: 'strength' })
    useSessionStore.getState().addExercise({ exerciseName: 'Row', kind: 'strength' })
    // -> ['Squat', 'Bench', 'Row']
  }

  it('inserts at the front (index 0)', () => {
    seedThree()
    useSessionStore.getState().insertExerciseAt(0, { exerciseName: 'Warmup', kind: 'strength' })
    const names = useSessionStore.getState().exercises.map((e) => e.exerciseName)
    expect(names).toEqual(['Warmup', 'Squat', 'Bench', 'Row'])
  })

  it('inserts in the middle', () => {
    seedThree()
    useSessionStore.getState().insertExerciseAt(1, { exerciseName: 'Curl', kind: 'strength' })
    const names = useSessionStore.getState().exercises.map((e) => e.exerciseName)
    expect(names).toEqual(['Squat', 'Curl', 'Bench', 'Row'])
  })

  it('inserts at the end when index equals length, matching addExercise', () => {
    seedThree()
    useSessionStore.getState().insertExerciseAt(3, { exerciseName: 'Face Pulls', kind: 'strength' })
    const names = useSessionStore.getState().exercises.map((e) => e.exerciseName)
    expect(names).toEqual(['Squat', 'Bench', 'Row', 'Face Pulls'])
  })

  it('clamps a negative index to 0', () => {
    seedThree()
    useSessionStore.getState().insertExerciseAt(-5, { exerciseName: 'Warmup', kind: 'strength' })
    const names = useSessionStore.getState().exercises.map((e) => e.exerciseName)
    expect(names).toEqual(['Warmup', 'Squat', 'Bench', 'Row'])
  })

  it('clamps an out-of-range index to the current length', () => {
    seedThree()
    useSessionStore.getState().insertExerciseAt(99, { exerciseName: 'Face Pulls', kind: 'strength' })
    const names = useSessionStore.getState().exercises.map((e) => e.exerciseName)
    expect(names).toEqual(['Squat', 'Bench', 'Row', 'Face Pulls'])
  })

  it('produces the same shape as addExercise: id, adhoc, kind, exerciseId, 3 empty sets, no tmKey', () => {
    seedThree()
    useSessionStore.getState().insertExerciseAt(1, { exerciseName: 'Curl', kind: 'strength', exerciseId: 'ex-curl' })
    const inserted = useSessionStore.getState().exercises[1]
    expect(inserted).toMatchObject({ exerciseName: 'Curl', kind: 'strength', adhoc: true, exerciseId: 'ex-curl', tmKey: undefined })
    expect(inserted.id).toBeTruthy()
    expect(inserted.sets).toHaveLength(3)
    expect(inserted.sets.every((s) => s.weight === null && s.reps === null && s.done === false)).toBe(true)
  })

  it('preserves the other exercises and their ids', () => {
    seedThree()
    const before = useSessionStore.getState().exercises.map((e) => ({ id: e.id, name: e.exerciseName }))
    useSessionStore.getState().insertExerciseAt(1, { exerciseName: 'Curl', kind: 'strength' })
    const after = useSessionStore.getState().exercises
    expect(after.find((e) => e.id === before[0].id)?.exerciseName).toBe('Squat')
    expect(after.find((e) => e.id === before[1].id)?.exerciseName).toBe('Bench')
    expect(after.find((e) => e.id === before[2].id)?.exerciseName).toBe('Row')
  })
})

const capMeta = { sessionType: 'Gym A', dayName: 'Gym A', dayIndex: 0, clientId: 'c1', startedAt: '2026-07-23T00:00:00Z' }

describe('sessionStore — capture fields', () => {
  beforeEach(() => useSessionStore.getState().reset())

  it('updateSet patches rpe and isWarmup without carry-forward', () => {
    useSessionStore.getState().startFromPrescription(
      [{ exerciseName: 'Squat', tmKey: 'squat', sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }] }] as never,
      capMeta,
    )
    useSessionStore.getState().updateSet(0, 0, { rpe: 8 })
    useSessionStore.getState().updateSet(0, 0, { isWarmup: true })
    const ex = useSessionStore.getState().exercises[0]
    expect(ex.sets[0].rpe).toBe(8)
    expect(ex.sets[0].isWarmup).toBe(true)
    expect(ex.sets[1].rpe).toBeUndefined()   // rpe/isWarmup do NOT carry forward (not weight/reps)
    expect(ex.sets[1].isWarmup).toBeUndefined()
  })

  it('setNotes / setBodyWeight update session-level state', () => {
    useSessionStore.getState().startFromPrescription([{ exerciseName: 'Squat', sets: [] }] as never, capMeta)
    useSessionStore.getState().setNotes('felt strong')
    useSessionStore.getState().setBodyWeight(181.5)
    expect(useSessionStore.getState().notes).toBe('felt strong')
    expect(useSessionStore.getState().bodyWeight).toBe(181.5)
  })

  it('startFromPrescription resets notes/bodyWeight; reset clears them', () => {
    useSessionStore.getState().setNotes('old'); useSessionStore.getState().setBodyWeight(200)
    useSessionStore.getState().startFromPrescription([{ exerciseName: 'Squat', sets: [] }] as never, capMeta)
    expect(useSessionStore.getState().notes).toBe('')
    expect(useSessionStore.getState().bodyWeight).toBeNull()
    useSessionStore.getState().setBodyWeight(210)
    useSessionStore.getState().reset()
    expect(useSessionStore.getState().bodyWeight).toBeNull()
  })
})

const idMeta = { sessionType: 'A', dayName: 'A', dayIndex: 0, clientId: 'c1', startedAt: '2026-07-23T00:00:00Z' }

describe('sessionStore — picker exerciseId', () => {
  beforeEach(() => useSessionStore.getState().reset())

  it('addExercise stores the pick exerciseId when present; null when absent', () => {
    useSessionStore.getState().startFromPrescription([] as never, idMeta)
    useSessionStore.getState().addExercise({ exerciseName: 'Curl', kind: 'strength', exerciseId: 'ex-curl' })
    useSessionStore.getState().addExercise({ exerciseName: 'Made Up', kind: 'strength' })
    const ex = useSessionStore.getState().exercises
    expect(ex[0].exerciseId).toBe('ex-curl')
    expect(ex[1].exerciseId).toBeNull()
  })

  it('replaceExercise stores the pick exerciseId', () => {
    useSessionStore.getState().startFromPrescription([{ exerciseName: 'Squat', sets: [{ weight: 100, reps: 5 }] }] as never, idMeta)
    useSessionStore.getState().replaceExercise(0, { exerciseName: 'Leg Press', kind: 'strength', exerciseId: 'ex-legpress' })
    expect(useSessionStore.getState().exercises[0].exerciseId).toBe('ex-legpress')
  })
})

import { defaultInputType } from './sessionStore'

describe('defaultInputType', () => {
  it('defaults a catalog "timed" exercise_type to timed regardless of kind', () => {
    expect(defaultInputType('timed', 'strength')).toBe('timed')
    expect(defaultInputType('timed', 'bodyweight')).toBe('timed')
  })
  it('defaults a catalog "bodyweight" exercise_type, or a bodyweight kind, to bodyweight', () => {
    expect(defaultInputType('bodyweight', 'strength')).toBe('bodyweight')
    expect(defaultInputType(null, 'bodyweight')).toBe('bodyweight')
  })
  it('defaults everything else (weighted, unknown, undefined/custom-add) to weighted', () => {
    expect(defaultInputType('weighted', 'strength')).toBe('weighted')
    expect(defaultInputType(null, 'strength')).toBe('weighted')
    expect(defaultInputType(undefined, 'strength')).toBe('weighted')
  })
})

describe('sessionStore — inputType threading through exercise management', () => {
  beforeEach(() => useSessionStore.getState().reset())

  it('addExercise derives inputType from the pick\'s exerciseType + kind', () => {
    useSessionStore.getState().startFromPrescription([] as never, exMgmtMeta)
    useSessionStore.getState().addExercise({ exerciseName: 'Plank', kind: 'strength', exerciseType: 'timed' })
    useSessionStore.getState().addExercise({ exerciseName: 'Pull-up', kind: 'bodyweight', exerciseType: 'bodyweight' })
    useSessionStore.getState().addExercise({ exerciseName: 'Made Up', kind: 'strength' }) // no exerciseType at all
    const ex = useSessionStore.getState().exercises
    expect(ex[0].inputType).toBe('timed')
    expect(ex[1].inputType).toBe('bodyweight')
    expect(ex[2].inputType).toBe('weighted')
  })

  it('insertExerciseAt derives inputType the same way', () => {
    useSessionStore.getState().startFromPrescription([] as never, exMgmtMeta)
    useSessionStore.getState().insertExerciseAt(0, { exerciseName: 'Plank', kind: 'strength', exerciseType: 'timed' })
    expect(useSessionStore.getState().exercises[0].inputType).toBe('timed')
  })

  it('replaceExercise derives inputType from the new pick', () => {
    useSessionStore.getState().startFromPrescription(
      [{ exerciseName: 'Squat', tmKey: 'squat', sets: [{ weight: 100, reps: 5 }] }] as never,
      exMgmtMeta,
    )
    useSessionStore.getState().replaceExercise(0, { exerciseName: 'Dead Hang', kind: 'strength', exerciseType: 'timed' })
    expect(useSessionStore.getState().exercises[0].inputType).toBe('timed')
  })

  it('setInputType mutates only the targeted exercise\'s inputType, leaving its sets untouched', () => {
    useSessionStore.getState().startFromPrescription(
      [{ exerciseName: 'Squat', tmKey: 'squat', sets: [{ weight: 100, reps: 5 }] }] as never,
      exMgmtMeta,
    )
    useSessionStore.getState().addExercise({ exerciseName: 'Curl', kind: 'strength' })
    useSessionStore.getState().updateSet(0, 0, { weight: 105, reps: 3 })

    useSessionStore.getState().setInputType(0, 'timed')

    const ex = useSessionStore.getState().exercises
    expect(ex[0].inputType).toBe('timed')
    expect(ex[0].sets[0]).toMatchObject({ weight: 105, reps: 3 }) // switching type doesn't clear entered values
    expect(ex[1].inputType).toBe('weighted') // sibling exercise untouched
  })
})

describe('emptySet / addSet durationSeconds', () => {
  beforeEach(() => useSessionStore.getState().reset())

  it('addExercise seeds 3 empty sets each with durationSeconds: null', () => {
    useSessionStore.getState().startFromPrescription([] as never, exMgmtMeta)
    useSessionStore.getState().addExercise({ exerciseName: 'Plank', kind: 'strength', exerciseType: 'timed' })
    const sets = useSessionStore.getState().exercises[0].sets
    expect(sets.every((s) => s.durationSeconds === null)).toBe(true)
  })
})

describe('updateSet durationSeconds carry-forward', () => {
  beforeEach(() => useSessionStore.getState().reset())

  it('carries a typed duration forward to later not-yet-done sets with no distinct prescribed target (ad-hoc)', () => {
    useSessionStore.getState().startFromPrescription([] as never, exMgmtMeta)
    useSessionStore.getState().addExercise({ exerciseName: 'Front Lever', kind: 'strength', exerciseType: 'timed' })
    useSessionStore.getState().updateSet(0, 0, { durationSeconds: 30 })

    const sets = useSessionStore.getState().exercises[0].sets
    expect(sets[0].durationSeconds).toBe(30)
    expect(sets[1].durationSeconds).toBe(30)
    expect(sets[2].durationSeconds).toBe(30)
  })

  it('does not overwrite a later set already marked done', () => {
    useSessionStore.getState().startFromPrescription([] as never, exMgmtMeta)
    useSessionStore.getState().addExercise({ exerciseName: 'Front Lever', kind: 'strength', exerciseType: 'timed' })
    useSessionStore.getState().toggleDone(0, 1)
    useSessionStore.getState().updateSet(0, 0, { durationSeconds: 30 })

    const sets = useSessionStore.getState().exercises[0].sets
    expect(sets[0].durationSeconds).toBe(30)
    expect(sets[1].durationSeconds).toBeNull() // done set untouched
    expect(sets[2].durationSeconds).toBe(30)
  })

  it('only propagates forward, not to earlier sets', () => {
    useSessionStore.getState().startFromPrescription([] as never, exMgmtMeta)
    useSessionStore.getState().addExercise({ exerciseName: 'Front Lever', kind: 'strength', exerciseType: 'timed' })
    useSessionStore.getState().updateSet(0, 2, { durationSeconds: 30 })

    const sets = useSessionStore.getState().exercises[0].sets
    expect(sets[0].durationSeconds).toBeNull()
    expect(sets[1].durationSeconds).toBeNull()
    expect(sets[2].durationSeconds).toBe(30)
  })

  it('does NOT carry duration forward on a multi-target prescribed exercise overridden to timed (regression for the resurrected-prescribed-set bug)', () => {
    // Squat's 3 prescribed sets each have a distinct prescribedWeight/prescribedReps
    // (135/5, 155/5, 175/3) — the same gate that keeps weight/reps carry-forward off
    // an ascending scheme must also keep duration carry-forward off it, or editing
    // set 1's duration would silently resurrect sets 2/3 at save time.
    useSessionStore.getState().startFromPrescription(prescription, meta)
    useSessionStore.getState().setInputType(0, 'timed')
    useSessionStore.getState().updateSet(0, 0, { durationSeconds: 45 })

    const sets = useSessionStore.getState().exercises[0].sets
    expect(sets[0].durationSeconds).toBe(45)
    expect(sets[1].durationSeconds).toBeNull() // distinct prescribed target — no carry
    expect(sets[2].durationSeconds).toBeNull() // distinct prescribed target — no carry
  })
})

describe('setStartedAt', () => {
  it('overwrites startedAt while a session is active', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    useSessionStore.getState().setStartedAt('2026-07-12T01:00:00.000Z')
    expect(useSessionStore.getState().startedAt).toBe('2026-07-12T01:00:00.000Z')
  })

  it('is a no-op when there is no active session (startedAt is null)', () => {
    expect(useSessionStore.getState().startedAt).toBeNull()
    useSessionStore.getState().setStartedAt('2026-07-12T01:00:00.000Z')
    expect(useSessionStore.getState().startedAt).toBeNull()
  })
})
