import type { DraftExerciseKind } from '../../domain/programDraft'

/** Maps a catalog row's `exercise_type` to the draft's `kind`: only `'bodyweight'` maps to
 *  `'bodyweight'`, everything else maps to `'strength'`. Pure. Extracted from ExercisePicker so
 *  both it and SubstituteSheet can import it without tripping react-refresh/only-export-components. */
export function kindForExerciseType(exerciseType: string | null): DraftExerciseKind {
  return exerciseType === 'bodyweight' ? 'bodyweight' : 'strength'
}
