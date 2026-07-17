import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { PresetMeta } from '../domain/presets'
import { buildActivationRows, useActivateProgram } from './activateProgram'

const TEST_PRESET: PresetMeta = {
  id: 'test-preset',
  name: 'Test Preset',
  description: 'A minimal 2-day preset for testing activation.',
  discipline: 'strength',
  daysPerWeek: 2,
  requiresTrainingMaxes: true,
  tmKeys: ['squat', 'benchPress'],
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

// ----- useActivateProgram mutation -----

const { authGetUser, from, resolveExerciseIdsMock } = vi.hoisted(() => {
  const authGetUser = vi.fn()
  const from = vi.fn()
  const resolveExerciseIdsMock = vi.fn()
  return { authGetUser, from, resolveExerciseIdsMock }
})

vi.mock('./supabase', () => ({
  getSupabase: () => ({ auth: { getUser: authGetUser }, from }),
}))

vi.mock('./resolveExerciseIds', () => ({
  resolveExerciseIds: resolveExerciseIdsMock,
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient()
  return createElement(QueryClientProvider, { client: queryClient }, children)
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
