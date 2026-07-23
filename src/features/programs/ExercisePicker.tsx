import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { TextField } from '../../components/ui/TextField'
import { useExerciseSearch } from '../../data/exerciseCatalog'
import { useAuth } from '../../lib/useAuth'
import type { DraftExerciseKind } from '../../domain/programDraft'
import type { ExerciseSearchResult } from '../../data/exerciseCatalog'

export interface PickedExercise {
  exerciseName: string
  kind: DraftExerciseKind
  exerciseId?: string
}

export interface ExercisePickerProps {
  onPick: (exercise: PickedExercise) => void
}

const KIND_OPTIONS: { value: DraftExerciseKind; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'bodyweight', label: 'Bodyweight' },
]

/** Maps a catalog row's `exercise_type` to the draft's `kind`: only
 *  `'bodyweight'` maps to `'bodyweight'`, everything else (today just
 *  `'weighted'`/`'timed'`) maps to `'strength'` — the only two kinds
 *  `DraftExerciseKind` supports so far. */
function kindForExerciseType(exerciseType: ExerciseSearchResult['exercise_type']): DraftExerciseKind {
  return exerciseType === 'bodyweight' ? 'bodyweight' : 'strength'
}

/**
 * Catalog search + add-custom affordance used by the Custom Program Builder
 * to pick an exercise for a day. Resolution-free by design: it never creates a
 * catalog row itself and there is no `createCustomExercise` here — every path
 * (a clicked search result or the typed add-custom name+kind) just calls
 * `onPick({ exerciseName, kind })`. Turning a name into a catalog id (and
 * minting a new custom row when it doesn't already exist) happens exactly
 * once, at save time, in `resolveDraftExerciseIds`.
 *
 * The search box only queries on submit (not per keystroke) — `useExerciseSearch`
 * is called with the last *submitted* term, not the raw input value, which is
 * the minimal debounce this picker needs per Task 9.
 */
export function ExercisePicker({ onPick }: ExercisePickerProps) {
  const { user } = useAuth()
  const [term, setTerm] = useState('')
  const [submittedTerm, setSubmittedTerm] = useState('')
  const { data: results = [] } = useExerciseSearch(submittedTerm, user?.id)

  const [customName, setCustomName] = useState('')
  const [customKind, setCustomKind] = useState<DraftExerciseKind>('strength')

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmittedTerm(term)
  }

  function handleAddCustom() {
    const name = customName.trim()
    if (!name) return
    onPick({ exerciseName: name, kind: customKind })
    setCustomName('')
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearchSubmit} className="flex items-end gap-3">
        <TextField
          label="Search exercises"
          value={term}
          onChange={setTerm}
          placeholder="e.g. Squat"
          className="flex-1"
        />
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>

      {results.length > 0 ? (
        <ul className="space-y-2">
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => onPick({ exerciseName: result.name, kind: kindForExerciseType(result.exercise_type), exerciseId: result.id })}
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left text-text hover:bg-surface-hover"
              >
                {result.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-muted">Add custom exercise</h3>
        <TextField label="Custom exercise name" value={customName} onChange={setCustomName} placeholder="e.g. Zercher Squat" />
        <Select
          label="Kind"
          value={customKind}
          onChange={(value) => setCustomKind(value as DraftExerciseKind)}
          options={KIND_OPTIONS}
        />
        <Button type="button" onClick={handleAddCustom} fullWidth>
          Add exercise
        </Button>
      </div>
    </div>
  )
}
