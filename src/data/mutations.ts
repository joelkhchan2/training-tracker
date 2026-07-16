import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Cursor, Discipline, Program } from '../domain'
import { advanceCursor } from '../domain'
import { getSupabase } from './supabase'
import type { StrengthSetRow } from './types'

/** Shape of `p_session` passed to the `log_workout` RPC. `user_id`/`id`/timestamps are
 *  server-assigned; the client only supplies what it knows about the workout. */
export interface WorkoutSessionInput {
  discipline: Discipline
  session_type?: string | null
  date?: string
  start_time?: string
  end_time?: string | null
  duration_minutes?: number | null
  body_weight?: number | null
  program_variant?: string | null
  program_week?: number | null
  notes?: string | null
  status?: 'active' | 'completed'
}

/** Shape of one element of `p_sets` passed to the `log_workout` RPC. */
export type WorkoutSetInput = Pick<StrengthSetRow, 'exercise_id' | 'set_number'> &
  Partial<Pick<StrengthSetRow, 'weight' | 'reps' | 'rpe' | 'is_warmup' | 'order_index'>>

export interface SavePlan {
  nextCursor: Cursor
  cycleComplete: boolean
  lastAdvanceKey: string
}

/** Pure cursor-advance + program_state payload shaping, split out of the mutation so it's
 *  testable without a mocked Supabase client. */
export function buildSavePlan(program: Program, cursor: Cursor): SavePlan {
  const { cursor: nextCursor, cycleComplete } = advanceCursor(program, cursor)
  const lastAdvanceKey = `${nextCursor.cycle}-${nextCursor.week}-${nextCursor.dayIndex}`
  return { nextCursor, cycleComplete, lastAdvanceKey }
}

export interface SaveWorkoutInput {
  clientId: string
  session: WorkoutSessionInput
  sets: WorkoutSetInput[]
  program: Program
  cursor: Cursor
}

export interface SaveWorkoutResult {
  sessionId: string
  cycleComplete: boolean
  nextCursor: Cursor
}

/** Saves a strength session and advances the user's program cursor via the atomic
 *  `log_workout` RPC (the RPC applies both under a single transaction — see
 *  0005_log_workout_advance.sql), then invalidates `['activeWorkout']` so the next
 *  screen reflects it. */
export function useSaveWorkout() {
  const queryClient = useQueryClient()

  return useMutation<SaveWorkoutResult, Error, SaveWorkoutInput>({
    mutationFn: async ({ clientId, session, sets, program, cursor }) => {
      const supabase = getSupabase()

      const { nextCursor, cycleComplete, lastAdvanceKey } = buildSavePlan(program, cursor)

      const { data: sessionId, error: rpcError } = await supabase.rpc('log_workout', {
        p_client_id: clientId,
        p_session: session,
        p_sets: sets,
        p_next_cursor: nextCursor,
        p_last_advance_key: lastAdvanceKey,
      })
      if (rpcError) throw rpcError

      return { sessionId: sessionId as string, cycleComplete, nextCursor }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeWorkout'] })
    },
  })
}
