import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useAlternateExercises } from './alternateExercises'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase', () => ({ getSupabase: () => ({ from }) }))

/** Build a chainable query stub whose awaited value is { data, error }. Every intermediate
 *  method (select/eq/is/or/order/limit) returns the same thenable. */
function stub(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'is', 'or', 'order', 'limit']
  for (const m of methods) chain[m] = () => chain
  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

// primary_muscles strings mirror the real catalog examples pinned in src/domain/alternates.test.ts
const squatRow = {
  id: 'sq',
  name: 'Barbell Squat',
  exercise_type: 'weighted',
  primary_muscles: 'quadriceps, calves, glutes, hamstrings, back',
  movement_pattern: 'squat',
}
const deadliftRow = {
  id: 'dl',
  name: 'Barbell Deadlift',
  exercise_type: 'weighted',
  primary_muscles: 'lower back, hamstrings, back, calves, arms, glutes, hamstrings, lats, back, quadriceps, traps',
  movement_pattern: 'pull',
}
const curlRow = {
  id: 'cu',
  name: 'Biceps Curl',
  exercise_type: 'weighted',
  primary_muscles: 'biceps',
  movement_pattern: 'pull',
}

describe('useAlternateExercises', () => {
  beforeEach(() => from.mockReset())

  it('ranks by shared-muscle count and excludes zero-overlap candidates', async () => {
    from.mockReturnValueOnce(stub({ data: [squatRow, deadliftRow, curlRow], error: null }))
    const { result } = renderHook(() => useAlternateExercises('sq', 'Barbell Squat', 'u1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const ids = result.current.data?.map((a) => a.id)
    expect(ids?.[0]).toBe('dl')
    expect(ids).not.toContain('cu')
    expect(ids).not.toContain('sq')
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('exercises')
  })

  it('resolves the current exercise by case-insensitive name when currentExerciseId is null', async () => {
    from.mockReturnValueOnce(stub({ data: [squatRow, deadliftRow, curlRow], error: null }))
    const { result } = renderHook(() => useAlternateExercises(null, 'Barbell Squat', 'u1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const ids = result.current.data?.map((a) => a.id)
    expect(ids?.[0]).toBe('dl')
    expect(ids).not.toContain('sq')
  })
})
