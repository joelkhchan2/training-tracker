import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateTrainingMaxes } from './trainingMaxes'

const { upsert, getUser } = vi.hoisted(() => ({
  upsert: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('./supabase', () => ({
  getSupabase: () => ({
    auth: { getUser },
    from: () => ({ upsert }),
  }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient()
  return createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useUpdateTrainingMaxes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsert.mockResolvedValue({ error: null })
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  })

  it('upserts one row per edit with user_id, key, value and prev_value', async () => {
    const { result } = renderHook(() => useUpdateTrainingMaxes(), { wrapper })

    await act(async () => {
      result.current.mutate({
        updates: [
          { key: 'squat', value: 260, prevValue: 250 },
          { key: 'benchPress', value: 165, prevValue: null },
        ],
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(upsert).toHaveBeenCalledWith(
      [
        { user_id: 'user-1', key: 'squat', value: 260, prev_value: 250 },
        { user_id: 'user-1', key: 'benchPress', value: 165, prev_value: null },
      ],
      { onConflict: 'user_id,key' },
    )
  })

  it('does not touch the database when there are no updates', async () => {
    const { result } = renderHook(() => useUpdateTrainingMaxes(), { wrapper })

    await act(async () => {
      result.current.mutate({ updates: [] })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(upsert).not.toHaveBeenCalled()
  })

  it('surfaces an upsert error', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'nope' } })
    const { result } = renderHook(() => useUpdateTrainingMaxes(), { wrapper })

    await act(async () => {
      result.current.mutate({ updates: [{ key: 'squat', value: 260, prevValue: 250 }] })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
