import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useRecentExercises } from './recentExercises'
import type { ExerciseListItem } from './exerciseCatalog'

const { resolveExerciseListItems } = vi.hoisted(() => ({ resolveExerciseListItems: vi.fn() }))
vi.mock('./exerciseListItems', () => ({ resolveExerciseListItems }))

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase', () => ({ getSupabase: () => ({ from }) }))

/** Chainable builder recording every call, resolving to the table's queued { data, error }. */
function makeSupabaseByTable(responsesByTable: Record<string, { data: unknown; error: unknown }>, calls: { table: string; method: string; args: unknown[] }[] = []) {
  from.mockImplementation((table: string) => {
    const result = responsesByTable[table]
    if (!result) throw new Error(`no queued response for table: ${table}`)
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'in', 'not']) {
      chain[m] = (...args: unknown[]) => { calls.push({ table, method: m, args }); return chain }
    }
    ;(chain as { then: unknown }).then = (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve)
    return chain
  })
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

const squat: ExerciseListItem = { id: 'ex-squat', name: 'Squat', exerciseType: 'weighted', primaryMuscles: 'quadriceps', equipment: 'barbell' }

beforeEach(() => {
  from.mockReset()
  resolveExerciseListItems.mockReset()
  resolveExerciseListItems.mockResolvedValue([squat])
})

describe('useRecentExercises', () => {
  it('is disabled (no fetch) when userId is undefined', () => {
    const { result } = renderHook(() => useRecentExercises(undefined), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(from).not.toHaveBeenCalled()
  })

  it('queries strength sessions newest-first (limit 50), then their sets, dedupes raw exercise ids by recency, and resolves via resolveExerciseListItems capped at 8', async () => {
    const calls: { table: string; method: string; args: unknown[] }[] = []
    makeSupabaseByTable({
      sessions: { data: [{ id: 's2' }, { id: 's1' }], error: null }, // newest-first
      strength_sets: {
        data: [
          { session_id: 's2', exercise_id: 'ex-b' },
          { session_id: 's2', exercise_id: 'ex-a' },
          { session_id: 's1', exercise_id: 'ex-a' }, // repeat of ex-a — deduped by raw id
          { session_id: 's1', exercise_id: 'ex-c' },
        ],
        error: null,
      },
    }, calls)

    const { result } = renderHook(() => useRecentExercises('user-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const sessionsEq = calls.filter(c => c.table === 'sessions' && c.method === 'eq')
    expect(sessionsEq).toEqual(expect.arrayContaining([
      { table: 'sessions', method: 'eq', args: ['user_id', 'user-1'] },
      { table: 'sessions', method: 'eq', args: ['discipline', 'strength'] },
    ]))
    expect(calls.find(c => c.table === 'sessions' && c.method === 'order')?.args).toEqual(['date', { ascending: false }])
    expect(calls.find(c => c.table === 'sessions' && c.method === 'limit')?.args).toEqual([50])
    expect(calls.find(c => c.table === 'strength_sets' && c.method === 'in')?.args).toEqual(['session_id', ['s2', 's1']])

    // Recency order: s2's rows (ex-b, ex-a) before s1's (ex-a repeat skipped, ex-c)
    expect(resolveExerciseListItems).toHaveBeenCalledWith(['ex-b', 'ex-a', 'ex-c'], 'user-1', 8)
    expect(result.current.data).toEqual([squat])
  })

  it('returns [] without querying strength_sets or resolving when there are no strength sessions', async () => {
    makeSupabaseByTable({ sessions: { data: [], error: null } })

    const { result } = renderHook(() => useRecentExercises('user-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
    expect(resolveExerciseListItems).not.toHaveBeenCalled()
  })
})
