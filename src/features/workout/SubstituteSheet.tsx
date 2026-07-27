import { ExercisePicker, kindForExerciseType } from '../programs/ExercisePicker'
import type { PickedExercise } from '../programs/ExercisePicker'
import { useAuth } from '../../lib/useAuth'
import { useAlternateExercises } from '../../data/alternateExercises'

export interface SubstituteSheetProps {
  currentExerciseId: string | null
  currentName: string
  onPick: (pick: PickedExercise) => void
  onClose: () => void
}

/** Replace-an-exercise sheet: suggested alternates (shared muscles) on top, full-catalog search
 *  below. Both paths route to the same onPick the caller uses for replace. */
export function SubstituteSheet({ currentExerciseId, currentName, onPick, onClose }: SubstituteSheetProps) {
  const { user } = useAuth()
  const { data: alternates = [], isLoading } = useAlternateExercises(currentExerciseId, currentName, user?.id)
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="mx-auto max-h-[85vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl bg-surface p-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted">Suggested alternates</h3>
          {isLoading ? (
            <p className="text-muted">Loading…</p>
          ) : alternates.length === 0 ? (
            <p className="text-sm text-muted">No suggestions — search below.</p>
          ) : (
            <ul className="space-y-2">
              {alternates.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onPick({ exerciseName: a.name, kind: kindForExerciseType(a.exerciseType), exerciseId: a.id })}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-bg px-4 py-3 text-left text-text hover:bg-surface-hover"
                  >
                    <span>{a.name}</span>
                    <span className="shrink-0 text-xs text-muted">{a.sharedCount} shared</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border pt-4">
          <ExercisePicker onPick={onPick} />
        </div>
        <button type="button" onClick={onClose} className="w-full rounded-xl border border-border bg-bg py-3 text-text">
          Cancel
        </button>
      </div>
    </div>
  )
}
