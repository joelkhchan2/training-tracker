import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useCommonExercises } from './commonExercises'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase', () => ({ getSupabase: () => ({ from }) }))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

const rows = [
  { id: 'ex-squat', name: 'Squat', exercise_type: 'weighted', primary_muscles: 'quadriceps', equipment: 'barbell' },
]

function stubTable(calls: { method: string; args: unknown[] }[]) {
  from.mockImplementation((table: string) => {
    if (table !== 'exercises') throw new Error(`unexpected table: ${table}`)
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'or', 'order', 'limit']) {
      chain[m] = (...args: unknown[]) => { calls.push({ method: m, args }); return chain }
    }
    ;(chain as { then: unknown }).then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve)
    return chain
  })
}

describe('useCommonExercises', () => {
  it('is disabled (no fetch) when userId is undefined', () => {
    const calls: { method: string; args: unknown[] }[] = []
    stubTable(calls)
    const { result } = renderHook(() => useCommonExercises(undefined), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(calls).toHaveLength(0)
  })

  it('queries active canonical global-or-own exercises ordered popularity desc nulls-last, capped 8, mapped to ExerciseListItem', async () => {
    const calls: { method: string; args: unknown[] }[] = []
    stubTable(calls)

    const { result } = renderHook(() => useCommonExercises('user-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(calls.find(c => c.method === 'eq')?.args).toEqual(['is_active', true])
    expect(calls.find(c => c.method === 'is')?.args).toEqual(['canonical_id', null])
    expect(calls.find(c => c.method === 'or')?.args[0]).toBe('user_id.is.null,user_id.eq.user-1')
    expect(calls.find(c => c.method === 'order')?.args).toEqual(['popularity', { ascending: false, nullsFirst: false }])
    expect(calls.find(c => c.method === 'limit')?.args).toEqual([8])
    expect(result.current.data).toEqual([
      { id: 'ex-squat', name: 'Squat', exerciseType: 'weighted', primaryMuscles: 'quadriceps', equipment: 'barbell' },
    ])
  })
})
