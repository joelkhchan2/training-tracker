import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { PresetMeta } from '../domain/presets'
import type { LinearProgressionConfig } from '../domain'
import { buildActivationRows, useActivateDbProgram, useActivateProgram } from './activateProgram'
import { buildDomainProgram } from './queries'
import type { ProgramDayRow, ProgramExerciseRow, ProgramRow } from './types'

const TEST_PRESET: PresetMeta = {
  id: 'test-preset',
  name: 'Test Preset',
  description: 'A minimal 2-day preset for testing activation.',
  discipline: 'strength',
  daysPerWeek: 2,
  requiresTrainingMaxes: true,
  tmKeys: ['squat', 'benchPress'],
  requiresStartingWeights: false,
  startingWeightLifts: [],
  program: {
    name: 'Test Preset',
    discipline: 'strength',
    progressionRule: { type: 'linear', add: 5, unit: 'lbs', on: 'session' },
    days: [
      {
        name: 'Day A',
        exercises: [
          { exerciseName: 'Squat', tmKey: 'squat', order: 0, scheme: { type: 'fixed', sets: [{ reps: 5 }] } },
          { exerciseName: 'Pull-ups', order: 1, scheme: { type: 'fixed', sets: [{ reps: 8 }] } },
        ],
      },
      {
        name: 'Day B',
        exercises: [
          { exerciseName: 'Bench Press', tmKey: 'benchPress', order: 0, scheme: { type: 'fixed', sets: [{ reps: 5 }] } },
          // Same name as Day A's exercise — must resolve to the same id.
          { exerciseName: 'Squat', order: 1, scheme: { type: 'fixed', sets: [{ reps: 8 }] } },
        ],
      },
    ],
  },
}

describe('buildActivationRows', () => {
  const exerciseIdByName = new Map([
    ['Squat', 'ex-squat'],
    ['Pull-ups', 'ex-pullups'],
    ['Bench Press', 'ex-bench'],
  ])
  const ids = { programId: 'prog-1', dayIds: ['day-a', 'day-b'] }

  it('wires the program row to the generated id', () => {
    const rows = buildActivationRows(TEST_PRESET, { squat: 225, benchPress: 155 }, exerciseIdByName, ids)

    expect(rows.program).toEqual({
      id: 'prog-1',
      name: 'Test Preset',
      description: TEST_PRESET.description,
      discipline: 'strength',
      progression_rule: TEST_PRESET.program.progressionRule,
      is_public: false,
    })
  })

  it('wires each day to the program id and a generated day id, in order', () => {
    const rows = buildActivationRows(TEST_PRESET, { squat: 225, benchPress: 155 }, exerciseIdByName, ids)

    expect(rows.days).toEqual([
      { id: 'day-a', program_id: 'prog-1', name: 'Day A', order_index: 0 },
      { id: 'day-b', program_id: 'prog-1', name: 'Day B', order_index: 1 },
    ])
  })

  it('wires program_exercises to their day id and resolved exercise id, carrying the preset scheme and tmKey', () => {
    const rows = buildActivationRows(TEST_PRESET, { squat: 225, benchPress: 155 }, exerciseIdByName, ids)

    expect(rows.programExercises).toEqual([
      { program_day_id: 'day-a', exercise_id: 'ex-squat', role_key: 'squat', order_index: 0, scheme: { type: 'fixed', sets: [{ reps: 5 }] } },
      { program_day_id: 'day-a', exercise_id: 'ex-pullups', role_key: null, order_index: 1, scheme: { type: 'fixed', sets: [{ reps: 8 }] } },
      { program_day_id: 'day-b', exercise_id: 'ex-bench', role_key: 'benchPress', order_index: 0, scheme: { type: 'fixed', sets: [{ reps: 5 }] } },
      { program_day_id: 'day-b', exercise_id: 'ex-squat', role_key: null, order_index: 1, scheme: { type: 'fixed', sets: [{ reps: 8 }] } },
    ])
  })

  it('emits training_maxes rows only for preset.tmKeys, dropping any other keys the caller passed', () => {
    const rows = buildActivationRows(
      TEST_PRESET,
      { squat: 225, benchPress: 155, deadlift: 315 },
      exerciseIdByName,
      ids,
    )

    expect(rows.trainingMaxes).toEqual([
      { key: 'squat', value: 225 },
      { key: 'benchPress', value: 155 },
    ])
  })

  it('omits a training_maxes row for a tmKey the caller did not supply a value for', () => {
    const rows = buildActivationRows(TEST_PRESET, { squat: 225 }, exerciseIdByName, ids)

    expect(rows.trainingMaxes).toEqual([{ key: 'squat', value: 225 }])
  })

  it('points program_state at the new program with a fresh cursor and no last_advance_key', () => {
    const rows = buildActivationRows(TEST_PRESET, { squat: 225, benchPress: 155 }, exerciseIdByName, ids)

    expect(rows.programState).toEqual({
      active_program_id: 'prog-1',
      cursor: { dayIndex: 0, week: 1, cycle: 1 },
      last_advance_key: null,
    })
  })
})

// ----- linear progression round-trip (activate -> read-back) -----
//
// The linear-progression config lives on the `linear` scheme itself
// (Scheme's `linear` variant carries `progression`) specifically so it rides
// along with `scheme` through the jsonb column with no separate handling —
// `buildActivationRows` only ever serializes `scheme` verbatim, and
// `buildDomainProgram` only ever reads `scheme` back. This test simulates
// that full round trip (build activation rows -> simulated jsonb row ->
// buildDomainProgram) and asserts the config survives intact.
describe('linear progression config round-trip', () => {
  const LP_CONFIG: LinearProgressionConfig = { increment: 5, deloadPercent: 0.1, failsBeforeDeload: 3 }

  const LP_PRESET: PresetMeta = {
    id: 'lp-test',
    name: 'LP Test',
    description: 'A minimal 1-day preset for testing linear-progression round-tripping.',
    discipline: 'strength',
    daysPerWeek: 1,
    requiresTrainingMaxes: false,
    tmKeys: [],
    requiresStartingWeights: true,
    startingWeightLifts: [{ exerciseName: 'Squat', label: 'Squat' }],
    program: {
      name: 'LP Test',
      discipline: 'strength',
      days: [
        {
          name: 'Day A',
          exercises: [
            {
              exerciseName: 'Squat',
              tmKey: 'squat',
              order: 0,
              scheme: {
                type: 'linear',
                sets: [{ reps: 5 }, { reps: 5 }, { reps: 5, amrap: true, targetReps: 5 }],
                progression: LP_CONFIG,
              },
            },
          ],
        },
      ],
    },
  }

  it('survives buildActivationRows -> (simulated jsonb) -> buildDomainProgram intact', () => {
    const exerciseIdByName = new Map([['Squat', 'ex-squat']])
    const ids = { programId: 'prog-1', dayIds: ['day-a'] }

    const rows = buildActivationRows(LP_PRESET, {}, exerciseIdByName, ids)

    // `buildActivationRows` writes `scheme` verbatim, so the progression config
    // rides along automatically — no separate `progression` column/field exists.
    expect(rows.programExercises[0].scheme).toEqual(LP_PRESET.program.days[0].exercises[0].scheme)

    // Simulate storing + reading back the jsonb `scheme` column as DB rows.
    const programRow: ProgramRow = {
      id: 'prog-1', user_id: 'u1', name: LP_PRESET.program.name, description: null,
      discipline: 'strength', progression_rule: null, is_public: false, created_at: '2026-01-01T00:00:00Z',
    }
    const dayRow: ProgramDayRow = { id: 'day-a', program_id: 'prog-1', name: 'Day A', order_index: 0 }
    const programExerciseRow: ProgramExerciseRow = {
      id: 'pe-1',
      program_day_id: rows.programExercises[0].program_day_id,
      exercise_id: rows.programExercises[0].exercise_id,
      role_key: rows.programExercises[0].role_key,
      order_index: rows.programExercises[0].order_index,
      scheme: rows.programExercises[0].scheme,
      exercise_name: null,
      exercise_type: null,
    }

    const program = buildDomainProgram(programRow, [dayRow], [programExerciseRow], {})
    const squat = program.days[0].exercises[0]

    expect(squat.scheme.type).toBe('linear')
    if (squat.scheme.type === 'linear') {
      expect(squat.scheme.progression).toEqual(LP_CONFIG)
    }
  })
})

// ----- exercise_progress seeding (starting weights for linear-scheme exercises) -----

describe('buildActivationRows - exercise_progress seeding', () => {
  const LP_CONFIG: LinearProgressionConfig = { increment: 5, deloadPercent: 0.1, failsBeforeDeload: 3 }

  const linearScheme = { type: 'linear' as const, sets: [{ reps: 5 }], progression: LP_CONFIG }
  const fixedScheme = { type: 'fixed' as const, sets: [{ reps: 8 }] }

  const LP_PRESET: PresetMeta = {
    id: 'lp-progress-test',
    name: 'LP Progress Test',
    description: 'A 2-day preset for testing exercise_progress seeding.',
    discipline: 'strength',
    daysPerWeek: 2,
    requiresTrainingMaxes: false,
    tmKeys: [],
    requiresStartingWeights: true,
    startingWeightLifts: [
      { exerciseName: 'Squat', label: 'Squat' },
      { exerciseName: 'Bench Press', label: 'Bench Press' },
    ],
    program: {
      name: 'LP Progress Test',
      discipline: 'strength',
      days: [
        {
          name: 'Day A',
          exercises: [
            { exerciseName: 'Squat', order: 0, scheme: linearScheme },
            { exerciseName: 'Pull-ups', order: 1, scheme: fixedScheme },
          ],
        },
        {
          name: 'Day B',
          exercises: [
            // Same lift as Day A — must dedupe to a single exercise_progress row.
            { exerciseName: 'Squat', order: 0, scheme: linearScheme },
            { exerciseName: 'Bench Press', order: 1, scheme: linearScheme },
          ],
        },
      ],
    },
  }

  const exerciseIdByName = new Map([
    ['Squat', 'ex-squat'],
    ['Pull-ups', 'ex-pullups'],
    ['Bench Press', 'ex-bench'],
  ])
  const ids = { programId: 'prog-1', dayIds: ['day-a', 'day-b'] }

  it('emits one exercise_progress row per distinct linear-scheme exercise with a starting weight, fails 0, program/exercise ids wired', () => {
    const rows = buildActivationRows(LP_PRESET, {}, exerciseIdByName, ids, { Squat: 135, 'Bench Press': 95 })

    expect(rows.exerciseProgress).toEqual([
      { program_id: 'prog-1', exercise_id: 'ex-squat', current_weight: 135, consecutive_fails: 0 },
      { program_id: 'prog-1', exercise_id: 'ex-bench', current_weight: 95, consecutive_fails: 0 },
    ])
  })

  it('omits a fixed-scheme exercise even if a matching starting weight was supplied', () => {
    const rows = buildActivationRows(LP_PRESET, {}, exerciseIdByName, ids, {
      Squat: 135,
      'Bench Press': 95,
      'Pull-ups': 0,
    })

    expect(rows.exerciseProgress.some(row => row.exercise_id === 'ex-pullups')).toBe(false)
  })

  it('omits a linear-scheme exercise with no starting weight supplied', () => {
    const rows = buildActivationRows(LP_PRESET, {}, exerciseIdByName, ids, { Squat: 135 })

    expect(rows.exerciseProgress).toEqual([
      { program_id: 'prog-1', exercise_id: 'ex-squat', current_weight: 135, consecutive_fails: 0 },
    ])
  })

  it('defaults to no exercise_progress rows when startingWeights is omitted (back-compat)', () => {
    const rows = buildActivationRows(LP_PRESET, {}, exerciseIdByName, ids)
    expect(rows.exerciseProgress).toEqual([])
  })
})

// ----- useActivateProgram mutation -----

const { authGetUser, from, resolveExerciseIdsMock, resolveDraftExerciseIdsMock } = vi.hoisted(() => {
  const authGetUser = vi.fn()
  const from = vi.fn()
  const resolveExerciseIdsMock = vi.fn()
  const resolveDraftExerciseIdsMock = vi.fn()
  return { authGetUser, from, resolveExerciseIdsMock, resolveDraftExerciseIdsMock }
})

vi.mock('./supabase', () => ({
  getSupabase: () => ({ auth: { getUser: authGetUser }, from }),
}))

vi.mock('./resolveExerciseIds', () => ({
  resolveExerciseIds: resolveExerciseIdsMock,
}))

vi.mock('./resolveDraftExercises', () => ({
  resolveDraftExerciseIds: resolveDraftExerciseIdsMock,
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient()
  return createElement(QueryClientProvider, { client: queryClient }, children)
}

/** Like `wrapper` above, but exposes the `QueryClient` so a test can spy on
 *  `invalidateQueries` (mirrors `saveProgram.test.ts`'s `createWrapper`). */
function createWrapper() {
  const queryClient = new QueryClient()
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
  return { Wrapper, queryClient }
}

/** Records every from(table).insert/upsert call, in call order, and resolves each with no error. */
function trackTables() {
  const calls: { table: string; method: 'insert' | 'upsert'; payload: unknown; opts?: unknown }[] = []
  from.mockImplementation((table: string) => ({
    insert: (payload: unknown) => {
      calls.push({ table, method: 'insert', payload })
      return Promise.resolve({ error: null })
    },
    upsert: (payload: unknown, opts?: unknown) => {
      calls.push({ table, method: 'upsert', payload, opts })
      return Promise.resolve({ error: null })
    },
  }))
  return calls
}

describe('useActivateProgram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    resolveExerciseIdsMock.mockResolvedValue(new Map([
      ['Squat', 'ex-squat'],
      ['Pull-ups', 'ex-pullups'],
      ['Bench Press', 'ex-bench'],
    ]))
  })

  it('inserts programs -> program_days -> program_exercises, then upserts training_maxes and program_state, in that order', async () => {
    const calls = trackTables()
    const { result } = renderHook(() => useActivateProgram(), { wrapper })

    await act(async () => {
      result.current.mutate({ preset: TEST_PRESET, trainingMaxes: { squat: 225, benchPress: 155 } })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(calls.map(c => `${c.table}:${c.method}`)).toEqual([
      'programs:insert',
      'program_days:insert',
      'program_exercises:insert',
      'training_maxes:upsert',
      'program_state:upsert',
    ])

    const programRow = calls[0].payload as { id: string; user_id: string; name: string }
    expect(programRow.user_id).toBe('user-1')
    expect(programRow.name).toBe('Test Preset')
    const programId = programRow.id

    const dayRows = calls[1].payload as { id: string; program_id: string }[]
    expect(dayRows).toHaveLength(2)
    for (const day of dayRows) expect(day.program_id).toBe(programId)

    const peRows = calls[2].payload as { program_day_id: string; exercise_id: string | null }[]
    expect(peRows).toHaveLength(4)
    const dayIds = dayRows.map(d => d.id)
    for (const pe of peRows) expect(dayIds).toContain(pe.program_day_id)

    const tmRows = calls[3].payload as { user_id: string; key: string; value: number }[]
    expect(tmRows).toEqual([
      { user_id: 'user-1', key: 'squat', value: 225 },
      { user_id: 'user-1', key: 'benchPress', value: 155 },
    ])
    expect(calls[3].opts).toEqual({ onConflict: 'user_id,key' })

    const stateRow = calls[4].payload as { user_id: string; active_program_id: string }
    expect(stateRow).toEqual({
      user_id: 'user-1',
      active_program_id: programId,
      cursor: { dayIndex: 0, week: 1, cycle: 1 },
      last_advance_key: null,
    })
    expect(calls[4].opts).toEqual({ onConflict: 'user_id' })

    expect(result.current.data).toBe(programId)
  })

  it('seeds exercise_progress (after program_exercises, before training_maxes) from startingWeights for a linear-scheme preset', async () => {
    const LP_CONFIG: LinearProgressionConfig = { increment: 5, deloadPercent: 0.1, failsBeforeDeload: 3 }
    const LP_MUTATION_PRESET: PresetMeta = {
      id: 'lp-mutation-test',
      name: 'LP Mutation Test',
      description: 'A 1-day preset for testing exercise_progress seeding via the mutation.',
      discipline: 'strength',
      daysPerWeek: 1,
      requiresTrainingMaxes: false,
      tmKeys: [],
      requiresStartingWeights: true,
      startingWeightLifts: [{ exerciseName: 'Squat', label: 'Squat' }],
      program: {
        name: 'LP Mutation Test',
        discipline: 'strength',
        days: [
          {
            name: 'Day A',
            exercises: [
              { exerciseName: 'Squat', order: 0, scheme: { type: 'linear', sets: [{ reps: 5 }], progression: LP_CONFIG } },
            ],
          },
        ],
      },
    }

    const calls = trackTables()
    const { result } = renderHook(() => useActivateProgram(), { wrapper })

    await act(async () => {
      result.current.mutate({
        preset: LP_MUTATION_PRESET,
        trainingMaxes: {},
        startingWeights: { Squat: 135 },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(calls.map(c => `${c.table}:${c.method}`)).toEqual([
      'programs:insert',
      'program_days:insert',
      'program_exercises:insert',
      'exercise_progress:insert',
      'program_state:upsert',
    ])

    const programId = result.current.data
    const progressRows = calls[3].payload as {
      user_id: string
      program_id: string
      exercise_id: string
      current_weight: number
      consecutive_fails: number
    }[]
    expect(progressRows).toEqual([
      { user_id: 'user-1', program_id: programId, exercise_id: 'ex-squat', current_weight: 135, consecutive_fails: 0 },
    ])
  })

  it('resolves exercise ids for every distinct exercise name in the preset before inserting', async () => {
    trackTables()
    const { result } = renderHook(() => useActivateProgram(), { wrapper })

    await act(async () => {
      result.current.mutate({ preset: TEST_PRESET, trainingMaxes: { squat: 225, benchPress: 155 } })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(resolveExerciseIdsMock).toHaveBeenCalledTimes(1)
    const [names, userId] = resolveExerciseIdsMock.mock.calls[0] as [string[], string]
    expect(new Set(names)).toEqual(new Set(['Squat', 'Pull-ups', 'Bench Press']))
    expect(userId).toBe('user-1')
  })

  it('surfaces an error and does not proceed to later inserts if an earlier insert fails', async () => {
    from.mockImplementation((table: string) => ({
      insert: () => {
        if (table === 'programs') return Promise.resolve({ error: { message: 'boom' } })
        throw new Error(`should not reach ${table}`)
      },
      upsert: () => { throw new Error(`should not reach ${table}`) },
    }))

    const { result } = renderHook(() => useActivateProgram(), { wrapper })

    await act(async () => {
      result.current.mutate({ preset: TEST_PRESET, trainingMaxes: { squat: 225, benchPress: 155 } })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('throws if there is no authenticated user, without inserting anything', async () => {
    authGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const calls = trackTables()

    const { result } = renderHook(() => useActivateProgram(), { wrapper })

    await act(async () => {
      result.current.mutate({ preset: TEST_PRESET, trainingMaxes: { squat: 225, benchPress: 155 } })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(calls).toHaveLength(0)
  })
})

// ----- useActivateDbProgram mutation -----

interface DbQueryCall { table: string; method: string; args: unknown[] }
interface DbResponse { data: unknown; error: unknown }

/** A chainable Postgrest-query-builder stand-in (mirrors saveProgram.test.ts's
 *  `trackQueries`, plus `.order()` since the fetch side chains `.eq().order()`):
 *  every chain method records the call and returns the same builder, and the
 *  builder is itself a thenable so `await supabase.from(t)....` resolves without
 *  an explicit terminal call. `select`-verb chains resolve via `responses[table]`
 *  (configurable per test); every other verb resolves `{ error: null }`. */
function trackDbQueries(responses: Partial<Record<string, () => DbResponse>> = {}) {
  const calls: DbQueryCall[] = []
  from.mockImplementation((table: string) => {
    let verb = ''
    const resolvedValue = (): DbResponse => responses[table]?.() ?? { data: null, error: null }
    const push = (method: string, args: unknown[]) => { calls.push({ table, method, args }) }
    const builder = {
      insert: (...args: unknown[]) => { verb = 'insert'; push('insert', args); return builder },
      upsert: (...args: unknown[]) => { verb = 'upsert'; push('upsert', args); return builder },
      select: (...args: unknown[]) => { verb = 'select'; push('select', args); return builder },
      eq: (...args: unknown[]) => { push('eq', args); return builder },
      in: (...args: unknown[]) => { push('in', args); return builder },
      order: (...args: unknown[]) => { push('order', args); return builder },
      single: () => Promise.resolve(resolvedValue()),
      then: (
        resolve: (v: DbResponse) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(verb === 'select' ? resolvedValue() : { data: null, error: null }).then(resolve, reject),
    }
    return builder
  })
  return calls
}

const SOURCE_PROGRAM_ROW: ProgramRow = {
  id: 'prog-own', user_id: 'user-1', name: 'My Own Program', description: 'desc',
  discipline: 'strength', progression_rule: null, is_public: false, created_at: '2026-01-01T00:00:00Z',
}

const SOURCE_DAYS: ProgramDayRow[] = [
  { id: 'day-a', program_id: 'prog-own', name: 'Day A', order_index: 0 },
]

const SOURCE_EXERCISES: ProgramExerciseRow[] = [
  {
    id: 'pe-1', program_day_id: 'day-a', exercise_id: 'ex-squat', role_key: null, order_index: 0,
    scheme: { type: 'fixed', sets: [{ reps: 5 }] }, exercise_name: 'Squat', exercise_type: 'weighted',
  },
]

describe('useActivateDbProgram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  })

  it('activating an own program upserts program_state at that id with a reset cursor, and inserts no new program/day/exercise rows', async () => {
    const calls = trackDbQueries({
      programs: () => ({ data: SOURCE_PROGRAM_ROW, error: null }),
      program_days: () => ({ data: SOURCE_DAYS, error: null }),
      program_exercises: () => ({ data: SOURCE_EXERCISES, error: null }),
    })

    const { result } = renderHook(() => useActivateDbProgram(), { wrapper })

    await act(async () => {
      result.current.mutate({ programId: 'prog-own' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(calls.some(c => c.table === 'programs' && c.method === 'insert')).toBe(false)
    expect(calls.some(c => c.table === 'program_days' && c.method === 'insert')).toBe(false)
    expect(calls.some(c => c.table === 'program_exercises' && c.method === 'insert')).toBe(false)

    const stateUpsert = calls.find(c => c.table === 'program_state' && c.method === 'upsert')
    expect(stateUpsert?.args[0]).toEqual({
      user_id: 'user-1',
      active_program_id: 'prog-own',
      cursor: { dayIndex: 0, week: 1, cycle: 1 },
      last_advance_key: null,
    })
    expect(stateUpsert?.args[1]).toEqual({ onConflict: 'user_id' })

    expect(result.current.data).toBe('prog-own')
  })

  it("activating another user's public program clones a new owned program tree with is_public:false, activator-resolved exercise ids, and program_state pointed at the new clone with a reset cursor", async () => {
    const communityProgramRow: ProgramRow = {
      id: 'prog-community', user_id: 'other-user', name: 'Community Program', description: 'A shared program',
      discipline: 'strength', progression_rule: null, is_public: true, created_at: '2026-01-01T00:00:00Z',
    }
    const communityDays: ProgramDayRow[] = [
      { id: 'src-day-a', program_id: 'prog-community', name: 'Day A', order_index: 0 },
    ]
    const communityExercises: ProgramExerciseRow[] = [
      {
        id: 'src-pe-1', program_day_id: 'src-day-a', exercise_id: 'author-ex-squat', role_key: null, order_index: 0,
        scheme: { type: 'fixed', sets: [{ reps: 5 }] }, exercise_name: 'Squat', exercise_type: 'weighted',
      },
    ]

    const calls = trackDbQueries({
      programs: () => ({ data: communityProgramRow, error: null }),
      program_days: () => ({ data: communityDays, error: null }),
      program_exercises: () => ({ data: communityExercises, error: null }),
    })

    resolveDraftExerciseIdsMock.mockResolvedValue({ Squat: 'activator-ex-squat' })

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useActivateDbProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ programId: 'prog-community' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Resolves exercise names in the activator's OWN catalog, against a forced-private draft.
    expect(resolveDraftExerciseIdsMock).toHaveBeenCalledTimes(1)
    const [draftArg, userIdArg] = resolveDraftExerciseIdsMock.mock.calls[0] as [{ isPublic: boolean }, string]
    expect(userIdArg).toBe('user-1')
    expect(draftArg.isPublic).toBe(false)

    const insertedProgram = calls.find(c => c.table === 'programs' && c.method === 'insert')?.args[0] as {
      id: string; user_id: string; is_public: boolean; name: string
    }
    expect(insertedProgram).toBeDefined()
    expect(insertedProgram.user_id).toBe('user-1')
    // Forced private snapshot — never re-published, even though the source was public.
    expect(insertedProgram.is_public).toBe(false)
    expect(insertedProgram.name).toBe('Community Program')
    const newProgramId = insertedProgram.id
    expect(newProgramId).not.toBe('prog-community')

    const insertedDays = calls.find(c => c.table === 'program_days' && c.method === 'insert')?.args[0] as {
      id: string; program_id: string
    }[]
    expect(insertedDays).toHaveLength(1)
    expect(insertedDays[0].program_id).toBe(newProgramId)

    const insertedExercises = calls.find(c => c.table === 'program_exercises' && c.method === 'insert')?.args[0] as {
      program_day_id: string; exercise_id: string; exercise_name: string
    }[]
    expect(insertedExercises).toHaveLength(1)
    // Activator-resolved id, never the author's original exercise_id ('author-ex-squat').
    expect(insertedExercises[0].exercise_id).toBe('activator-ex-squat')
    expect(insertedExercises[0].exercise_name).toBe('Squat')
    expect(insertedExercises[0].program_day_id).toBe(insertedDays[0].id)

    const stateUpsert = calls.find(c => c.table === 'program_state' && c.method === 'upsert')
    expect(stateUpsert?.args[0]).toEqual({
      user_id: 'user-1',
      active_program_id: newProgramId,
      cursor: { dayIndex: 0, week: 1, cycle: 1 },
      last_advance_key: null,
    })
    expect(stateUpsert?.args[1]).toEqual({ onConflict: 'user_id' })

    expect(result.current.data).toBe(newProgramId)

    // The clone lands in the activator's own "My programs" list, so that list must be
    // invalidated too — not just ['activeWorkout'].
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['activeWorkout'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['publicPrograms', 'user-1'] })
  })

  it('throws if there is no authenticated user, without fetching or inserting anything', async () => {
    authGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const calls = trackDbQueries()

    const { result } = renderHook(() => useActivateDbProgram(), { wrapper })

    await act(async () => {
      result.current.mutate({ programId: 'prog-own' })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(calls).toHaveLength(0)
  })
})
