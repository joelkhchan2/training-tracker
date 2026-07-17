import type { Program, ProgramDay, ProgramExercise, Scheme, FixedSet } from './types'

// ----- Draft model: the editable shape behind the Custom Program Builder UI. -----

export type DraftExerciseKind = 'strength' | 'bodyweight' // Spec 2 will add 'cardio'

export interface DraftSet { reps: number; weight?: number }
export interface DraftExercise { exerciseName: string; kind: DraftExerciseKind; sets: DraftSet[] }
export interface DraftDay { name: string; exercises: DraftExercise[] }
export interface ProgramDraft { name: string; description: string; isPublic: boolean; days: DraftDay[] }

function fixedSchemeFrom(ex: DraftExercise): Scheme {
  return {
    type: 'fixed',
    sets: ex.sets.map((s): FixedSet => (ex.kind === 'bodyweight' || s.weight === undefined
      ? { reps: s.reps }
      : { reps: s.reps, weight: s.weight })),
  }
}

export function draftToProgram(draft: ProgramDraft): Program {
  const days: ProgramDay[] = draft.days.map((day): ProgramDay => ({
    name: day.name,
    exercises: day.exercises.map((ex, i): ProgramExercise => ({
      exerciseName: ex.exerciseName,
      scheme: fixedSchemeFrom(ex),
      order: i,
    })),
  }))
  return { name: draft.name, discipline: 'strength', days }
}

export function validateDraft(draft: ProgramDraft): string[] {
  const messages: string[] = []
  if (draft.name.trim() === '') messages.push('Program name is required.')
  if (draft.days.length === 0) messages.push('Program must have at least one day.')
  draft.days.forEach((day, dIdx) => {
    if (day.exercises.length === 0) messages.push(`Day ${dIdx + 1} ("${day.name}") must have at least one exercise.`)
    day.exercises.forEach((ex, eIdx) => {
      if (ex.sets.length === 0) {
        messages.push(`Day ${dIdx + 1}, exercise ${eIdx + 1} ("${ex.exerciseName}") must have at least one set.`)
      }
      ex.sets.forEach((set, sIdx) => {
        if (set.reps < 1) {
          messages.push(`Day ${dIdx + 1}, exercise ${eIdx + 1} ("${ex.exerciseName}"), set ${sIdx + 1} must have at least 1 rep.`)
        }
      })
    })
  })
  return messages
}

// ----- Inverse mapping: reconstruct an editable draft from persisted program rows. -----
// Consumed by BOTH edit-load (Task 10) and the activation clone (Task 7).

export interface ProgramExerciseLike {
  exercise_name: string | null
  exercise_type: string | null
  role_key: string | null
  order_index: number
  scheme: Scheme
}
export interface ProgramDayLike { name: string; order_index: number; exercises: ProgramExerciseLike[] }
export interface ProgramRowsLike { name: string; description: string | null; is_public: boolean; days: ProgramDayLike[] }

export function programRowsToDraft(rows: ProgramRowsLike): ProgramDraft {
  const days: DraftDay[] = [...rows.days]
    .sort((a, b) => a.order_index - b.order_index)
    .map((day): DraftDay => ({
      name: day.name,
      exercises: [...day.exercises]
        .sort((a, b) => a.order_index - b.order_index)
        .map((ex): DraftExercise => {
          if (ex.scheme.type !== 'fixed') {
            throw new Error(
              `programRowsToDraft: exercise "${ex.exercise_name ?? ex.role_key ?? 'Unknown exercise'}" has a non-fixed scheme ("${ex.scheme.type}"). Only fixed-scheme programs can be edited or cloned in the builder.`,
            )
          }
          return {
            exerciseName: ex.exercise_name ?? ex.role_key ?? 'Unknown exercise',
            kind: ex.exercise_type === 'bodyweight' ? 'bodyweight' : 'strength',
            sets: ex.scheme.sets.map((s): DraftSet => (s.weight != null ? { reps: s.reps, weight: s.weight } : { reps: s.reps })),
          }
        }),
    }))
  return {
    name: rows.name,
    description: rows.description ?? '',
    isPublic: rows.is_public,
    days,
  }
}
