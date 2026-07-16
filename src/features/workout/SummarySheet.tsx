import type { DetectedPR, PrType } from '../../domain'
import { Button } from '../../components/ui/Button'

export interface SummarySheetProps {
  tonnage: number
  setCount: number
  exerciseCount: number
  prs: DetectedPR[]
  onClose: () => void
}

const PR_LABELS: Record<PrType, string> = {
  e1rm: 'e1RM',
  volume: 'volume',
  max_v_grade: 'max V-grade',
}

/** e.g. "🎉 Squat — new e1RM 265 (was 250)", or without the "(was …)" clause
 *  when there was no prior record for that exercise/type. */
function formatPr(pr: DetectedPR): string {
  const label = PR_LABELS[pr.prType]
  const was = pr.oldValue != null ? ` (was ${pr.oldValue})` : ''
  return `🎉 ${pr.exerciseName} — new ${label} ${pr.newValue}${was}`
}

/** Post-save confirmation: total tonnage, set/exercise counts, and any
 *  newly detected PRs. Sits above the page as a bottom sheet on mobile,
 *  a centered dialog on larger screens. Closing resets the session. */
export function SummarySheet({ tonnage, setCount, exerciseCount, prs, onClose }: SummarySheetProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Workout summary"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
    >
      <div
        className="w-full max-w-md space-y-4 rounded-t-2xl border border-border bg-surface p-6 sm:rounded-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        <h2 className="text-xl font-semibold text-text">Workout complete</h2>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border border-border bg-bg p-3">
            <div className="text-lg font-bold text-text">{tonnage.toLocaleString()}</div>
            <div className="text-xs text-muted">tonnage</div>
          </div>
          <div className="rounded-xl border border-border bg-bg p-3">
            <div className="text-lg font-bold text-text">{setCount}</div>
            <div className="text-xs text-muted">sets</div>
          </div>
          <div className="rounded-xl border border-border bg-bg p-3">
            <div className="text-lg font-bold text-text">{exerciseCount}</div>
            <div className="text-xs text-muted">exercises</div>
          </div>
        </div>

        {prs.length > 0 ? (
          <ul className="space-y-1">
            {prs.map((pr, i) => (
              <li key={`${pr.exerciseName}-${pr.prType}-${i}`} className="text-sm font-medium text-text">
                {formatPr(pr)}
              </li>
            ))}
          </ul>
        ) : null}

        <Button fullWidth onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}
