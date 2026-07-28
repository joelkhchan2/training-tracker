import { useCommonExercises } from '../../data/commonExercises'
import { useAuth } from '../../lib/useAuth'
import { ExercisePicker } from '../programs/ExercisePicker'
import type { PickedExercise } from '../programs/ExercisePicker'

export interface ExercisePickerSheetProps {
  onPick: (pick: PickedExercise) => void
  onClose: () => void
}

/** Bottom-sheet host for the shared ExercisePicker, used to add or replace an exercise
 *  mid-workout. Picking routes to onPick (the caller decides add vs replace) then closes.
 *  Feeds the picker's Suggested section from useCommonExercises, labeled "Common". */
export function ExercisePickerSheet({ onPick, onClose }: ExercisePickerSheetProps) {
  const { user } = useAuth()
  const { data: common = [] } = useCommonExercises(user?.id)

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="mx-auto max-h-[85vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl bg-surface p-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <ExercisePicker onPick={onPick} suggested={common} suggestedLabel="Common" />
        <button type="button" onClick={onClose} className="w-full rounded-xl border border-border bg-bg py-3 text-text">
          Cancel
        </button>
      </div>
    </div>
  )
}
