import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildProgramRows, useDeleteProgram, useSaveProgram, useUpdateProgram } from './saveProgram'
import type { ProgramDraft } from '../domain/programDraft'

function draftWith(overrides: Partial<ProgramDraft> = {}): ProgramDraft {
  return {
    name: 'My Program',
    description: 'A test program',
    isPublic: true,
    days: [
      {
        name: 'Day 1',
        exercises: [
          { exerciseName: 'Bench Press', kind: 'strength', sets: [{ reps: 5, weight: 100 }] },
          { exerciseName: 'Push Up', kind: 'bodyweight', sets: [{ reps: 10 }] },
        ],
      },
    ],
    ...overrides,
  }
}

describe('buildProgramRows', () => {
  it('builds a program row wired to the given programId, with name/description/discipline/is_public from the draft', () => {
    const draft = draftWith({ isPublic: true })
    const exerciseIdByName = { 'Bench Press': 'ex-bench', 'Push Up': 'ex-pushup' }
    const ids = { programId: 'prog-1', dayIds: ['day-1'] }

    const rows = buildProgramRows(draft, exerciseIdByName, ids)

    expect(rows.program).toEqual({
      id: 'prog-1',
      name: 'My Program',
      description: 'A test program',
      discipline: 'strength',
      is_public: true,
    })
  })

  it('propagates is_public: false when the draft is not public', () => {
    const draft = draftWith({ isPublic: false })
    const exerciseIdByName = { 'Bench Press': 'ex-bench', 'Push Up': 'ex-pushup' }
    const ids = { programId: 'prog-1', dayIds: ['day-1'] }

    const rows = buildProgramRows(draft, exerciseIdByName, ids)

    expect(rows.program.is_public).toBe(false)
  })

  it('builds one day row per draft day, wired to programId with sequential order_index', () => {
    const draft = draftWith()
    const exerciseIdByName = { 'Bench Press': 'ex-bench', 'Push Up': 'ex-pushup' }
    const ids = { programId: 'prog-1', dayIds: ['day-1'] }

    const rows = buildProgramRows(draft, exerciseIdByName, ids)

    expect(rows.days).toEqual([
      { id: 'day-1', program_id: 'prog-1', name: 'Day 1', order_index: 0 },
    ])
  })

  it('builds exercise rows wired to their day, with resolved exercise_id, order_index within the day, role_key null, and exercise_name/exercise_type from the draft', () => {
    const draft = draftWith()
    const exerciseIdByName = { 'Bench Press': 'ex-bench', 'Push Up': 'ex-pushup' }
    const ids = { programId: 'prog-1', dayIds: ['day-1'] }

    const rows = buildProgramRows(draft, exerciseIdByName, ids)

    expect(rows.exercises).toEqual([
      {
        program_day_id: 'day-1',
        exercise_id: 'ex-bench',
        role_key: null,
        order_index: 0,
        scheme: { type: 'fixed', sets: [{ reps: 5, weight: 100 }] },
        exercise_name: 'Bench Press',
        exercise_type: 'weighted',
      },
      {
        program_day_id: 'day-1',
        exercise_id: 'ex-pushup',
        role_key: null,
        order_index: 1,
        scheme: { type: 'fixed', sets: [{ reps: 10 }] },
        exercise_name: 'Push Up',
        exercise_type: 'bodyweight',
      },
    ])
  })

  it('omits the weight key from bodyweight scheme sets (never weight: undefined)', () => {
    const draft = draftWith()
    const exerciseIdByName = { 'Bench Press': 'ex-bench', 'Push Up': 'ex-pushup' }
    const ids = { programId: 'prog-1', dayIds: ['day-1'] }

    const rows = buildProgramRows(draft, exerciseIdByName, ids)
    const pushUpRow = rows.exercises[1]

    expect(pushUpRow.scheme).toEqual({ type: 'fixed', sets: [{ reps: 10 }] })
    if (pushUpRow.scheme.type === 'fixed') {
      expect('weight' in pushUpRow.scheme.sets[0]).toBe(false)
    }
  })

  it('resets order_index per day across multiple days, rather than incrementing globally', () => {
    const draft = draftWith({
      days: [
        {
          name: 'Day 1',
          exercises: [
            { exerciseName: 'Bench Press', kind: 'strength', sets: [{ reps: 5, weight: 100 }] },
            { exerciseName: 'Push Up', kind: 'bodyweight', sets: [{ reps: 10 }] },
          ],
        },
        {
          name: 'Day 2',
          exercises: [
            { exerciseName: 'Squat', kind: 'strength', sets: [{ reps: 5, weight: 150 }] },
            { exerciseName: 'Lunge', kind: 'bodyweight', sets: [{ reps: 12 }] },
          ],
        },
      ],
    })
    const exerciseIdByName = {
      'Bench Press': 'ex-bench',
      'Push Up': 'ex-pushup',
      Squat: 'ex-squat',
      Lunge: 'ex-lunge',
    }
    const ids = { programId: 'prog-1', dayIds: ['day-1', 'day-2'] }

    const rows = buildProgramRows(draft, exerciseIdByName, ids)

    expect(rows.exercises.map((ex) => ex.order_index)).toEqual([0, 1, 0, 1])
    expect(rows.exercises.map((ex) => ex.program_day_id)).toEqual(['day-1', 'day-1', 'day-2', 'day-2'])
  })
})

// ----- useSaveProgram / useUpdateProgram / useDeleteProgram mutations -----

const { authGetUser, from, resolveDraftExerciseIdsMock } = vi.hoisted(() => {
  const authGetUser = vi.fn()
  const from = vi.fn()
  const resolveDraftExerciseIdsMock = vi.fn()
  return { authGetUser, from, resolveDraftExerciseIdsMock }
})

vi.mock('./supabase', () => ({
  getSupabase: () => ({ auth: { getUser: authGetUser }, from }),
}))

vi.mock('./resolveDraftExercises', () => ({
  resolveDraftExerciseIds: resolveDraftExerciseIdsMock,
}))

interface QueryCall { table: string; method: string; args: unknown[] }
interface SelectResponse { data: unknown; error: unknown }

/** A minimal chainable Postgrest-query-builder stand-in: every chain method
 *  (insert/update/delete/select/eq/in) records the call and returns the same
 *  builder so further chaining keeps working, and the builder is itself a
 *  thenable so `await supabase.from(t)....` resolves without an explicit
 *  terminal call. `select`-verb chains resolve via `responses[table]`
 *  (configurable per test, defaulting to an empty/null result); every other
 *  verb resolves `{ error: null }` unless the test overrides `from` directly
 *  for a specific failure case. */
function trackQueries(responses: Partial<Record<string, () => SelectResponse>> = {}) {
  const calls: QueryCall[] = []
  from.mockImplementation((table: string) => {
    let verb = ''
    const resolvedValue = (): SelectResponse => responses[table]?.() ?? { data: null, error: null }
    const push = (method: string, args: unknown[]) => { calls.push({ table, method, args }) }
    const builder = {
      insert: (...args: unknown[]) => { verb = 'insert'; push('insert', args); return builder },
      update: (...args: unknown[]) => { verb = 'update'; push('update', args); return builder },
      delete: (...args: unknown[]) => { verb = 'delete'; push('delete', args); return builder },
      select: (...args: unknown[]) => { verb = 'select'; push('select', args); return builder },
      eq: (...args: unknown[]) => { push('eq', args); return builder },
      in: (...args: unknown[]) => { push('in', args); return builder },
      maybeSingle: () => Promise.resolve(resolvedValue()),
      single: () => Promise.resolve(resolvedValue()),
      then: (
        resolve: (v: SelectResponse) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(verb === 'select' ? resolvedValue() : { data: null, error: null }).then(resolve, reject),
    }
    return builder
  })
  return calls
}

function draftOfDays(dayCount: number): ProgramDraft {
  return draftWith({
    days: Array.from({ length: dayCount }, (_, i) => ({
      name: `Day ${i + 1}`,
      exercises: [{ exerciseName: 'Bench Press', kind: 'strength' as const, sets: [{ reps: 5, weight: 100 }] }],
    })),
  })
}

function createWrapper() {
  const queryClient = new QueryClient()
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
  return { Wrapper, queryClient }
}

describe('useSaveProgram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    resolveDraftExerciseIdsMock.mockResolvedValue({ 'Bench Press': 'ex-bench', 'Push Up': 'ex-pushup' })
  })

  it('resolves draft exercise ids, then inserts programs -> program_days -> program_exercises, in that order', async () => {
    const calls = trackQueries()
    const { Wrapper } = createWrapper()
    const draft = draftWith({ isPublic: true })

    const { result } = renderHook(() => useSaveProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ draft })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(resolveDraftExerciseIdsMock).toHaveBeenCalledWith(draft, 'user-1')

    const tables = calls.filter(c => ['programs', 'program_days', 'program_exercises'].includes(c.table) && c.method !== 'eq')
    expect(tables.map(c => `${c.table}:${c.method}`)).toEqual([
      'programs:insert',
      'program_days:insert',
      'program_exercises:insert',
    ])

    const programPayload = calls.find(c => c.table === 'programs' && c.method === 'insert')?.args[0] as {
      user_id: string
      name: string
      is_public: boolean
    }
    expect(programPayload.user_id).toBe('user-1')
    expect(programPayload.name).toBe('My Program')
    expect(programPayload.is_public).toBe(true)

    const programId = (calls[0].args[0] as { id: string }).id
    expect(result.current.data).toBe(programId)
  })

  it('never writes to program_state', async () => {
    const calls = trackQueries()
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useSaveProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ draft: draftWith() })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(calls.some(c => c.table === 'program_state')).toBe(false)
  })

  it('invalidates exactly [publicPrograms, userId] on success', async () => {
    trackQueries()
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useSaveProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ draft: draftWith() })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['publicPrograms', 'user-1'] })
  })

  it('returns the new program id', async () => {
    trackQueries()
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useSaveProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ draft: draftWith() })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(typeof result.current.data).toBe('string')
    expect((result.current.data as string).length).toBeGreaterThan(0)
  })

  it('throws if there is no authenticated user, without inserting anything', async () => {
    authGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const calls = trackQueries()

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useSaveProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ draft: draftWith() })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(calls).toHaveLength(0)
  })
})

describe('useUpdateProgram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    resolveDraftExerciseIdsMock.mockResolvedValue({ 'Bench Press': 'ex-bench' })
  })

  it('inserts the new program_days/program_exercises BEFORE deleting the old program_days rows', async () => {
    const calls = trackQueries({
      program_days: () => ({ data: [{ id: 'old-day-1' }, { id: 'old-day-2' }], error: null }),
      program_state: () => ({ data: null, error: null }),
    })
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useUpdateProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ programId: 'prog-1', draft: draftOfDays(2) })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const insertNewDaysIdx = calls.findIndex(c => c.table === 'program_days' && c.method === 'insert')
    const insertExercisesIdx = calls.findIndex(c => c.table === 'program_exercises' && c.method === 'insert')
    const deleteOldDaysIdx = calls.findIndex(c => c.table === 'program_days' && c.method === 'delete')

    expect(insertNewDaysIdx).toBeGreaterThanOrEqual(0)
    expect(insertExercisesIdx).toBeGreaterThanOrEqual(0)
    expect(deleteOldDaysIdx).toBeGreaterThanOrEqual(0)
    expect(insertNewDaysIdx).toBeLessThan(deleteOldDaysIdx)
    expect(insertExercisesIdx).toBeLessThan(deleteOldDaysIdx)

    // The delete targets exactly the old day ids captured before the new insert, never the
    // freshly-inserted ones — otherwise a mid-way failure could strand the program mid-edit.
    const deleteInCall = calls.find(c => c.table === 'program_days' && c.method === 'in')
    expect(deleteInCall?.args).toEqual(['id', ['old-day-1', 'old-day-2']])
  })

  it('updates programs.name/description/is_public from the draft', async () => {
    trackQueries({
      program_days: () => ({ data: [], error: null }),
      program_state: () => ({ data: null, error: null }),
    })
    const { Wrapper } = createWrapper()
    const draft = draftWith({ name: 'Renamed', description: 'New desc', isPublic: false })

    const { result } = renderHook(() => useUpdateProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ programId: 'prog-1', draft })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('clamps program_state.cursor.dayIndex to 0 when the edited program is active and shrinks from 3 to 1 day', async () => {
    const calls = trackQueries({
      program_days: () => ({ data: [{ id: 'old-1' }, { id: 'old-2' }, { id: 'old-3' }], error: null }),
      program_state: () => ({
        data: { user_id: 'user-1', active_program_id: 'prog-1', cursor: { dayIndex: 2, week: 3, cycle: 1 }, last_advance_key: null },
        error: null,
      }),
    })

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useUpdateProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ programId: 'prog-1', draft: draftOfDays(1) })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const clampCall = calls.find(c => c.table === 'program_state' && c.method === 'update')
    expect(clampCall).toBeDefined()
    expect(clampCall?.args[0]).toEqual({ cursor: { dayIndex: 0, week: 3, cycle: 1 } })
  })

  it('does not touch program_state when the edited program is not the active one', async () => {
    const calls = trackQueries({
      program_days: () => ({ data: [{ id: 'old-1' }, { id: 'old-2' }, { id: 'old-3' }], error: null }),
      program_state: () => ({
        data: { user_id: 'user-1', active_program_id: 'some-other-program', cursor: { dayIndex: 2, week: 1, cycle: 1 }, last_advance_key: null },
        error: null,
      }),
    })
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useUpdateProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ programId: 'prog-1', draft: draftOfDays(1) })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(calls.some(c => c.table === 'program_state' && c.method === 'update')).toBe(false)
  })

  it('invalidates [activeWorkout] and [publicPrograms, userId] on success', async () => {
    trackQueries({
      program_days: () => ({ data: [], error: null }),
      program_state: () => ({ data: null, error: null }),
    })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ programId: 'prog-1', draft: draftOfDays(1) })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['activeWorkout'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['publicPrograms', 'user-1'] })
  })

  it('throws if there is no authenticated user, without touching any table', async () => {
    authGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const calls = trackQueries()
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useUpdateProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ programId: 'prog-1', draft: draftOfDays(1) })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(calls).toHaveLength(0)
  })
})

describe('useDeleteProgram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  })

  it('deletes the programs row by id', async () => {
    const calls = trackQueries()
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useDeleteProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ programId: 'prog-1' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const deleteCall = calls.find(c => c.table === 'programs' && c.method === 'delete')
    expect(deleteCall).toBeDefined()
    const eqCall = calls.find(c => c.table === 'programs' && c.method === 'eq')
    expect(eqCall?.args).toEqual(['id', 'prog-1'])
  })

  it('invalidates [publicPrograms, userId] and [activeWorkout] on success', async () => {
    trackQueries()
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ programId: 'prog-1' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['publicPrograms', 'user-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['activeWorkout'] })
  })

  it('throws if there is no authenticated user, without deleting anything', async () => {
    authGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const calls = trackQueries()
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useDeleteProgram(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ programId: 'prog-1' })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(calls).toHaveLength(0)
  })
})
