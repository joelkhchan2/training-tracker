import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Cursor, Discipline, LinearProgressionAction, Program, Scheme } from '../domain'
import { advanceCursor, applyLinearProgression } from '../domain'
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
  Partial<Pick<StrengthSetRow, 'weight' | 'reps' | 'rpe' | 'is_warmup' | 'order_index'>> & {
    /** Original index into the exercise's `scheme.sets` (see sessionStore `SessionSet.prescriptionIndex`).
     *  Not persisted — the RPC ignores unknown keys — used only to match logged sets to prescribed
     *  sets by a stable key. Null/undefined for user-added extra sets. */
    prescription_index?: number | null
  }

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

/** Working-weight state keyed the same way `getPrescription`'s `workingWeights` arg and
 *  `queries.ts`'s `ActiveWorkoutBundle.workingWeights` are (`tmKey ?? exerciseName`). */
export type WorkingWeights = Record<string, { weight: number; fails: number }>

/** The subset of a program exercise `buildProgressionUpdates` needs: enough to find its
 *  logged sets (`exerciseId`), look up its working weight (`tmKey`/`exerciseName`), read
 *  its prescribed reps/AMRAP target off `scheme`, and apply the `linear` scheme's
 *  `progression` config. Exercises with a non-linear scheme are skipped — they
 *  contribute nothing to `p_progress`. */
export interface ProgressionExerciseInput {
  exerciseId: string
  exerciseName: string
  tmKey?: string
  scheme: Scheme
}

/** One element of the `p_progress` array passed to the `log_workout` RPC. */
export interface ProgressUpdate {
  program_id: string
  exercise_id: string
  current_weight: number
  consecutive_fails: number
}

/** Human-readable summary of what `applyLinearProgression` decided for one exercise,
 *  for the post-save summary screen (Task 5) to display. */
export interface ProgressionOutcomeSummary {
  exerciseName: string
  action: LinearProgressionAction
  nextWeight: number
}

export interface ProgressionPlan {
  updates: ProgressUpdate[]
  outcomes: ProgressionOutcomeSummary[]
}

/**
 * Pure progression-plan building, split out of the mutation so it's testable without a
 * mocked Supabase client. For each `linear`-scheme exercise: matches its logged sets (by
 * the stable `prescription_index` captured at prescription time, not by `set_number` —
 * which is just the recomputed array position at save time and shifts when a set is
 * added/removed mid-session) to find whether every non-AMRAP
 * prescribed set met its reps (`allWorkingSetsMet`) and what the AMRAP set's logged reps
 * were (`amrapReps`, against `targetReps`), then feeds that plus the exercise's current
 * working weight/fails into `applyLinearProgression` using the scheme's `progression` config.
 *
 * Exercises with a non-linear scheme, or no logged sets at all (not part of this session),
 * are skipped entirely — they contribute nothing to `updates`.
 */
export function buildProgressionUpdates(
  programId: string,
  exercises: ProgressionExerciseInput[],
  loggedSets: WorkoutSetInput[],
  workingWeights: WorkingWeights,
): ProgressionPlan {
  const updates: ProgressUpdate[] = []
  const outcomes: ProgressionOutcomeSummary[] = []

  for (const ex of exercises) {
    if (ex.scheme.type !== 'linear') continue

    const setsForExercise = loggedSets.filter(s => s.exercise_id === ex.exerciseId)
    if (setsForExercise.length === 0) continue

    // Match prescribed sets to logged sets by the stable prescription index, not by
    // set_number: set_number is the recomputed array position at save time, which shifts
    // when a set is added/removed mid-session and would misidentify the AMRAP set.
    const byPrescriptionIndex = new Map(
      setsForExercise
        .filter(s => s.prescription_index != null)
        .map(s => [s.prescription_index as number, s]),
    )

    let allWorkingSetsMet = true
    let amrapReps = 0
    let targetReps = 0

    ex.scheme.sets.forEach((prescribed, i) => {
      const logged = byPrescriptionIndex.get(i)
      if (prescribed.amrap) {
        amrapReps = logged?.reps ?? 0
        targetReps = prescribed.targetReps ?? prescribed.reps
      } else if ((logged?.reps ?? 0) < prescribed.reps) {
        allWorkingSetsMet = false
      }
    })

    const key = ex.tmKey ?? ex.exerciseName
    const current = workingWeights[key] ?? { weight: 0, fails: 0 }

    const outcome = applyLinearProgression(ex.scheme.progression, {
      currentWeight: current.weight,
      fails: current.fails,
      allWorkingSetsMet,
      amrapReps,
      targetReps,
    })

    updates.push({
      program_id: programId,
      exercise_id: ex.exerciseId,
      current_weight: outcome.nextWeight,
      consecutive_fails: outcome.nextFails,
    })
    outcomes.push({
      exerciseName: ex.exerciseName,
      action: outcome.action,
      nextWeight: outcome.nextWeight,
    })
  }

  return { updates, outcomes }
}

export interface SaveWorkoutInput {
  clientId: string
  session: WorkoutSessionInput
  sets: WorkoutSetInput[]
  /** Sets to consider for linear-progression matching — defaults to `sets`. WorkoutPage passes
   *  a prescribed-only subset (excludes adhoc/added exercises) so an added exercise whose
   *  exercise_id coincidentally matches a programmed linear lift can't trigger a spurious deload. */
  progressionSets?: WorkoutSetInput[]
  program: Program
  cursor: Cursor
  /** Needed to build `p_progress` rows; omit (along with `progressionExercises` /
   *  `workingWeights`) when the session has no linear-progression exercises to update. */
  programId?: string
  progressionExercises?: ProgressionExerciseInput[]
  workingWeights?: WorkingWeights
}

export interface SaveWorkoutResult {
  sessionId: string
  cycleComplete: boolean
  nextCursor: Cursor
  progressionOutcomes: ProgressionOutcomeSummary[]
}

/** Saves a strength session and advances the user's program cursor via the atomic
 *  `log_workout` RPC (the RPC applies both under a single transaction — see
 *  0005_log_workout_advance.sql), then invalidates `['activeWorkout']` so the next
 *  screen reflects it. */
export function useSaveWorkout() {
  const queryClient = useQueryClient()

  return useMutation<SaveWorkoutResult, Error, SaveWorkoutInput>({
    mutationFn: async ({ clientId, session, sets, progressionSets, program, cursor, programId, progressionExercises, workingWeights }) => {
      const supabase = getSupabase()

      const { nextCursor, cycleComplete, lastAdvanceKey } = buildSavePlan(program, cursor)

      const { updates, outcomes } = programId && progressionExercises && workingWeights
        ? buildProgressionUpdates(programId, progressionExercises, progressionSets ?? sets, workingWeights)
        : { updates: [] as ProgressUpdate[], outcomes: [] as ProgressionOutcomeSummary[] }

      const rpcParams: Record<string, unknown> = {
        p_client_id: clientId,
        p_session: session,
        p_sets: sets,
        p_next_cursor: nextCursor,
        p_last_advance_key: lastAdvanceKey,
      }
      if (updates.length > 0) rpcParams.p_progress = updates

      const { data: sessionId, error: rpcError } = await supabase.rpc('log_workout', rpcParams)
      if (rpcError) throw rpcError

      return { sessionId: sessionId as string, cycleComplete, nextCursor, progressionOutcomes: outcomes }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeWorkout'] })
    },
  })
}
