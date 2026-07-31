import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useAdvanceCursor, useSetCursorDay } from './cursorActions'
import type { Program } from '../domain'

const { update, eq, getUser } = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn(), getUser: vi.fn() }))
vi.mock('./supabase', () => ({
  getSupabase: () => ({
    auth: { getUser },
    from: () => ({ update }),
  }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

const program: Program = {
  name: 'Mixed', discipline: 'mixed',
  days: [
    { name: 'A', discipline: 'strength', exercises: [] },
    { name: 'B', discipline: 'climbing', exercises: [] },
  ],
}

beforeEach(() => {
  update.mockReset(); eq.mockReset(); getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  eq.mockResolvedValue({ error: null })
  update.mockReturnValue({ eq })
})

describe('useAdvanceCursor', () => {
  it('writes the advanced cursor for the current user', async () => {
    const { result } = renderHook(() => useAdvanceCursor(), { wrapper })
    await result.current.mutateAsync({ program, cursor: { dayIndex: 0, week: 1, cycle: 1 } })
    expect(update).toHaveBeenCalledWith({ cursor: { dayIndex: 1, week: 1, cycle: 1 }, last_advance_key: null })
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  // Regression: log_climbing/log_cardio gate their RPC advance on `last_advance_key is
  // distinct from p_last_advance_key`, a pure function of destination position. A stale
  // key left behind by a manual cursor write would collide with a later logged advance
  // to the same position and silently skip it — so every manual write must clear it.
  it('clears last_advance_key so a later logged advance is never gated by a stale key', async () => {
    const { result } = renderHook(() => useAdvanceCursor(), { wrapper })
    await result.current.mutateAsync({ program, cursor: { dayIndex: 0, week: 1, cycle: 1 } })
    const payload = update.mock.calls[0][0]
    expect(payload).toHaveProperty('last_advance_key', null)
  })
})

describe('useSetCursorDay', () => {
  it('writes only the dayIndex, preserving week and cycle', async () => {
    const { result } = renderHook(() => useSetCursorDay(), { wrapper })
    await result.current.mutateAsync({ cursor: { dayIndex: 0, week: 3, cycle: 2 }, dayIndex: 1 })
    expect(update).toHaveBeenCalledWith({ cursor: { dayIndex: 1, week: 3, cycle: 2 }, last_advance_key: null })
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  // Regression: picking a day can move the cursor backward onto a position whose
  // last_advance_key was already stored by an earlier logged day (e.g. redo day 0 after
  // having logged it and advanced to day 1). Without clearing the key here, the next
  // logged save at that position would compute the same destination key, find it NOT
  // distinct from the stored one, and the RPC would skip advancing the cursor even
  // though the session was logged.
  it('clears last_advance_key so redoing a previously-logged day does not collide with a later advance', async () => {
    const { result } = renderHook(() => useSetCursorDay(), { wrapper })
    await result.current.mutateAsync({ cursor: { dayIndex: 1, week: 1, cycle: 1 }, dayIndex: 0 })
    const payload = update.mock.calls[0][0]
    expect(payload).toHaveProperty('last_advance_key', null)
  })
})
