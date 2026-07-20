import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Discipline, Program } from '../domain'
import { getSupabase } from './supabase'
import { buildDomainProgram } from './queries'
import type { ExerciseRow, ProgramDayRow, ProgramExerciseRow, ProgramRow } from './types'

/** One entry in the Custom Program Builder's library screen: a `programs` row
 *  assembled into a domain `Program`, plus the display metadata the library
 *  list needs without re-deriving it from `program`. */
export interface LibraryProgram {
  id: string
  name: string
  description: string
  discipline: Discipline
  daysPerWeek: number
  isOwn: boolean
  program: Program
}

export interface PublicProgramsBundle {
  /** Authored (via the builder, or cloned from a community program) by the viewer,
   *  public or not. Deliberately excludes the viewer's own preset-activation
   *  snapshots — see the discriminator comment in `fetchPublicPrograms` below. */
  own: LibraryProgram[]
  /** Public and authored by someone else. */
  community: LibraryProgram[]
}

/** One batched fetch: programs (public OR mine) -> their program_days ->
 *  program_exercises -> referenced exercises, mirroring `fetchActiveWorkout`'s
 *  batched-read shape. Assembles each program into a `LibraryProgram` via
 *  `buildDomainProgram`, then splits by authorship.
 *
 *  A community program's `exercises` fetch only returns rows the viewer can
 *  read under RLS (their own + globally-owned exercises), so an exercise
 *  authored by someone else is silently absent from `exercisesById` here.
 *  `buildDomainProgram`'s exercise-name resolution falls back to the
 *  denormalized `program_exercises.exercise_name` in that case, so the
 *  community program still renders its real exercise names.
 *
 *  Among the viewer's own `programs` rows, only builder-authored/cloned ones land
 *  in `own` — preset-activation snapshots are excluded via the `exercise_name`
 *  discriminator (see the comment at the classification loop below) since "My
 *  programs" means authored programs, not every owned row. */
export async function fetchPublicPrograms(userId: string): Promise<PublicProgramsBundle> {
  const supabase = getSupabase()

  const { data: programsData, error: programsError } = await supabase
    .from('programs')
    .select('*')
    .or(`is_public.eq.true,user_id.eq.${userId}`)
  if (programsError) throw programsError

  const programs = (programsData ?? []) as ProgramRow[]
  const programIds = programs.map(p => p.id)

  let days: ProgramDayRow[] = []
  if (programIds.length > 0) {
    const { data: daysData, error: daysError } = await supabase
      .from('program_days')
      .select('*')
      .in('program_id', programIds)
      .order('order_index')
    if (daysError) throw daysError
    days = (daysData ?? []) as ProgramDayRow[]
  }

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

  const daysByProgram = new Map<string, ProgramDayRow[]>()
  for (const day of days) {
    const list = daysByProgram.get(day.program_id)
    if (list) list.push(day)
    else daysByProgram.set(day.program_id, [day])
  }

  const own: LibraryProgram[] = []
  const community: LibraryProgram[] = []

  for (const programRow of programs) {
    const programDays = daysByProgram.get(programRow.id) ?? []
    const dayIdSet = new Set(programDays.map(d => d.id))
    const ownProgramExercises = programExercises.filter(pe => dayIdSet.has(pe.program_day_id))

    const isOwn = programRow.user_id === userId

    const libraryProgram: LibraryProgram = {
      id: programRow.id,
      name: programRow.name,
      description: programRow.description ?? '',
      discipline: programRow.discipline,
      daysPerWeek: programDays.length,
      isOwn,
      program: buildDomainProgram(programRow, programDays, ownProgramExercises, exercisesById),
    }

    if (isOwn) {
      // Discriminate "authored" from "preset-activation snapshot" among the viewer's
      // OWN `programs` rows. Both the Custom Program Builder's save path
      // (`buildProgramRows` in saveProgram.ts) and community-clone path
      // (`useActivateDbProgram` in activateProgram.ts, which also calls
      // `buildProgramRows`) always write a non-null `program_exercises.exercise_name`.
      // Preset activation (`buildActivationRows`, also in activateProgram.ts) never
      // writes `exercise_name` at all — every exercise row of an activated-preset
      // snapshot has it NULL. So an owned program only belongs in "My programs" when
      // it has at least one exercise and NONE of them have a null `exercise_name`.
      // Preset snapshots that fail this check are excluded from both `own` and
      // `community` — regardless of `is_public`, a viewer's own program must never
      // render as "Shared by the community" — they're surfaced via the
      // Presets/active-workout flow, not the library, so simply not appearing here
      // is correct.
      const isBuilderAuthored = ownProgramExercises.length > 0 &&
        ownProgramExercises.every(pe => pe.exercise_name != null)

      if (isBuilderAuthored) own.push(libraryProgram)
      continue
    }

    // Not owned by the viewer. `community` is specifically "public AND owned by
    // ANOTHER user" — every row here already passed the `programs` query's
    // `.or(is_public.eq.true, user_id.eq.<me>)` filter, so a non-own row is
    // guaranteed `is_public = true`. But a null `user_id` (e.g. a pre-builder
    // migrated program: `assemble()` in scripts/migration/load.ts never overrides
    // `programSeed.program.user_id`, so it stays the `user_id: null` hardcoded by
    // `toProgramSeed()`) has no confirmed owner at all — it doesn't qualify as
    // "owned by another user" just because it isn't owned by me, so it's excluded
    // from `community` too, landing in neither list.
    if (programRow.user_id != null) community.push(libraryProgram)
  }

  return { own, community }
}

/** `userId` comes from the caller's auth session (e.g. `useAuth().user?.id`); the query
 *  stays disabled until it's known. Query key is pinned to `['publicPrograms', userId]`
 *  because `useSaveProgram`/`useUpdateProgram`/`useDeleteProgram` (saveProgram.ts)
 *  invalidate this exact key on success. */
export function usePublicPrograms(userId: string | undefined): UseQueryResult<PublicProgramsBundle> {
  return useQuery({
    queryKey: ['publicPrograms', userId],
    queryFn: () => fetchPublicPrograms(userId as string),
    enabled: !!userId,
  })
}
