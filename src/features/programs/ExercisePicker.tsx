import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { TextField } from '../../components/ui/TextField'
import { useExerciseSearch, type ExerciseListItem } from '../../data/exerciseCatalog'
import { useFavoriteExercises, useToggleFavorite } from '../../data/favoriteExercises'
import { useRecentExercises } from '../../data/recentExercises'
import { formatExerciseSubtitle } from '../../domain/exerciseDisplay'
import { useAuth } from '../../lib/useAuth'
import type { DraftExerciseKind } from '../../domain/programDraft'
import { kindForExerciseType } from './exerciseKind'

export interface PickedExercise {
  exerciseName: string
  kind: DraftExerciseKind
  exerciseId?: string
  /** Raw catalog exercise_type, when known — populated from the picked catalog row's
   *  exercise_type, or explicit null for the typed custom-add path (no catalog row yet).
   *  Feeds sessionStore's `defaultInputType`. */
  exerciseType?: string | null
}

export interface ExercisePickerProps {
  onPick: (exercise: PickedExercise) => void
  /** Caller-supplied "likely picks" (the add flow's Common exercises, or the substitute
   *  flow's muscle-overlap alternates) rendered above Favorites/Recent. Omitted (or an
   *  empty array) simply omits the section — no loading state is shown for it. */
  suggested?: ExerciseListItem[]
  /** Heading for the `suggested` section; required whenever `suggested` is passed. */
  suggestedLabel?: string
}

const KIND_OPTIONS: { value: DraftExerciseKind; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'bodyweight', label: 'Bodyweight' },
]

interface ExerciseRowListProps {
  items: ExerciseListItem[]
  favoriteIds: Set<string>
  onPickItem: (item: ExerciseListItem) => void
  onToggleFavorite: (item: ExerciseListItem, isFavorited: boolean) => void
}

/** Shared row rendering for every section (suggested, favorite, recent, search result):
 *  name + `formatExerciseSubtitle` subtitle (omitted when "") + a star toggle. Two sibling
 *  <button>s inside the <li> — a nested <button> for the star inside the name button would
 *  be invalid HTML/a11y, so tapping the row and tapping the star are two separate controls. */
function ExerciseRowList({ items, favoriteIds, onPickItem, onToggleFavorite }: ExerciseRowListProps) {
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const subtitle = formatExerciseSubtitle(item.primaryMuscles, item.equipment)
        const isFavorited = favoriteIds.has(item.id)
        return (
          <li key={item.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
            <button
              type="button"
              onClick={() => onPickItem(item)}
              className="flex-1 text-left text-text"
            >
              <span className="block">{item.name}</span>
              {subtitle ? <span className="block text-xs text-muted">{subtitle}</span> : null}
            </button>
            <button
              type="button"
              aria-label={isFavorited ? `Unfavorite ${item.name}` : `Favorite ${item.name}`}
              onClick={() => onToggleFavorite(item, isFavorited)}
              className="shrink-0 text-lg leading-none text-muted hover:text-text"
            >
              {isFavorited ? '★' : '☆'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Catalog search + Favorites/Recent/Suggested sections + add-custom affordance, shared by
 * the Custom Program Builder, the mid-workout add-exercise sheet, and the substitute sheet.
 * Self-contained: calls its own `useAuth`/`useFavoriteExercises`/`useRecentExercises` (same
 * pattern `SubstituteSheet` already used for `useAlternateExercises`) — callers only ever
 * pass `suggested`/`suggestedLabel` when they have a caller-specific list.
 *
 * Resolution-free by design: it never creates a catalog row itself and there is no
 * `createCustomExercise` here — every path (a tapped row or the typed add-custom
 * name+kind) just calls `onPick({ exerciseName, kind, exerciseId? })`. Turning a name into
 * a catalog id (and minting a new custom row when it doesn't already exist) happens
 * exactly once, at save time, in `resolveDraftExerciseIds`.
 *
 * Empty search term: renders, in order, Suggested (only if passed) -> Favorites -> Recent;
 * any section with zero items is omitted entirely (no heading, no placeholder) — search and
 * the custom button are always available below. Non-empty term: search results only.
 *
 * The search box only queries on submit (not per keystroke) — `useExerciseSearch` is called
 * with the last *submitted* term, not the raw input value.
 *
 * The custom-exercise form is collapsed behind a "+ Custom exercise" button by default — it
 * and the button are mutually exclusive.
 */
export function ExercisePicker({ onPick, suggested, suggestedLabel }: ExercisePickerProps) {
  const { user } = useAuth()
  const [term, setTerm] = useState('')
  const [submittedTerm, setSubmittedTerm] = useState('')
  const { data: results = [] } = useExerciseSearch(submittedTerm, user?.id)
  const { items: favorites, ids: favoriteIds } = useFavoriteExercises(user?.id)
  const { data: recent = [] } = useRecentExercises(user?.id)
  const { mutate: toggleFavorite } = useToggleFavorite()

  const [customOpen, setCustomOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customKind, setCustomKind] = useState<DraftExerciseKind>('strength')

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmittedTerm(term)
  }

  function handleAddCustom() {
    const name = customName.trim()
    if (!name) return
    onPick({ exerciseName: name, kind: customKind, exerciseType: null })
    setCustomName('')
  }

  function handlePickItem(item: ExerciseListItem) {
    onPick({
      exerciseName: item.name,
      kind: kindForExerciseType(item.exerciseType),
      exerciseId: item.id,
      exerciseType: item.exerciseType,
    })
  }

  function handleToggleFavorite(item: ExerciseListItem, isFavorited: boolean) {
    toggleFavorite({ item, isFavorited })
  }

  const isSearching = submittedTerm.trim().length > 0

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

      {isSearching ? (
        results.length > 0 ? (
          <ExerciseRowList items={results} favoriteIds={favoriteIds} onPickItem={handlePickItem} onToggleFavorite={handleToggleFavorite} />
        ) : null
      ) : (
        <>
          {suggested && suggested.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted">{suggestedLabel}</h3>
              <ExerciseRowList items={suggested} favoriteIds={favoriteIds} onPickItem={handlePickItem} onToggleFavorite={handleToggleFavorite} />
            </div>
          ) : null}
          {favorites.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted">Favorites</h3>
              <ExerciseRowList items={favorites} favoriteIds={favoriteIds} onPickItem={handlePickItem} onToggleFavorite={handleToggleFavorite} />
            </div>
          ) : null}
          {recent.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted">Recent</h3>
              <ExerciseRowList items={recent} favoriteIds={favoriteIds} onPickItem={handlePickItem} onToggleFavorite={handleToggleFavorite} />
            </div>
          ) : null}
        </>
      )}

      <div className="border-t border-border pt-4">
        {customOpen ? (
          <div className="space-y-3">
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
        ) : (
          <Button type="button" variant="secondary" size="sm" fullWidth onClick={() => setCustomOpen(true)}>
            + Custom exercise
          </Button>
        )}
      </div>
    </div>
  )
}
