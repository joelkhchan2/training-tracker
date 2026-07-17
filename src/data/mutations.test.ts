import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LinearProgressionConfig, Program } from '../domain'
import { buildProgressionUpdates, buildSavePlan, useSaveWorkout } from './mutations'
import type { ProgressionExerciseInput, WorkingWeights } from './mutations'

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
      progressionOutcomes: [],
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

// Squat: 3x5, last set AMRAP with target 5 — matches the Basic Beginner / StrongLifts-style
// linear progressions applyLinearProgression already covers.
const SQUAT_LINEAR_CONFIG: LinearProgressionConfig = { increment: 5, failsBeforeDeload: 3, deloadPercent: 0.1 }
const squatExercise: ProgressionExerciseInput = {
  exerciseId: 'ex-squat',
  exerciseName: 'Squat',
  tmKey: 'squat',
  scheme: { type: 'linear', sets: [{ reps: 5 }, { reps: 5 }, { reps: 5, amrap: true, targetReps: 5 }] },
  progression: SQUAT_LINEAR_CONFIG,
}
// Same session's other exercise: a percentage scheme, which never contributes to p_progress.
const benchPercentageExercise: ProgressionExerciseInput = {
  exerciseId: 'ex-bench',
  exerciseName: 'Bench Press',
  tmKey: 'benchPress',
  scheme: { type: 'percentage', tmKey: 'benchPress', weeks: [{ sets: [{ pct: 0.65, reps: 5 }, { pct: 0.75, reps: 3 }, { pct: 0.85, reps: 1 }] }] },
}
const squatWorkingWeights: WorkingWeights = { squat: { weight: 100, fails: 0 } }

describe('buildProgressionUpdates', () => {
  it('all sets (incl. AMRAP) met: increases the working weight and resets fails', () => {
    const loggedSets = [
      { exercise_id: 'ex-squat', set_number: 1, reps: 5 },
      { exercise_id: 'ex-squat', set_number: 2, reps: 5 },
      { exercise_id: 'ex-squat', set_number: 3, reps: 5 },
    ]

    const plan = buildProgressionUpdates('prog-1', [squatExercise], loggedSets, squatWorkingWeights)

    expect(plan.updates).toEqual([
      { program_id: 'prog-1', exercise_id: 'ex-squat', current_weight: 105, consecutive_fails: 0 },
    ])
    expect(plan.outcomes).toEqual([
      { exerciseName: 'Squat', action: 'increase', nextWeight: 105 },
    ])
  })

  it('AMRAP set missed its target: holds the weight and increments fails', () => {
    const loggedSets = [
      { exercise_id: 'ex-squat', set_number: 1, reps: 5 },
      { exercise_id: 'ex-squat', set_number: 2, reps: 5 },
      { exercise_id: 'ex-squat', set_number: 3, reps: 3 },
    ]

    const plan = buildProgressionUpdates('prog-1', [squatExercise], loggedSets, squatWorkingWeights)

    expect(plan.updates).toEqual([
      { program_id: 'prog-1', exercise_id: 'ex-squat', current_weight: 100, consecutive_fails: 1 },
    ])
    expect(plan.outcomes).toEqual([
      { exerciseName: 'Squat', action: 'hold', nextWeight: 100 },
    ])
  })

  it('a percentage-scheme exercise in the same session contributes no progress update', () => {
    const loggedSets = [
      { exercise_id: 'ex-squat', set_number: 1, reps: 5 },
      { exercise_id: 'ex-squat', set_number: 2, reps: 5 },
      { exercise_id: 'ex-squat', set_number: 3, reps: 5 },
      { exercise_id: 'ex-bench', set_number: 1, reps: 5 },
      { exercise_id: 'ex-bench', set_number: 2, reps: 3 },
      { exercise_id: 'ex-bench', set_number: 3, reps: 1 },
    ]

    const plan = buildProgressionUpdates(
      'prog-1',
      [squatExercise, benchPercentageExercise],
      loggedSets,
      squatWorkingWeights,
    )

    expect(plan.updates).toEqual([
      { program_id: 'prog-1', exercise_id: 'ex-squat', current_weight: 105, consecutive_fails: 0 },
    ])
    expect(plan.updates.some(u => u.exercise_id === 'ex-bench')).toBe(false)
  })

  it('skips a linear exercise with no progression config', () => {
    const noConfigExercise: ProgressionExerciseInput = { ...squatExercise, progression: undefined }
    const loggedSets = [{ exercise_id: 'ex-squat', set_number: 3, reps: 5 }]

    expect(buildProgressionUpdates('prog-1', [noConfigExercise], loggedSets, squatWorkingWeights)).toEqual({
      updates: [], outcomes: [],
    })
  })

  it('skips an exercise with no logged sets in this session', () => {
    expect(buildProgressionUpdates('prog-1', [squatExercise], [], squatWorkingWeights)).toEqual({
      updates: [], outcomes: [],
    })
  })
})

describe('useSaveWorkout progression wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpc.mockResolvedValue({ data: 'session-456', error: null })
  })

  it('passes a correctly-shaped p_progress to the log_workout RPC when progression inputs are given', async () => {
    const { result } = renderHook(() => useSaveWorkout(), { wrapper })

    const session = { discipline: 'strength' as const, status: 'active' as const }
    const sets = [
      { exercise_id: 'ex-squat', set_number: 1, weight: 100, reps: 5 },
      { exercise_id: 'ex-squat', set_number: 2, weight: 100, reps: 5 },
      { exercise_id: 'ex-squat', set_number: 3, weight: 100, reps: 5 },
    ]

    await act(async () => {
      result.current.mutate({
        clientId: 'client-lp',
        session,
        sets,
        program: TWO_DAY_PROGRAM,
        cursor: { dayIndex: 0, week: 1, cycle: 1 },
        programId: 'prog-1',
        progressionExercises: [squatExercise],
        workingWeights: squatWorkingWeights,
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(rpc).toHaveBeenCalledWith('log_workout', {
      p_client_id: 'client-lp',
      p_session: session,
      p_sets: sets,
      p_next_cursor: { dayIndex: 1, week: 1, cycle: 1 },
      p_last_advance_key: '1-1-1',
      p_progress: [
        { program_id: 'prog-1', exercise_id: 'ex-squat', current_weight: 105, consecutive_fails: 0 },
      ],
    })
    expect(result.current.data?.progressionOutcomes).toEqual([
      { exerciseName: 'Squat', action: 'increase', nextWeight: 105 },
    ])
  })

  it('omits p_progress (letting the RPC default to null) when there is nothing to update', async () => {
    const { result } = renderHook(() => useSaveWorkout(), { wrapper })

    await act(async () => {
      result.current.mutate({
        clientId: 'client-no-lp',
        session: { discipline: 'strength' as const },
        sets: [],
        program: TWO_DAY_PROGRAM,
        cursor: { dayIndex: 0, week: 1, cycle: 1 },
        programId: 'prog-1',
        progressionExercises: [benchPercentageExercise],
        workingWeights: {},
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [, params] = rpc.mock.calls[0]
    expect(params).not.toHaveProperty('p_progress')
  })
})
