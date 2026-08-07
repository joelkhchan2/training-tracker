import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { CompactSelect } from '../../components/ui/CompactSelect'
import { Textarea } from '../../components/ui/Textarea'
import { useAuth } from '../../lib/useAuth'
import { useExerciseHistory } from '../../data/exerciseHistory'
import type { ExerciseHistorySession } from '../../data/exerciseHistory'
import { SetRow } from './SetRow'
import { ExerciseHistorySheet } from './ExerciseHistorySheet'
import { useSessionStore } from './sessionStore'
import type { ExerciseInputType, SessionExercise } from './sessionStore'
import { formatWeight, type WeightUnit } from '../../domain'
import { usePrefs } from '../settings/usePrefs'

export interface ExerciseCardProps {
  exIdx: number
  exercise: SessionExercise
  exerciseId: string | null
  onReplace: () => void
  onRemove: () => void
}

const INPUT_TYPE_OPTIONS: { value: ExerciseInputType; label: string }[] = [
  { value: 'weighted', label: 'Weight × Reps' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'timed', label: 'Timed' },
  { value: 'weighted_time', label: 'Weighted + Timed' },
]

/** Running volume (Σ weight × reps) across this exercise's completed sets —
 *  a quick "how much did I actually move" signal while logging. Sets with
 *  no weight (e.g. bodyweight) or not yet marked done don't count. */
function doneVolume(exercise: SessionExercise): number {
  return exercise.sets.reduce((total, s) => {
    if (!s.done || s.weight == null || s.reps == null || s.isWarmup) return total
    return total + s.weight * s.reps
  }, 0)
}

/** Formats the "last time" hint for a history session: the heaviest non-warmup set as
 *  "W×R" when any qualifying set has a weight, or, for a purely bodyweight session, the
 *  set with the most reps as "BW×R". Returns null only when the session has no non-warmup
 *  set with a rep count at all. */
function topSet(session: ExerciseHistorySession, unit: WeightUnit): string | null {
  const candidates = session.sets.filter((s) => !s.isWarmup && s.reps != null)
  if (candidates.length === 0) return null
  const withWeight = candidates.filter((s) => s.weight != null)
  if (withWeight.length > 0) {
    const best = withWeight.reduce((a, b) => (b.weight! > a.weight! ? b : a))
    return `${formatWeight(best.weight!, unit)}×${best.reps}`
  }
  const best = candidates.reduce((a, b) => (b.reps! > a.reps! ? b : a))
  return `BW×${best.reps}`
}

/** A persistent per-exercise note (e.g. "tuck front lever", "3s pause squats"), stored in the
 *  synced prefs blob keyed by exercise name so it shows every time that exercise is logged.
 *  Collapsed to a one-line display (or "+ Add note") until tapped to edit. */
function ExerciseNote({ exerciseName }: { exerciseName: string }) {
  const note = usePrefs((s) => s.exerciseNotes[exerciseName] ?? '')
  const setExerciseNote = usePrefs((s) => s.setExerciseNote)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)

  function open() {
    setDraft(note)
    setEditing(true)
  }

  function save() {
    setExerciseNote(exerciseName, draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <Textarea label={`Note for ${exerciseName}`} value={draft} onChange={setDraft} rows={2} />
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Save note
          </Button>
        </div>
      </div>
    )
  }

  if (note) {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={`Edit note for ${exerciseName}`}
        className="flex w-full items-start gap-1.5 rounded-lg text-left text-sm italic text-muted hover:text-text"
      >
        <span aria-hidden="true">📝</span>
        <span className="flex-1">{note}</span>
      </button>
    )
  }

  return (
    <button type="button" onClick={open} className="w-fit text-xs font-medium text-muted hover:text-text">
      + Add note
    </button>
  )
}

/** One exercise within the active session: header, a running volume hint,
 *  its editable SetRows, and a control to add another set. */
export function ExerciseCard({ exIdx, exercise, exerciseId, onReplace, onRemove }: ExerciseCardProps) {
  const addSet = useSessionStore((s) => s.addSet)
  const setInputType = useSessionStore((s) => s.setInputType)
  const volume = doneVolume(exercise)
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: exercise.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const [historyOpen, setHistoryOpen] = useState(false)
  const { user } = useAuth()
  const { data: history } = useExerciseHistory(exerciseId, user?.id)
  const weightUnit = usePrefs((s) => s.weightUnit)
  const globalAutoFill = usePrefs((s) => s.autoFillSets)
  const autoFillOverride = usePrefs((s) => s.autoFillSetsByExercise[exercise.exerciseName])
  const setAutoFillForExercise = usePrefs((s) => s.setAutoFillForExercise)
  // Per-exercise override wins; otherwise inherit the global default. Remembered across future
  // workouts because it lives in the synced prefs blob, keyed by exercise name.
  const autoFill = autoFillOverride ?? globalAutoFill
  const last = history?.[0]
  const lastTop = last ? topSet(last, weightUnit) : null

  return (
    <div ref={setNodeRef} style={style}>
      <Card data-testid={`exercise-card-${exIdx}`} className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            aria-label={`Reorder ${exercise.exerciseName}`}
            className="flex h-9 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
          <button
            type="button"
            onClick={onReplace}
            aria-label={`Replace ${exercise.exerciseName}`}
            className="flex-1 break-words text-left text-base font-semibold text-text underline decoration-dotted underline-offset-4"
          >
            {exercise.exerciseName}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">{volume > 0 ? `${formatWeight(volume, weightUnit)} vol` : '—'}</span>
            <button
              type="button"
              onClick={onReplace}
              aria-label={`Substitute ${exercise.exerciseName}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text hover:bg-surface-hover"
            >
              ⇄
            </button>
            {exerciseId ? (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                aria-label={`History for ${exercise.exerciseName}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text hover:bg-surface-hover"
              >
                🕐
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${exercise.exerciseName}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-danger hover:bg-surface-hover"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CompactSelect
            ariaLabel="Log as"
            value={exercise.inputType}
            onChange={(value) => setInputType(exIdx, value as ExerciseInputType)}
            options={INPUT_TYPE_OPTIONS}
          />
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              aria-label={`Auto-fill sets for ${exercise.exerciseName}`}
              checked={autoFill}
              onChange={(e) => setAutoFillForExercise(exercise.exerciseName, e.target.checked)}
            />
            Auto-fill sets
          </label>
        </div>

        <ExerciseNote exerciseName={exercise.exerciseName} />

        {last && lastTop ? (
          <p className="text-xs text-muted">
            last: {lastTop} · {last.date}
          </p>
        ) : null}

        <div className="space-y-2">
          {exercise.sets.map((set, setIdx) => (
            <SetRow key={setIdx} exIdx={exIdx} setIdx={setIdx} set={set} inputType={exercise.inputType} autoFill={autoFill} />
          ))}
        </div>

        <Button variant="secondary" size="sm" fullWidth onClick={() => addSet(exIdx)}>
          + Add set
        </Button>
      </Card>

      {historyOpen && exerciseId ? (
        <ExerciseHistorySheet exerciseId={exerciseId} exerciseName={exercise.exerciseName} onClose={() => setHistoryOpen(false)} />
      ) : null}
    </div>
  )
}
