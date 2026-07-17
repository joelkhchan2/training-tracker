import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Cursor, Discipline, ProgressionRule, Scheme } from '../domain'
import type { PresetMeta } from '../domain/presets'
import type { ProgramRowsLike } from '../domain/programDraft'
import { programRowsToDraft } from '../domain/programDraft'
import { getSupabase } from './supabase'
import { resolveExerciseIds } from './resolveExerciseIds'
import { resolveDraftExerciseIds } from './resolveDraftExercises'
import { buildProgramRows } from './saveProgram'
import type { ProgramDayRow, ProgramExerciseRow, ProgramRow } from './types'

/** Row shapes below deliberately omit `user_id` — per the brief, `buildActivationRows`
 *  stays a pure function of (preset, maxes, resolved exercise ids, generated ids); the
 *  mutation fills in `user_id` from the authenticated session right before each insert. */

export interface ProgramInsert {
  id: string
  name: string
  description: string | null
  discipline: Discipline
  progression_rule: ProgressionRule | null
  is_public: false
}

export interface ProgramDayInsert {
  id: string
  program_id: string
  name: string
  order_index: number
}

export interface ProgramExerciseInsert {
  program_day_id: string
  exercise_id: string | null
  role_key: string | null
  order_index: number
  scheme: Scheme
}

export interface TrainingMaxInsert {
  key: string
  value: number
}

export interface ProgramStateInsert {
  active_program_id: string
  cursor: Cursor
  last_advance_key: null
}

export interface ExerciseProgressInsert {
  program_id: string
  exercise_id: string
  current_weight: number
  consecutive_fails: number
}

export interface ActivationRows {
  program: ProgramInsert
  days: ProgramDayInsert[]
  programExercises: ProgramExerciseInsert[]
  trainingMaxes: TrainingMaxInsert[]
  exerciseProgress: ExerciseProgressInsert[]
  programState: ProgramStateInsert
}

export interface ActivationIds {
  programId: string
  /** One id per `preset.program.days` entry, same order. */
  dayIds: string[]
}

/** Pure payload-building: preset + training maxes + resolved exercise ids + generated
 *  ids -> the row objects to insert, with every FK already wired up. No I/O, so it's
 *  unit-testable without a Supabase client. */
export function buildActivationRows(
  preset: PresetMeta,
  trainingMaxes: Record<string, number>,
  exerciseIdByName: Map<string, string>,
  ids: ActivationIds,
  startingWeights: Record<string, number> = {},
): ActivationRows {
  const { programId, dayIds } = ids

  const program: ProgramInsert = {
    id: programId,
    name: preset.program.name,
    description: preset.description,
    discipline: preset.program.discipline,
    progression_rule: preset.program.progressionRule ?? null,
    is_public: false,
  }

  const days: ProgramDayInsert[] = preset.program.days.map((day, i) => ({
    id: dayIds[i],
    program_id: programId,
    name: day.name,
    order_index: i,
  }))

  const programExercises: ProgramExerciseInsert[] = preset.program.days.flatMap((day, i) =>
    day.exercises.map((ex): ProgramExerciseInsert => ({
      program_day_id: dayIds[i],
      exercise_id: exerciseIdByName.get(ex.exerciseName) ?? null,
      role_key: ex.tmKey ?? null,
      order_index: ex.order,
      scheme: ex.scheme,
    })),
  )

  const trainingMaxRows: TrainingMaxInsert[] = preset.tmKeys
    .filter(key => trainingMaxes[key] != null)
    .map(key => ({ key, value: trainingMaxes[key] }))

  // One row per distinct linear-scheme exercise with a supplied starting weight — dedupe
  // by exercise id since the same lift can appear on multiple days, and exercise_progress
  // has a unique (user_id, program_id, exercise_id) constraint.
  const exerciseProgressByExerciseId = new Map<string, ExerciseProgressInsert>()
  for (const day of preset.program.days) {
    for (const exercise of day.exercises) {
      if (exercise.scheme.type !== 'linear') continue
      const weight = startingWeights[exercise.exerciseName]
      if (weight == null) continue
      const exerciseId = exerciseIdByName.get(exercise.exerciseName)
      if (exerciseId == null || exerciseProgressByExerciseId.has(exerciseId)) continue
      exerciseProgressByExerciseId.set(exerciseId, {
        program_id: programId,
        exercise_id: exerciseId,
        current_weight: weight,
        consecutive_fails: 0,
      })
    }
  }
  const exerciseProgress = [...exerciseProgressByExerciseId.values()]

  const programState: ProgramStateInsert = {
    active_program_id: programId,
    cursor: { dayIndex: 0, week: 1, cycle: 1 },
    last_advance_key: null,
  }

  return { program, days, programExercises, trainingMaxes: trainingMaxRows, exerciseProgress, programState }
}

export interface ActivateProgramInput {
  preset: PresetMeta
  trainingMaxes: Record<string, number>
  /** Starting working weight per exercise name, for linear-progression presets
   *  (`preset.requiresStartingWeights`). Seeds `exercise_progress` on activation. */
  startingWeights?: Record<string, number>
}

/**
 * Clones a chosen preset into the current user's own rows — everything runs as
 * `auth.uid()` (no service role): resolve exercise names to ids, then insert in FK
 * order (programs -> program_days -> program_exercises -> exercise_progress), then
 * upsert training_maxes and program_state to point at the new program. Returns the
 * new program id. `exercise_progress` seeds each linear-scheme exercise's starting
 * weight (from `startingWeights`) so AMRAP progression has a working weight to start
 * from; it's a no-op insert for presets with no linear-scheme exercises.
 *
 * Errors from any step are surfaced (via the mutation's error state) rather than
 * swallowed, so a partial failure never reads as success; TanStack Query does not
 * roll back earlier inserts, so a failure partway through can leave orphaned rows
 * scoped to the user's own account — acceptable for this data layer since the
 * caller (the activation screen) will just be shown the error and can retry.
 */
export function useActivateProgram() {
  const queryClient = useQueryClient()

  return useMutation<string, Error, ActivateProgramInput>({
    mutationFn: async ({ preset, trainingMaxes, startingWeights = {} }) => {
      const supabase = getSupabase()

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const userId = userData?.user?.id
      if (!userId) throw new Error('Not authenticated')

      const names = [...new Set(preset.program.days.flatMap(day => day.exercises.map(ex => ex.exerciseName)))]
      const exerciseIdByName = await resolveExerciseIds(names, userId)

      const programId = crypto.randomUUID()
      const dayIds = preset.program.days.map(() => crypto.randomUUID())

      const rows = buildActivationRows(preset, trainingMaxes, exerciseIdByName, { programId, dayIds }, startingWeights)

      const { error: programError } = await supabase
        .from('programs')
        .insert({ ...rows.program, user_id: userId })
      if (programError) throw programError

      if (rows.days.length > 0) {
        const { error: daysError } = await supabase.from('program_days').insert(rows.days)
        if (daysError) throw daysError
      }

      if (rows.programExercises.length > 0) {
        const { error: peError } = await supabase.from('program_exercises').insert(rows.programExercises)
        if (peError) throw peError
      }

      if (rows.exerciseProgress.length > 0) {
        const { error: progressError } = await supabase
          .from('exercise_progress')
          .insert(rows.exerciseProgress.map(ep => ({ ...ep, user_id: userId })))
        if (progressError) throw progressError
      }

      if (rows.trainingMaxes.length > 0) {
        const { error: tmError } = await supabase
          .from('training_maxes')
          .upsert(
            rows.trainingMaxes.map(tm => ({ ...tm, user_id: userId })),
            { onConflict: 'user_id,key' },
          )
        if (tmError) throw tmError
      }

      const { error: stateError } = await supabase
        .from('program_state')
        .upsert({ ...rows.programState, user_id: userId }, { onConflict: 'user_id' })
      if (stateError) throw stateError

      return programId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeWorkout'] })
    },
  })
}

// ----- useActivateDbProgram: activate a program that already lives in `programs` -----
//
// Unlike `useActivateProgram` (which clones a hardcoded `PresetMeta`), this activates a
// DB-authored program by id — either the current user's own (point at it in place) or
// someone else's public one (clone it into the activator's own rows first, then point
// at the clone). Detecting which branch applies is a single fetch of the target
// `programs` row: its `user_id` tells us whether it's ours.

/** Reshapes the flat fetched rows (`programs` + `program_days` + `program_exercises`)
 *  into the nested `ProgramRowsLike` shape `programRowsToDraft` expects — the same
 *  denormalized `exercise_name`/`exercise_type` columns `fetchPublicPrograms` and
 *  `fetchActiveWorkout` already read, just grouped by day instead of flattened. */
function toProgramRowsLike(
  program: ProgramRow,
  days: ProgramDayRow[],
  exercises: ProgramExerciseRow[],
): ProgramRowsLike {
  const exercisesByDay = new Map<string, ProgramExerciseRow[]>()
  for (const ex of exercises) {
    const list = exercisesByDay.get(ex.program_day_id)
    if (list) list.push(ex)
    else exercisesByDay.set(ex.program_day_id, [ex])
  }

  return {
    name: program.name,
    description: program.description,
    is_public: program.is_public,
    days: days.map(day => ({
      name: day.name,
      order_index: day.order_index,
      exercises: (exercisesByDay.get(day.id) ?? []).map(ex => ({
        exercise_name: ex.exercise_name,
        exercise_type: ex.exercise_type,
        role_key: ex.role_key,
        order_index: ex.order_index,
        scheme: ex.scheme,
      })),
    })),
  }
}

function resetCursorState(activeProgramId: string): ProgramStateInsert {
  return {
    active_program_id: activeProgramId,
    cursor: { dayIndex: 0, week: 1, cycle: 1 },
    last_advance_key: null,
  }
}

export interface ActivateDbProgramInput {
  programId: string
}

/**
 * Activates a program that already lives in `programs`, branching on whether the
 * activator (`auth.uid()`) already owns it:
 *
 * - **Own program:** just repoints `program_state` at `programId` with a reset cursor.
 *   No new `programs`/`program_days`/`program_exercises` rows — the activator already
 *   has them.
 * - **Another user's public program:** clones it into the activator's own rows first.
 *   The fetched tree is reshaped into a `ProgramDraft` via `programRowsToDraft` (whose
 *   fixed-scheme guard means a non-fixed source program throws rather than being
 *   silently mangled — v1 only authors/clones fixed-scheme programs), with
 *   `isPublic` forced to `false` regardless of the source's own flag: a clone is a
 *   private snapshot, never re-published on the activator's behalf. Exercise names are
 *   then re-resolved via `resolveDraftExerciseIds` *in the activator's own catalog* —
 *   the clone's `program_exercises` rows point at ids the activator can actually read
 *   under RLS, minting new custom exercises as needed, never reusing the source
 *   author's `exercise_id`. `program_state` then points at the new clone with a reset
 *   cursor, exactly as for the own-program branch.
 *
 * Returns the id the activator's `program_state` now points at: `programId` itself for
 * the own-program branch, or the new clone's id for the community branch.
 */
export function useActivateDbProgram() {
  const queryClient = useQueryClient()

  return useMutation<string, Error, ActivateDbProgramInput>({
    mutationFn: async ({ programId }) => {
      const supabase = getSupabase()

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const userId = userData?.user?.id
      if (!userId) throw new Error('Not authenticated')

      const { data: programData, error: programError } = await supabase
        .from('programs')
        .select('*')
        .eq('id', programId)
        .single()
      if (programError) throw programError
      const programRow = programData as ProgramRow

      const { data: daysData, error: daysError } = await supabase
        .from('program_days')
        .select('*')
        .eq('program_id', programId)
        .order('order_index')
      if (daysError) throw daysError
      const days = (daysData ?? []) as ProgramDayRow[]
      const dayIds = days.map(d => d.id)

      let exercises: ProgramExerciseRow[] = []
      if (dayIds.length > 0) {
        const { data: exData, error: exError } = await supabase
          .from('program_exercises')
          .select('*')
          .in('program_day_id', dayIds)
          .order('order_index')
        if (exError) throw exError
        exercises = (exData ?? []) as ProgramExerciseRow[]
      }

      if (programRow.user_id === userId) {
        const { error: stateError } = await supabase
          .from('program_state')
          .upsert({ ...resetCursorState(programId), user_id: userId }, { onConflict: 'user_id' })
        if (stateError) throw stateError

        return programId
      }

      // Another user's public program: clone into the activator's own rows as a
      // private snapshot, re-resolving exercise names in the activator's own catalog.
      const draft = programRowsToDraft(toProgramRowsLike(programRow, days, exercises))
      draft.isPublic = false

      const exerciseIdByName = await resolveDraftExerciseIds(draft, userId)

      const newProgramId = crypto.randomUUID()
      const newDayIds = draft.days.map(() => crypto.randomUUID())
      const rows = buildProgramRows(draft, exerciseIdByName, { programId: newProgramId, dayIds: newDayIds })

      const { error: insertProgramError } = await supabase
        .from('programs')
        .insert({ ...rows.program, user_id: userId })
      if (insertProgramError) throw insertProgramError

      if (rows.days.length > 0) {
        const { error: insertDaysError } = await supabase.from('program_days').insert(rows.days)
        if (insertDaysError) throw insertDaysError
      }

      if (rows.exercises.length > 0) {
        const { error: insertExercisesError } = await supabase.from('program_exercises').insert(rows.exercises)
        if (insertExercisesError) throw insertExercisesError
      }

      const { error: stateError } = await supabase
        .from('program_state')
        .upsert({ ...resetCursorState(newProgramId), user_id: userId }, { onConflict: 'user_id' })
      if (stateError) throw stateError

      return newProgramId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeWorkout'] })
    },
  })
}
