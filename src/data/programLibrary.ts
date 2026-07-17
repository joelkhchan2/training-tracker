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
  /** Authored by the viewer, public or not. */
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
 *  community program still renders its real exercise names. */
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

    const libraryProgram: LibraryProgram = {
      id: programRow.id,
      name: programRow.name,
      description: programRow.description ?? '',
      discipline: programRow.discipline,
      daysPerWeek: programDays.length,
      isOwn: programRow.user_id === userId,
      program: buildDomainProgram(programRow, programDays, ownProgramExercises, exercisesById),
    }

    if (libraryProgram.isOwn) own.push(libraryProgram)
    else community.push(libraryProgram)
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
