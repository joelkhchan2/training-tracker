import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useSessionDetail } from './sessionDetail'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase', () => ({ getSupabase: () => ({ from }) }))

/** Build a chainable query stub whose awaited value is { data, error }. Every intermediate
 *  method (select/eq/order/maybeSingle) returns the same thenable. */
function stub(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'in', 'order', 'maybeSingle', 'single', 'limit']
  for (const m of methods) chain[m] = () => chain
  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useSessionDetail', () => {
  beforeEach(() => from.mockReset())

  it('returns null when the session is not found', async () => {
    from.mockReturnValueOnce(stub({ data: null, error: null })) // sessions query
    const { result } = renderHook(() => useSessionDetail('missing'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('shapes a strength session into grouped exercises', async () => {
    from
      .mockReturnValueOnce(stub({ data: { id: 's1', discipline: 'strength', date: '2026-07-20', session_type: 'Gym A', program_variant: null, program_week: null, duration_minutes: 45, body_weight: 80, notes: 'ok' }, error: null }))
      .mockReturnValueOnce(stub({ data: [
        { weight: 100, reps: 5, rpe: null, is_warmup: true, order_index: 0, set_number: 1, exercises: { name: 'Squat' } },
        { weight: 140, reps: 5, rpe: 8, is_warmup: false, order_index: 0, set_number: 2, exercises: { name: 'Squat' } },
      ], error: null }))
    const { result } = renderHook(() => useSessionDetail('s1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const d = result.current.data as { kind: string; exercises: { exerciseName: string; sets: unknown[] }[] }
    expect(d.kind).toBe('strength')
    expect(d.exercises).toHaveLength(1)
    expect(d.exercises[0].exerciseName).toBe('Squat')
    expect(d.exercises[0].sets).toHaveLength(2)
  })

  it('flows duration_seconds through into DetailSet for a timed set', async () => {
    from
      .mockReturnValueOnce(stub({ data: { id: 's2', discipline: 'strength', date: '2026-07-28', session_type: 'Gym A', program_variant: null, program_week: null, duration_minutes: 10, body_weight: null, notes: null }, error: null }))
      .mockReturnValueOnce(stub({ data: [
        { weight: null, reps: null, rpe: null, is_warmup: false, order_index: 0, set_number: 1, duration_seconds: 45, exercises: { name: 'Plank' } },
      ], error: null }))
    const { result } = renderHook(() => useSessionDetail('s2'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const d = result.current.data as { kind: string; exercises: { sets: { durationSeconds: number | null }[] }[] }
    expect(d.exercises[0].sets[0].durationSeconds).toBe(45)
  })

  it('shapes a cardio session with pace', async () => {
    from
      .mockReturnValueOnce(stub({ data: { id: 'c1', discipline: 'cardio', date: '2026-07-21', session_type: null, program_variant: null, program_week: null, duration_minutes: 30, body_weight: null, notes: null }, error: null }))
      .mockReturnValueOnce(stub({ data: { activity: 'Run', distance_km: 5, duration_minutes: 30, notes: null }, error: null }))
    const { result } = renderHook(() => useSessionDetail('c1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const d = result.current.data as { kind: string; activity: string; pace: string | null }
    expect(d.kind).toBe('cardio')
    expect(d.activity).toBe('Run')
    expect(d.pace).toBe('6:00')
  })

  it('shapes a climbing session highest-first', async () => {
    from
      .mockReturnValueOnce(stub({ data: { id: 'k1', discipline: 'climbing', date: '2026-07-22', session_type: null, program_variant: null, program_week: null, duration_minutes: null, body_weight: null, notes: null }, error: null }))
      .mockReturnValueOnce(stub({ data: [{ grade: 'V2', count: 1 }, { grade: 'V4', count: 3 }], error: null }))
    const { result } = renderHook(() => useSessionDetail('k1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const d = result.current.data as { kind: string; sends: { grade: string }[]; totalSends: number }
    expect(d.kind).toBe('climbing')
    expect(d.sends.map(s => s.grade)).toEqual(['V4', 'V2'])
    expect(d.totalSends).toBe(4)
  })
})
