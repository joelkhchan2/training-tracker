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
    expect(update).toHaveBeenCalledWith({ cursor: { dayIndex: 1, week: 1, cycle: 1 } })
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
  })
})

describe('useSetCursorDay', () => {
  it('writes only the dayIndex, preserving week and cycle', async () => {
    const { result } = renderHook(() => useSetCursorDay(), { wrapper })
    await result.current.mutateAsync({ cursor: { dayIndex: 0, week: 3, cycle: 2 }, dayIndex: 1 })
    expect(update).toHaveBeenCalledWith({ cursor: { dayIndex: 1, week: 3, cycle: 2 } })
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
  })
})
