import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor, act } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useFavoriteExercises, useToggleFavorite } from './favoriteExercises'
import type { ExerciseListItem } from './exerciseCatalog'

const { resolveExerciseListItems } = vi.hoisted(() => ({ resolveExerciseListItems: vi.fn() }))
vi.mock('./exerciseListItems', () => ({ resolveExerciseListItems }))

const { from, deleteMock, insertMock } = vi.hoisted(() => ({
  from: vi.fn(),
  deleteMock: vi.fn(),
  insertMock: vi.fn(),
}))
vi.mock('./supabase', () => ({ getSupabase: () => ({ from }) }))

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn(() => ({ user: { id: 'user-1' } })) }))
vi.mock('../lib/useAuth', () => ({ useAuth }))

const squat: ExerciseListItem = { id: 'ex-squat', name: 'Squat', exerciseType: 'weighted', primaryMuscles: 'quadriceps', equipment: 'barbell' }
const pullup: ExerciseListItem = { id: 'ex-pullup', name: 'Pull-up', exerciseType: 'bodyweight', primaryMuscles: null, equipment: null }

/** Chainable select().eq().order() builder resolving to { data, error }, with call
 *  recording so the query-shape test can assert the exact filter/order args. */
function selectChain(rows: unknown[], calls: { method: string; args: unknown[] }[]) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) {
    chain[m] = (...args: unknown[]) => { calls.push({ method: m, args }); return chain }
  }
  ;(chain as { then: unknown }).then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve)
  return chain
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

function wrapperWithClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children)
  }
  return { Wrapper, qc }
}

beforeEach(() => {
  from.mockReset()
  deleteMock.mockReset()
  insertMock.mockReset()
  resolveExerciseListItems.mockReset()
  useAuth.mockReturnValue({ user: { id: 'user-1' } })
})

describe('useFavoriteExercises', () => {
  it('is disabled (no fetch) when userId is undefined', () => {
    const { result } = renderHook(() => useFavoriteExercises(undefined), { wrapper })
    expect(result.current).toEqual({ items: [], ids: new Set() })
    expect(from).not.toHaveBeenCalled()
  })

  it('queries favorite_exercises for the user ordered created_at desc, resolves the raw ids in that order, and returns { items, ids }', async () => {
    const calls: { method: string; args: unknown[] }[] = []
    from.mockReturnValue(selectChain([{ exercise_id: 'ex-squat' }, { exercise_id: 'ex-pullup' }], calls))
    resolveExerciseListItems.mockResolvedValue([squat, pullup])

    const { result } = renderHook(() => useFavoriteExercises('user-1'), { wrapper })

    await waitFor(() => expect(result.current.items).toEqual([squat, pullup]))

    expect(from).toHaveBeenCalledWith('favorite_exercises')
    const selectCall = calls.find(c => c.method === 'select')
    const eqCall = calls.find(c => c.method === 'eq')
    const orderCall = calls.find(c => c.method === 'order')
    expect(selectCall?.args).toEqual(['exercise_id'])
    expect(eqCall?.args).toEqual(['user_id', 'user-1'])
    expect(orderCall?.args).toEqual(['created_at', { ascending: false }])
    expect(resolveExerciseListItems).toHaveBeenCalledWith(['ex-squat', 'ex-pullup'], 'user-1')
    expect(result.current.ids).toEqual(new Set(['ex-squat', 'ex-pullup']))
  })

  it('fetches under the exact query key [favorites, userId]', async () => {
    from.mockReturnValue(selectChain([], []))
    resolveExerciseListItems.mockResolvedValue([])
    const { Wrapper, qc } = wrapperWithClient()

    renderHook(() => useFavoriteExercises('user-1'), { wrapper: Wrapper })

    await waitFor(() => expect(qc.getQueryCache().find({ queryKey: ['favorites', 'user-1'] })).toBeDefined())
  })
})

describe('useToggleFavorite', () => {
  function seedCache(qc: QueryClient, value: { items: ExerciseListItem[]; ids: Set<string> }) {
    qc.setQueryData(['favorites', 'user-1'], value)
  }

  it('optimistic add: appends the full item to items and adds its id to ids before the mutation resolves', async () => {
    from.mockImplementation(() => ({ insert: insertMock.mockReturnValue(Promise.resolve({ error: null })) }))
    const { Wrapper, qc } = wrapperWithClient()
    seedCache(qc, { items: [squat], ids: new Set(['ex-squat']) })

    const { result } = renderHook(() => useToggleFavorite(), { wrapper: Wrapper })

    act(() => { result.current.mutate({ item: pullup, isFavorited: false }) })

    // Optimistic write happens synchronously in onMutate, before the mutation settles.
    const optimistic = qc.getQueryData<{ items: ExerciseListItem[]; ids: Set<string> }>(['favorites', 'user-1'])
    expect(optimistic?.items).toEqual([squat, pullup])
    expect(optimistic?.ids.has('ex-pullup')).toBe(true)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(insertMock).toHaveBeenCalledWith({ user_id: 'user-1', exercise_id: 'ex-pullup' })
  })

  it('optimistic remove: filters the item out of items and deletes its id from ids before the mutation resolves', async () => {
    const eqChain = { eq: vi.fn() }
    eqChain.eq.mockImplementation(() => eqChain)
    from.mockImplementation(() => ({ delete: deleteMock.mockReturnValue(eqChain) }))
    ;(eqChain as unknown as { then: unknown }).then = (resolve: (v: { error: null }) => unknown) =>
      Promise.resolve({ error: null }).then(resolve)

    const { Wrapper, qc } = wrapperWithClient()
    seedCache(qc, { items: [squat, pullup], ids: new Set(['ex-squat', 'ex-pullup']) })

    const { result } = renderHook(() => useToggleFavorite(), { wrapper: Wrapper })

    act(() => { result.current.mutate({ item: squat, isFavorited: true }) })

    const optimistic = qc.getQueryData<{ items: ExerciseListItem[]; ids: Set<string> }>(['favorites', 'user-1'])
    expect(optimistic?.items).toEqual([pullup])
    expect(optimistic?.ids.has('ex-squat')).toBe(false)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('onError rolls back to the pre-mutation snapshot', async () => {
    from.mockImplementation(() => ({ insert: vi.fn().mockReturnValue(Promise.resolve({ error: new Error('boom') })) }))
    const { Wrapper, qc } = wrapperWithClient()
    seedCache(qc, { items: [squat], ids: new Set(['ex-squat']) })

    const { result } = renderHook(() => useToggleFavorite(), { wrapper: Wrapper })

    act(() => { result.current.mutate({ item: pullup, isFavorited: false }) })

    await waitFor(() => expect(result.current.isError).toBe(true))

    const rolledBack = qc.getQueryData<{ items: ExerciseListItem[]; ids: Set<string> }>(['favorites', 'user-1'])
    expect(rolledBack).toEqual({ items: [squat], ids: new Set(['ex-squat']) })
  })

  it('onSettled invalidates [favorites, userId]', async () => {
    from.mockImplementation(() => ({ insert: vi.fn().mockReturnValue(Promise.resolve({ error: null })) }))
    const { Wrapper, qc } = wrapperWithClient()
    seedCache(qc, { items: [], ids: new Set() })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useToggleFavorite(), { wrapper: Wrapper })
    act(() => { result.current.mutate({ item: squat, isFavorited: false }) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favorites', 'user-1'] })
  })
})
