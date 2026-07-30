import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useLogCardio } from './logCardio'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ getSupabase: () => ({ rpc }) }))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useLogCardio', () => {
  beforeEach(() => rpc.mockReset())

  it('calls log_cardio with the base params and returns the session id (ad-hoc)', async () => {
    rpc.mockResolvedValue({ data: 'sess-1', error: null })
    const { result } = renderHook(() => useLogCardio(), { wrapper })
    const id = await result.current.mutateAsync({
      clientId: 'c1', date: '2026-07-30', activity: 'Run', durationMinutes: 30, distanceKm: 5, notes: null,
    })
    expect(id).toBe('sess-1')
    expect(rpc).toHaveBeenCalledWith('log_cardio', {
      p_client_id: 'c1', p_date: '2026-07-30', p_activity: 'Run',
      p_duration_minutes: 30, p_distance_km: 5, p_notes: null,
    })
  })

  it('passes cursor advance params when nextCursor is provided', async () => {
    rpc.mockResolvedValue({ data: 'sess-2', error: null })
    const { result } = renderHook(() => useLogCardio(), { wrapper })
    await result.current.mutateAsync({
      clientId: 'c2', date: '2026-07-30', activity: 'Run', durationMinutes: 30, distanceKm: 5, notes: null,
      nextCursor: { dayIndex: 2, week: 1, cycle: 1 }, lastAdvanceKey: '1-1-2',
    })
    expect(rpc).toHaveBeenCalledWith('log_cardio', {
      p_client_id: 'c2', p_date: '2026-07-30', p_activity: 'Run',
      p_duration_minutes: 30, p_distance_km: 5, p_notes: null,
      p_next_cursor: { dayIndex: 2, week: 1, cycle: 1 }, p_last_advance_key: '1-1-2',
    })
  })

  it('throws when the RPC returns an error', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('boom') })
    const { result } = renderHook(() => useLogCardio(), { wrapper })
    await expect(result.current.mutateAsync({
      clientId: 'c3', date: '2026-07-30', activity: 'Run', durationMinutes: 30, distanceKm: 5, notes: null,
    })).rejects.toThrow('boom')
  })
})
