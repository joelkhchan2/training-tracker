import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/useAuth'
import { useExerciseHistory } from '../../data/exerciseHistory'
import type { ExerciseHistorySession } from '../../data/exerciseHistory'
import { SetRow } from './SetRow'
import { ExerciseHistorySheet } from './ExerciseHistorySheet'
import { useSessionStore } from './sessionStore'
import type { SessionExercise } from './sessionStore'

export interface ExerciseCardProps {
  exIdx: number
  exercise: SessionExercise
  exerciseId: string | null
  onReplace: () => void
  onRemove: () => void
}

/** Running volume (Σ weight × reps) across this exercise's completed sets —
 *  a quick "how much did I actually move" signal while logging. Sets with
 *  no weight (e.g. bodyweight) or not yet marked done don't count. */
function doneVolume(exercise: SessionExercise): number {
  return exercise.sets.reduce((total, s) => {
    if (!s.done || s.weight == null || s.reps == null || s.isWarmup) return total
    return total + s.weight * s.reps
  }, 0)
}

/** Formats the heaviest non-warmup set of a history session as "W×R", for the
 *  "last time" hint. Returns null if the session has no qualifying set. */
function topSet(session: ExerciseHistorySession): string | null {
  let best: { weight: number; reps: number } | null = null
  for (const s of session.sets) {
    if (s.isWarmup || s.weight == null || s.reps == null) continue
    if (!best || s.weight > best.weight) best = { weight: s.weight, reps: s.reps }
  }
  return best ? `${best.weight}×${best.reps}` : null
}

/** One exercise within the active session: header, a running volume hint,
 *  its editable SetRows, and a control to add another set. */
export function ExerciseCard({ exIdx, exercise, exerciseId, onReplace, onRemove }: ExerciseCardProps) {
  const addSet = useSessionStore((s) => s.addSet)
  const volume = doneVolume(exercise)
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: exercise.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const [historyOpen, setHistoryOpen] = useState(false)
  const { user } = useAuth()
  const { data: history } = useExerciseHistory(exerciseId, user?.id)
  const last = history?.[0]
  const lastTop = last ? topSet(last) : null

  return (
    <div ref={setNodeRef} style={style}>
      <Card data-testid={`exercise-card-${exIdx}`} className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <button
            type="button"
            aria-label={`Reorder ${exercise.exerciseName}`}
            className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
          <button
            type="button"
            onClick={onReplace}
            aria-label={`Replace ${exercise.exerciseName}`}
            className="flex-1 truncate text-left text-lg font-semibold text-text underline decoration-dotted underline-offset-4"
          >
            {exercise.exerciseName}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">{volume > 0 ? `${volume} vol` : '—'}</span>
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

        {last && lastTop ? (
          <p className="text-xs text-muted">
            last: {lastTop} · {last.date}
          </p>
        ) : null}

        <div className="space-y-2">
          {exercise.sets.map((set, setIdx) => (
            <SetRow key={setIdx} exIdx={exIdx} setIdx={setIdx} set={set} hideWeight={exercise.kind === 'bodyweight'} />
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
