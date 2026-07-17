import type { Scheme } from '../domain'
import type { ProgramDraft } from '../domain/programDraft'
import { draftToProgram } from '../domain/programDraft'

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
