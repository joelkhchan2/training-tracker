import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useLogClimbing } from './logClimbing'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ getSupabase: () => ({ rpc }) }))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useLogClimbing', () => {
  beforeEach(() => rpc.mockReset())

  it('maps the RPC jsonb result to camelCase', async () => {
    rpc.mockResolvedValue({ data: { session_id: 'sess-1', new_max_grade: 6, previous_max_grade: 5 }, error: null })
    const { result } = renderHook(() => useLogClimbing(), { wrapper })
    const res = await result.current.mutateAsync({
      clientId: 'c1', date: '2026-07-23', notes: null, sends: [{ grade: 'V6', count: 1 }],
    })
    expect(res).toEqual({ sessionId: 'sess-1', newMaxGrade: 6, previousMaxGrade: 5 })
    expect(rpc).toHaveBeenCalledWith('log_climbing', {
      p_client_id: 'c1', p_date: '2026-07-23', p_notes: null, p_sends: [{ grade: 'V6', count: 1 }],
    })
  })

  it('throws when the RPC returns an error', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('boom') })
    const { result } = renderHook(() => useLogClimbing(), { wrapper })
    await expect(result.current.mutateAsync({
      clientId: 'c1', date: '2026-07-23', notes: null, sends: [{ grade: 'V6', count: 1 }],
    })).rejects.toThrow('boom')
  })
})
