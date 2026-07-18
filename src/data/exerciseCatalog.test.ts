import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useExerciseSearch } from './exerciseCatalog'

// Mirrors the subset of the supabase-js query builder useExerciseSearch touches:
// select(...).eq('is_active', true).or(...).ilike(...).limit(...), plus call
// recording so tests can assert the exact filter args (same shape as
// programLibrary.test.ts's fakeTable).
interface QueryCall { method: string; args: unknown[] }

function fakeTable(rows: unknown[], record: (method: string, args: unknown[]) => void) {
  const builder = {
    select: (...args: unknown[]) => { record('select', args); return builder },
    eq: (...args: unknown[]) => { record('eq', args); return builder },
    or: (...args: unknown[]) => { record('or', args); return builder },
    ilike: (...args: unknown[]) => { record('ilike', args); return builder },
    limit: (...args: unknown[]) => { record('limit', args); return builder },
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  }
  return builder
}

function makeSupabase(rows: unknown[], calls: QueryCall[] = []) {
  return {
    from: (table: string) => {
      if (table !== 'exercises') throw new Error(`unexpected table: ${table}`)
      return fakeTable(rows, (method, args) => calls.push({ method, args }))
    },
  }
}

const { getSupabase, __setSupabase } = vi.hoisted(() => {
  let current: unknown
  return {
    getSupabase: () => current,
    __setSupabase: (client: unknown) => { current = client },
  }
})

vi.mock('./supabase', () => ({ getSupabase }))

const SQUAT = { id: 'ex-squat', name: 'Squat', exercise_type: 'weighted' as const }

function createWrapper() {
  const queryClient = new QueryClient()
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
  return { Wrapper, queryClient }
}

describe('useExerciseSearch', () => {
  it('stays disabled (no fetch) for a blank/whitespace-only term', () => {
    const calls: QueryCall[] = []
    __setSupabase(makeSupabase([SQUAT], calls))
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useExerciseSearch('   ', 'user-1'), { wrapper: Wrapper })

    expect(result.current.fetchStatus).toBe('idle')
    expect(calls).toHaveLength(0)
  })

  it('stays disabled (no fetch) when userId is undefined', () => {
    const calls: QueryCall[] = []
    __setSupabase(makeSupabase([SQUAT], calls))
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useExerciseSearch('squat', undefined), { wrapper: Wrapper })

    expect(result.current.fetchStatus).toBe('idle')
    expect(calls).toHaveLength(0)
  })

  it('queries active rows scoped to global-or-own, name ilike the term, capped at 25', async () => {
    const calls: QueryCall[] = []
    __setSupabase(makeSupabase([SQUAT], calls))
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useExerciseSearch('squat', 'user-1'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const eqCall = calls.find(c => c.method === 'eq')
    const orCall = calls.find(c => c.method === 'or')
    const ilikeCall = calls.find(c => c.method === 'ilike')
    const limitCall = calls.find(c => c.method === 'limit')

    expect(eqCall?.args).toEqual(['is_active', true])
    expect(orCall?.args[0]).toBe('user_id.is.null,user_id.eq.user-1')
    expect(ilikeCall?.args).toEqual(['name', '%squat%'])
    expect(limitCall?.args).toEqual([25])
    expect(result.current.data).toEqual([SQUAT])
  })

  it('fetches under the exact query key [exerciseSearch, term, userId]', async () => {
    __setSupabase(makeSupabase([SQUAT]))
    const { Wrapper, queryClient } = createWrapper()

    const { result } = renderHook(() => useExerciseSearch('squat', 'user-1'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(queryClient.getQueryCache().find({ queryKey: ['exerciseSearch', 'squat', 'user-1'] })).toBeDefined()
  })
})
