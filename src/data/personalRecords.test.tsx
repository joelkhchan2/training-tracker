import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { usePersonalRecords } from './personalRecords'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase', () => ({ getSupabase: () => ({ from }) }))

function stub(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit', 'gt']) chain[m] = () => chain
  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('usePersonalRecords', () => {
  beforeEach(() => from.mockReset())

  it('reconciles seeded personal_records with live sets/sends', async () => {
    from
      .mockReturnValueOnce(stub({ data: [
        { exercise_id: 'dl', pr_type: 'e1rm', value: 440, weight: 405, reps: 3, exercises: { name: 'Deadlift' } },
        { exercise_id: 'k', pr_type: 'max_v_grade', value: 5, weight: null, reps: null, exercises: { name: 'Climbing' } },
      ], error: null })) // personal_records
      .mockReturnValueOnce(stub({ data: [
        { exercise_id: 's', session_id: 'x', weight: 315, reps: 3, exercises: { name: 'Squat' } },
      ], error: null })) // strength_sets
      .mockReturnValueOnce(stub({ data: [{ grade: 'V4' }], error: null })) // climbing_sends
    const { result } = renderHook(() => usePersonalRecords('u1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const d = result.current.data as { strength: { exerciseName: string }[]; climbingMaxGrade: number | null }
    expect(d.strength.map(r => r.exerciseName).sort()).toEqual(['Deadlift', 'Squat'])
    expect(d.climbingMaxGrade).toBe(5) // seeded V5 beats live V4
  })

  it('filters climbing_sends to sent grades (count > 0) when reading personal records', async () => {
    const gtSpy = vi.fn()
    const sendsChain = stub({ data: [{ grade: 'V7' }], error: null })
    const origGt = sendsChain.gt as (...args: unknown[]) => unknown
    sendsChain.gt = (...args: unknown[]) => { gtSpy(...args); return origGt(...args) }

    from
      .mockReturnValueOnce(stub({ data: [], error: null })) // personal_records
      .mockReturnValueOnce(stub({ data: [], error: null })) // strength_sets
      .mockReturnValueOnce(sendsChain) // climbing_sends

    const { result } = renderHook(() => usePersonalRecords('u1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // Regression guard: the climbing_sends query must filter to count > 0, or a
    // projecting-only (never-sent) grade would fabricate a Progress-tab PR.
    expect(gtSpy).toHaveBeenCalledWith('count', 0)
  })
})
