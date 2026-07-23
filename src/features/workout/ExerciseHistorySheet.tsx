import { useAuth } from '../../lib/useAuth'
import { useExerciseHistory } from '../../data/exerciseHistory'
import { Sparkline } from './Sparkline'

export interface ExerciseHistorySheetProps {
  exerciseId: string
  exerciseName: string
  onClose: () => void
}

/** Bottom sheet showing an exercise's recent-session history: an e1RM trend
 *  sparkline plus a per-session breakdown (date · e1RM · volume · sets). */
export function ExerciseHistorySheet({ exerciseId, exerciseName, onClose }: ExerciseHistorySheetProps) {
  const { user } = useAuth()
  const { data: sessions = [], isLoading } = useExerciseHistory(exerciseId, user?.id)
  const e1rms = sessions.map((s) => s.e1rm).filter((v) => v > 0).reverse() // oldest→newest for the sparkline

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-surface p-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">{exerciseName}</h2>
          {e1rms.length > 1 ? <Sparkline values={e1rms} /> : null}
        </div>
        {isLoading ? (
          <p className="text-muted">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted">No history yet for this exercise.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.sessionId} className="rounded-xl border border-border bg-bg p-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-text">{s.date}</span>
                  <span className="text-muted">e1RM {s.e1rm} · {s.volume} vol</span>
                </div>
                <div className="mt-1 text-sm text-muted">
                  {s.sets
                    .filter((x) => x.weight != null && x.reps != null)
                    .map((x) => `${x.weight}×${x.reps}`)
                    .join(', ')}
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={onClose} className="w-full rounded-xl border border-border bg-bg py-3 text-text">
          Close
        </button>
      </div>
    </div>
  )
}
