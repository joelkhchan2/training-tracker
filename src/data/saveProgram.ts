import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Cursor, Scheme } from '../domain'
import type { ProgramDraft } from '../domain/programDraft'
import { draftToProgram } from '../domain/programDraft'
import { getSupabase } from './supabase'
import { resolveDraftExerciseIds } from './resolveDraftExercises'

export interface ProgramRowIds {
  programId: string
  /** One id per `draft.days` entry, same order. */
  dayIds: string[]
}

export interface ProgramRows {
  program: { id: string; name: string; description: string; discipline: 'strength'; is_public: boolean }
  days: { id: string; program_id: string; name: string; order_index: number }[]
  exercises: {
    program_day_id: string
    exercise_id: string
    role_key: null
    order_index: number
    scheme: Scheme
    exercise_name: string
    exercise_type: string
  }[]
}

/**
 * Pure payload-building for the Custom Program Builder's save flow: draft +
 * resolved exercise ids + generated ids -> the row objects to insert, with
 * every FK already wired up. No I/O, so it's unit-testable without a
 * Supabase client (mutations land in Task 5).
 *
 * Reuses `draftToProgram` to compute each exercise's fixed `scheme` (and its
 * bodyweight-omits-`weight` behavior) rather than re-deriving it, so this
 * stays byte-for-byte consistent with the domain's own draft -> Program
 * mapping.
 */
export function buildProgramRows(
  draft: ProgramDraft,
  exerciseIdByName: Record<string, string>,
  ids: ProgramRowIds,
): ProgramRows {
  const { programId, dayIds } = ids
  const program = draftToProgram(draft)

  return {
    program: {
      id: programId,
      name: draft.name,
      description: draft.description,
      discipline: 'strength',
      is_public: draft.isPublic,
    },
    days: program.days.map((day, i) => ({
      id: dayIds[i],
      program_id: programId,
      name: day.name,
      order_index: i,
    })),
    exercises: program.days.flatMap((day, dayIdx) =>
      day.exercises.map((ex, exerciseIdx) => ({
        program_day_id: dayIds[dayIdx],
        exercise_id: exerciseIdByName[ex.exerciseName],
        role_key: null,
        order_index: exerciseIdx,
        scheme: ex.scheme,
        exercise_name: ex.exerciseName,
        exercise_type: draft.days[dayIdx].exercises[exerciseIdx].kind === 'bodyweight' ? 'bodyweight' : 'weighted',
      })),
    ),
  }
}

// ----- useSaveProgram / useUpdateProgram / useDeleteProgram mutations -----
//
// All three run as `auth.uid()` (no service role), mirroring `activateProgram.ts`'s
// mutation structure: resolve exercise names to ids, generate ids client-side with
// `crypto.randomUUID()`, then write in FK-safe order. None of them own
// `program_state` the way `useActivateProgram` does on activation — `useSaveProgram`
// never touches it (a freshly-saved program isn't active yet), and `useUpdateProgram`
// only touches it to clamp an *already-active* program's cursor after a day count
// shrinks.
//
// Each mutation needs the authenticated user's id both inside `mutationFn` (to scope
// writes) and again in `onSuccess` (to build the `['publicPrograms', userId]` key) —
// `onSuccess` only receives the mutation's own return value and its input variables,
// neither of which carries the id, so it's captured in this `let` closed over by both
// callbacks. Safe here because each `useXProgram()` call gets its own closure and this
// app has no concurrent overlapping calls to the same mutation instance (consistent
// with the other accepted non-transactional risk notes in this data layer).

export interface SaveProgramInput {
  draft: ProgramDraft
}

/** `mutationFn`'s internal result: the resolved `auth.uid()` rides along so `onSuccess`
 *  can build the `['publicPrograms', userId]` key without a second auth round-trip or a
 *  render-scoped `let` (the newer `react-hooks/immutability` lint rule forbids
 *  reassigning a variable closed over by an async function). The public `data` the hook
 *  exposes is narrowed back down to just the id, per "returns the new program id". */
interface SaveProgramResult {
  programId: string
  userId: string
}

/**
 * Saves a new authored program as the current user's own row: resolve exercise
 * names, generate ids client-side, then insert in FK order (programs -> program_days
 * -> program_exercises). Does not touch `program_state` — the new program isn't
 * activated by saving it. Returns the new program id.
 */
export function useSaveProgram() {
  const queryClient = useQueryClient()

  const mutation = useMutation<SaveProgramResult, Error, SaveProgramInput>({
    mutationFn: async ({ draft }) => {
      const supabase = getSupabase()

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const userId = userData?.user?.id
      if (!userId) throw new Error('Not authenticated')

      const exerciseIdByName = await resolveDraftExerciseIds(draft, userId)

      const programId = crypto.randomUUID()
      const dayIds = draft.days.map(() => crypto.randomUUID())

      const rows = buildProgramRows(draft, exerciseIdByName, { programId, dayIds })

      const { error: programError } = await supabase
        .from('programs')
        .insert({ ...rows.program, user_id: userId })
      if (programError) throw programError

      if (rows.days.length > 0) {
        const { error: daysError } = await supabase.from('program_days').insert(rows.days)
        if (daysError) throw daysError
      }

      if (rows.exercises.length > 0) {
        const { error: exercisesError } = await supabase.from('program_exercises').insert(rows.exercises)
        if (exercisesError) throw exercisesError
      }

      return { programId, userId }
    },
    onSuccess: ({ userId }) => {
      queryClient.invalidateQueries({ queryKey: ['publicPrograms', userId] })
    },
  })

  return { ...mutation, data: mutation.data?.programId }
}

export interface UpdateProgramInput {
  programId: string
  draft: ProgramDraft
}

/**
 * Rebuilds an existing program's day/exercise tree from an edited draft, and clamps
 * the active cursor if this program is currently active and its day count shrank.
 *
 * Ordering is deliberate (spec-review fix, see the Task 5 brief's accepted-risk
 * note): the OLD day ids are captured first (so they can be targeted precisely once
 * the new rows share the same `program_id`), then the NEW `program_days` /
 * `program_exercises` rows are inserted, and only then are the OLD day rows deleted
 * (cascading to their exercises). If a write fails partway through, the old tree is
 * still intact — an active program is never left with zero days, which would make
 * `getPrescription` return `[]` and blank the Home screen. This is not transactional
 * (no RPC, consistent with `activateProgram.ts`'s direct-insert path); acceptable for
 * a solo-author app that controls its own edit timing.
 */
export function useUpdateProgram() {
  const queryClient = useQueryClient()

  return useMutation<{ userId: string }, Error, UpdateProgramInput>({
    mutationFn: async ({ programId, draft }) => {
      const supabase = getSupabase()

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const userId = userData?.user?.id
      if (!userId) throw new Error('Not authenticated')

      const exerciseIdByName = await resolveDraftExerciseIds(draft, userId)

      const dayIds = draft.days.map(() => crypto.randomUUID())
      const rows = buildProgramRows(draft, exerciseIdByName, { programId, dayIds })

      // Capture the OLD day ids before inserting the NEW ones — both share this
      // program's id, so this is the only point at which they can be told apart.
      const { data: oldDaysData, error: oldDaysError } = await supabase
        .from('program_days')
        .select('id')
        .eq('program_id', programId)
      if (oldDaysError) throw oldDaysError
      const oldDayIds = ((oldDaysData ?? []) as { id: string }[]).map(d => d.id)

      const { error: programError } = await supabase
        .from('programs')
        .update({ name: rows.program.name, description: rows.program.description, is_public: rows.program.is_public })
        .eq('id', programId)
      if (programError) throw programError

      if (rows.days.length > 0) {
        const { error: daysError } = await supabase.from('program_days').insert(rows.days)
        if (daysError) throw daysError
      }

      if (rows.exercises.length > 0) {
        const { error: exercisesError } = await supabase.from('program_exercises').insert(rows.exercises)
        if (exercisesError) throw exercisesError
      }

      // Clamp the active cursor (if this program is the active one) before deleting
      // the old days, per the ordering above.
      const { data: stateData, error: stateError } = await supabase
        .from('program_state')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (stateError) throw stateError
      const stateRow = stateData as { active_program_id: string | null; cursor: Cursor } | null

      if (stateRow && stateRow.active_program_id === programId) {
        const maxIndex = Math.max(0, rows.days.length - 1)
        if (stateRow.cursor.dayIndex > maxIndex) {
          const clampedCursor: Cursor = { ...stateRow.cursor, dayIndex: maxIndex }
          const { error: clampError } = await supabase
            .from('program_state')
            .update({ cursor: clampedCursor })
            .eq('user_id', userId)
          if (clampError) throw clampError
        }
      }

      if (oldDayIds.length > 0) {
        const { error: deleteError } = await supabase.from('program_days').delete().in('id', oldDayIds)
        if (deleteError) throw deleteError
      }

      return { userId }
    },
    onSuccess: ({ userId }) => {
      queryClient.invalidateQueries({ queryKey: ['activeWorkout'] })
      queryClient.invalidateQueries({ queryKey: ['publicPrograms', userId] })
    },
  })
}

export interface DeleteProgramInput {
  programId: string
}

/**
 * Deletes an authored program. `program_days`/`program_exercises` cascade via their
 * own FKs, and `program_state.active_program_id` is `ON DELETE SET NULL` (see
 * 0002_reference_and_programs.sql), so deleting an active program safely clears it
 * rather than leaving a dangling reference.
 */
export function useDeleteProgram() {
  const queryClient = useQueryClient()

  return useMutation<{ userId: string }, Error, DeleteProgramInput>({
    mutationFn: async ({ programId }) => {
      const supabase = getSupabase()

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const userId = userData?.user?.id
      if (!userId) throw new Error('Not authenticated')

      const { error: deleteError } = await supabase.from('programs').delete().eq('id', programId)
      if (deleteError) throw deleteError

      return { userId }
    },
    onSuccess: ({ userId }) => {
      queryClient.invalidateQueries({ queryKey: ['publicPrograms', userId] })
      queryClient.invalidateQueries({ queryKey: ['activeWorkout'] })
    },
  })
}
