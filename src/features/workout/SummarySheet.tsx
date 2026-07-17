import type { DetectedPR, LinearProgressionAction, PrType } from '../../domain'
import { Button } from '../../components/ui/Button'

/** Post-save progression result for one linear-scheme lift, ready for display. Built by
 *  `WorkoutPage` from `useSaveWorkout`'s `progressionOutcomes` (exerciseName/action/nextWeight
 *  only) plus the pre-save working weight/fails it already had from the active-workout bundle,
 *  since the mutation result alone doesn't carry the "before" values needed to show a delta. */
export interface ProgressionOutcomeDisplay {
  exerciseName: string
  action: LinearProgressionAction
  previousWeight: number
  nextWeight: number
  /** Consecutive fails after this session, only known/shown for a 'hold'. */
  fails?: number
  failsBeforeDeload?: number
}

export interface SummarySheetProps {
  tonnage: number
  setCount: number
  exerciseCount: number
  prs: DetectedPR[]
  progressionOutcomes?: ProgressionOutcomeDisplay[]
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

/** e.g. "Squat 100 → 105 (+5)" for an increase, "Bench Press held (2/3 fails)" for a hold
 *  (or plain "held" when the fails count isn't known), "Deadlift deload → 90" for a deload. */
function formatProgressionOutcome(outcome: ProgressionOutcomeDisplay): string {
  const { exerciseName, action, previousWeight, nextWeight, fails, failsBeforeDeload } = outcome

  if (action === 'increase' || action === 'increase-double') {
    const delta = nextWeight - previousWeight
    const sign = delta >= 0 ? '+' : ''
    return `${exerciseName} ${previousWeight} → ${nextWeight} (${sign}${delta})`
  }
  if (action === 'deload') {
    return `${exerciseName} deload → ${nextWeight}`
  }
  const failsPart = fails != null && failsBeforeDeload != null ? ` (${fails}/${failsBeforeDeload} fails)` : ''
  return `${exerciseName} held${failsPart}`
}

/** Post-save confirmation: total tonnage, set/exercise counts, any newly detected PRs, and
 *  each linear-progression lift's outcome for next time. Sits above the page as a bottom
 *  sheet on mobile, a centered dialog on larger screens. Closing resets the session. */
export function SummarySheet({
  tonnage,
  setCount,
  exerciseCount,
  prs,
  progressionOutcomes = [],
  onClose,
}: SummarySheetProps) {
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

        {progressionOutcomes.length > 0 ? (
          <ul className="space-y-1">
            {progressionOutcomes.map((outcome, i) => (
              <li key={`${outcome.exerciseName}-${i}`} className="text-sm font-medium text-text">
                {formatProgressionOutcome(outcome)}
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
