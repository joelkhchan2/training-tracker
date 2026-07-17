import { useQuery } from '@tanstack/react-query'
import type { Program, ProgramExercise, TrainingMaxes, Cursor } from '../domain'
import { getSupabase } from './supabase'
import type {
  ExerciseProgressRow,
  ExerciseRow,
  PersonalRecordRow,
  ProgramDayRow,
  ProgramExerciseRow,
  ProgramRow,
  ProgramStateRow,
  TrainingMaxRow,
} from './types'

/** Per-exercise linear-progression state, keyed the same way `getPrescription`'s
 *  `workingWeights` arg expects (`tmKey ?? exerciseName` — see `exerciseKey` below). */
export type WorkingWeights = Record<string, { weight: number; fails: number }>

/** Everything a workout-logging screen needs for the user's current program position. */
export interface ActiveWorkoutBundle {
  program: Program
  days: ProgramDayRow[]
  programExercises: ProgramExerciseRow[]
  exercisesById: Record<string, ExerciseRow>
  trainingMaxes: TrainingMaxes
  cursor: Cursor
  personalRecords: PersonalRecordRow[]
  /** Current weight + consecutive-fails per linear-scheme exercise, from `exercise_progress`. */
  workingWeights: WorkingWeights
  /** `workingWeights` flattened to weight-only, ready to pass straight into
   *  `getPrescription(program, cursor, maxes, workingWeightValues)`. */
  workingWeightValues: Record<string, number>
}

/** The same `tmKey ?? exerciseName` key `getPrescription`'s linear branch looks up by
 *  (see `programEngine.ts`), derived from a DB row instead of the built `ProgramExercise`. */
function exerciseKey(pe: ProgramExerciseRow, exercisesById: Record<string, ExerciseRow>): string {
  const tmKey = pe.role_key ?? undefined
  const exerciseName = (pe.exercise_id && exercisesById[pe.exercise_id]?.name) || pe.role_key || 'Unknown exercise'
  return tmKey ?? exerciseName
}

/** Maps `exercise_progress` rows (keyed by `exercise_id`) onto the `tmKey ?? exerciseName`
 *  key `getPrescription`/`applyLinearProgression` expect, via the program's own exercises. */
export function buildWorkingWeights(
  programExercises: ProgramExerciseRow[],
  exercisesById: Record<string, ExerciseRow>,
  progressRows: ExerciseProgressRow[],
): WorkingWeights {
  const keyByExerciseId = new Map<string, string>()
  for (const pe of programExercises) {
    if (pe.exercise_id) keyByExerciseId.set(pe.exercise_id, exerciseKey(pe, exercisesById))
  }

  const result: WorkingWeights = {}
  for (const row of progressRows) {
    const key = row.exercise_id ? keyByExerciseId.get(row.exercise_id) : undefined
    if (!key) continue
    result[key] = { weight: row.current_weight, fails: row.consecutive_fails }
  }
  return result
}

/** Assembles the domain `Program` shape (days -> exercises with their scheme) from DB rows,
 *  so callers can pass the result straight into `getPrescription(program, cursor, maxes)`. */
export function buildDomainProgram(
  programRow: ProgramRow,
  days: ProgramDayRow[],
  programExercises: ProgramExerciseRow[],
  exercisesById: Record<string, ExerciseRow>,
): Program {
  const byDay = new Map<string, ProgramExerciseRow[]>()
  for (const pe of programExercises) {
    const list = byDay.get(pe.program_day_id)
    if (list) list.push(pe)
    else byDay.set(pe.program_day_id, [pe])
  }

  return {
    name: programRow.name,
    discipline: programRow.discipline,
    progressionRule: programRow.progression_rule ?? undefined,
    days: [...days]
      .sort((a, b) => a.order_index - b.order_index)
      .map(day => ({
        name: day.name,
        exercises: (byDay.get(day.id) ?? [])
          .slice()
          .sort((a, b) => a.order_index - b.order_index)
          .map((pe): ProgramExercise => ({
            exerciseName: (pe.exercise_id ? exercisesById[pe.exercise_id]?.name : undefined)
              ?? pe.exercise_name ?? pe.role_key ?? 'Unknown exercise',
            tmKey: pe.role_key ?? undefined,
            order: pe.order_index,
            scheme: pe.scheme,
          })),
      })),
  }
}

/** One batched fetch: program_state -> programs -> program_days -> program_exercises -> exercises,
 *  plus the user's training_maxes and personal_records. Returns null when the user has no active program. */
export async function fetchActiveWorkout(userId: string): Promise<ActiveWorkoutBundle | null> {
  const supabase = getSupabase()

  const { data: stateData, error: stateError } = await supabase
    .from('program_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (stateError) throw stateError

  const stateRow = stateData as ProgramStateRow | null
  if (!stateRow || !stateRow.active_program_id) return null

  const programId = stateRow.active_program_id

  const [programRes, daysRes, maxesRes, prsRes, progressRes] = await Promise.all([
    supabase.from('programs').select('*').eq('id', programId).single(),
    supabase.from('program_days').select('*').eq('program_id', programId).order('order_index'),
    supabase.from('training_maxes').select('*').eq('user_id', userId),
    supabase.from('personal_records').select('*').eq('user_id', userId),
    supabase.from('exercise_progress').select('*').eq('user_id', userId).eq('program_id', programId),
  ])
  if (programRes.error) throw programRes.error
  if (daysRes.error) throw daysRes.error
  if (maxesRes.error) throw maxesRes.error
  if (prsRes.error) throw prsRes.error
  if (progressRes.error) throw progressRes.error

  const programRow = programRes.data as ProgramRow
  const days = (daysRes.data ?? []) as ProgramDayRow[]
  const dayIds = days.map(d => d.id)

  let programExercises: ProgramExerciseRow[] = []
  if (dayIds.length > 0) {
    const { data: peData, error: peError } = await supabase
      .from('program_exercises')
      .select('*')
      .in('program_day_id', dayIds)
      .order('order_index')
    if (peError) throw peError
    programExercises = (peData ?? []) as ProgramExerciseRow[]
  }

  const exerciseIds = [...new Set(
    programExercises.map(pe => pe.exercise_id).filter((id): id is string => !!id),
  )]

  let exercisesById: Record<string, ExerciseRow> = {}
  if (exerciseIds.length > 0) {
    const { data: exData, error: exError } = await supabase
      .from('exercises')
      .select('*')
      .in('id', exerciseIds)
    if (exError) throw exError
    exercisesById = Object.fromEntries(
      ((exData ?? []) as ExerciseRow[]).map(ex => [ex.id, ex]),
    )
  }

  const trainingMaxes: TrainingMaxes = {}
  for (const row of (maxesRes.data ?? []) as TrainingMaxRow[]) trainingMaxes[row.key] = row.value

  const program = buildDomainProgram(programRow, days, programExercises, exercisesById)

  const progressRows = (progressRes.data ?? []) as ExerciseProgressRow[]
  const workingWeights = buildWorkingWeights(programExercises, exercisesById, progressRows)
  const workingWeightValues = Object.fromEntries(
    Object.entries(workingWeights).map(([key, { weight }]) => [key, weight]),
  )

  return {
    program,
    days,
    programExercises,
    exercisesById,
    trainingMaxes,
    cursor: stateRow.cursor,
    personalRecords: (prsRes.data ?? []) as PersonalRecordRow[],
    workingWeights,
    workingWeightValues,
  }
}

/** `userId` comes from the caller's auth session (e.g. `useAuth().user?.id`); the query
 *  stays disabled until it's known, so there's no accidental fetch for a logged-out user. */
export function useActiveWorkout(userId: string | undefined) {
  return useQuery({
    queryKey: ['activeWorkout', userId],
    queryFn: () => fetchActiveWorkout(userId as string),
    enabled: !!userId,
  })
}
