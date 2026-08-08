import { useState } from 'react'
import { ExercisePicker } from '../programs/ExercisePicker'
import type { PickedExercise } from '../programs/ExercisePicker'
import { useAuth } from '../../lib/useAuth'
import { useAlternateExercises } from '../../data/alternateExercises'
import type { ExerciseListItem } from '../../data/exerciseCatalog'

export interface SubstituteSheetProps {
  currentExerciseId: string | null
  currentName: string
  /** True when the exercise being replaced is a real slot on today's program day, so the
   *  "change in my program" option can write the swap back. False for adhoc/added exercises
   *  (no program slot to repoint) — the checkbox is hidden entirely. */
  canPersist: boolean
  onPick: (pick: PickedExercise, makePermanent: boolean) => void
  onClose: () => void
}

/** Replace-an-exercise sheet: maps the shared-muscle alternates from useAlternateExercises
 *  to ExerciseListItem and hands them to the embedded ExercisePicker as its Suggested
 *  section ("Suggested alternates") — the picker itself owns rendering that section
 *  (alongside Favorites/Recent/search), so this sheet no longer renders its own list.
 *
 *  When `canPersist`, an opt-in checkbox lets the pick also repoint the underlying
 *  `program_exercises` slot (via `onPick`'s `makePermanent` flag) so the substitution
 *  sticks for future workouts — otherwise the swap is session-only. */
export function SubstituteSheet({ currentExerciseId, currentName, canPersist, onPick, onClose }: SubstituteSheetProps) {
  const { user } = useAuth()
  const { data: alternates = [] } = useAlternateExercises(currentExerciseId, currentName, user?.id)
  const [makePermanent, setMakePermanent] = useState(false)
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
        {canPersist ? (
          <label className="flex items-start gap-2 rounded-xl border border-border bg-bg p-3 text-sm text-text">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={makePermanent}
              onChange={(e) => setMakePermanent(e.target.checked)}
            />
            <span>
              Change in my program too
              <span className="block text-xs text-muted">Applies to future workouts, not just today.</span>
            </span>
          </label>
        ) : null}
        <ExercisePicker
          onPick={(pick) => onPick(pick, makePermanent)}
          suggested={suggested}
          suggestedLabel="Suggested alternates"
        />
        <button type="button" onClick={onClose} className="w-full rounded-xl border border-border bg-bg py-3 text-text">
          Cancel
        </button>
      </div>
    </div>
  )
}
