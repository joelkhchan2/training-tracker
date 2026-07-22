import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { SetRow } from './SetRow'
import { useSessionStore } from './sessionStore'
import type { SessionExercise } from './sessionStore'

export interface ExerciseCardProps {
  exIdx: number
  exercise: SessionExercise
  onReplace: () => void
  onRemove: () => void
}

/** Running volume (Σ weight × reps) across this exercise's completed sets —
 *  a quick "how much did I actually move" signal while logging. Sets with
 *  no weight (e.g. bodyweight) or not yet marked done don't count. */
function doneVolume(exercise: SessionExercise): number {
  return exercise.sets.reduce((total, s) => {
    if (!s.done || s.weight == null || s.reps == null) return total
    return total + s.weight * s.reps
  }, 0)
}

/** One exercise within the active session: header, a running volume hint,
 *  its editable SetRows, and a control to add another set. */
export function ExerciseCard({ exIdx, exercise, onReplace, onRemove }: ExerciseCardProps) {
  const addSet = useSessionStore((s) => s.addSet)
  const volume = doneVolume(exercise)

  return (
    <Card data-testid={`exercise-card-${exIdx}`} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={onReplace}
          aria-label={`Replace ${exercise.exerciseName}`}
          className="text-left text-lg font-semibold text-text underline decoration-dotted underline-offset-4"
        >
          {exercise.exerciseName}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">{volume > 0 ? `${volume} vol` : '—'}</span>
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

      <div className="space-y-2">
        {exercise.sets.map((set, setIdx) => (
          <SetRow key={setIdx} exIdx={exIdx} setIdx={setIdx} set={set} hideWeight={exercise.kind === 'bodyweight'} />
        ))}
      </div>

      <Button variant="secondary" size="sm" fullWidth onClick={() => addSet(exIdx)}>
        + Add set
      </Button>
    </Card>
  )
}
