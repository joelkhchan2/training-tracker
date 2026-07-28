import { ExercisePicker } from '../programs/ExercisePicker'
import type { PickedExercise } from '../programs/ExercisePicker'
import { useAuth } from '../../lib/useAuth'
import { useAlternateExercises } from '../../data/alternateExercises'
import type { ExerciseListItem } from '../../data/exerciseCatalog'

export interface SubstituteSheetProps {
  currentExerciseId: string | null
  currentName: string
  onPick: (pick: PickedExercise) => void
  onClose: () => void
}

/** Replace-an-exercise sheet: maps the shared-muscle alternates from useAlternateExercises
 *  to ExerciseListItem and hands them to the embedded ExercisePicker as its Suggested
 *  section ("Suggested alternates") — the picker itself owns rendering that section
 *  (alongside Favorites/Recent/search), so this sheet no longer renders its own list. */
export function SubstituteSheet({ currentExerciseId, currentName, onPick, onClose }: SubstituteSheetProps) {
  const { user } = useAuth()
  const { data: alternates = [] } = useAlternateExercises(currentExerciseId, currentName, user?.id)
  const suggested: ExerciseListItem[] = alternates.map((a) => ({
    id: a.id,
    name: a.name,
    exerciseType: a.exerciseType,
    primaryMuscles: a.primaryMuscles,
    equipment: a.equipment,
  }))

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="mx-auto max-h-[85vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl bg-surface p-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <ExercisePicker onPick={onPick} suggested={suggested} suggestedLabel="Suggested alternates" />
        <button type="button" onClick={onClose} className="w-full rounded-xl border border-border bg-bg py-3 text-text">
          Cancel
        </button>
      </div>
    </div>
  )
}
