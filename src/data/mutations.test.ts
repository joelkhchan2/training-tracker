import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Program } from '../domain'
import { buildSavePlan, useSaveWorkout } from './mutations'

// Minimal 2-day, 1-week (fixed scheme) program: no percentage scheme, so
// programWeekCount defaults to 1 and cursor math is deterministic.
const TWO_DAY_PROGRAM: Program = {
  name: 'test',
  discipline: 'strength',
  days: [
    { name: 'A', exercises: [{ exerciseName: 'Squat', order: 0, scheme: { type: 'fixed', sets: [{ reps: 5 }] } }] },
    { name: 'B', exercises: [{ exerciseName: 'Bench Press', order: 0, scheme: { type: 'fixed', sets: [{ reps: 5 }] } }] },
  ],
}

describe('buildSavePlan', () => {
  it('advances within the cycle without completing it', () => {
    const plan = buildSavePlan(TWO_DAY_PROGRAM, { dayIndex: 0, week: 1, cycle: 1 })
    expect(plan).toEqual({
      nextCursor: { dayIndex: 1, week: 1, cycle: 1 },
      cycleComplete: false,
      lastAdvanceKey: '1-1-1',
    })
  })

  it('rolls the cycle after the last day of the last week', () => {
    const plan = buildSavePlan(TWO_DAY_PROGRAM, { dayIndex: 1, week: 1, cycle: 1 })
    expect(plan).toEqual({
      nextCursor: { dayIndex: 0, week: 1, cycle: 2 },
      cycleComplete: true,
      lastAdvanceKey: '2-1-0',
    })
  })
})

const { rpc } = vi.hoisted(() => {
  const rpc = vi.fn().mockResolvedValue({ data: 'session-123', error: null })
  return { rpc }
})

vi.mock('./supabase', () => ({
  getSupabase: () => ({ rpc }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient()
  return createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useSaveWorkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpc.mockResolvedValue({ data: 'session-123', error: null })
  })

  it('calls log_workout with the session/sets AND the next-cursor args in one atomic RPC call', async () => {
    const { result } = renderHook(() => useSaveWorkout(), { wrapper })

    const session = { discipline: 'strength' as const, status: 'active' as const }
    const sets = [{ exercise_id: 'ex-1', set_number: 1, weight: 135, reps: 5 }]

    await act(async () => {
      result.current.mutate({
        clientId: 'client-abc',
        session,
        sets,
        program: TWO_DAY_PROGRAM,
        cursor: { dayIndex: 0, week: 1, cycle: 1 },
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('log_workout', {
      p_client_id: 'client-abc',
      p_session: session,
      p_sets: sets,
      p_next_cursor: { dayIndex: 1, week: 1, cycle: 1 },
      p_last_advance_key: '1-1-1',
    })
    expect(result.current.data).toEqual({
      sessionId: 'session-123',
      cycleComplete: false,
      nextCursor: { dayIndex: 1, week: 1, cycle: 1 },
    })
  })

  it('surfaces an rpc error (the cursor never partially advances since it is the same call)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useSaveWorkout(), { wrapper })

    await act(async () => {
      result.current.mutate({
        clientId: 'client-err',
        session: { discipline: 'strength' },
        sets: [],
        program: TWO_DAY_PROGRAM,
        cursor: { dayIndex: 0, week: 1, cycle: 1 },
      })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
