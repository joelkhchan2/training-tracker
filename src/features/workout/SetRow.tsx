import { DurationField } from '../../components/ui/DurationField'
import { NumberField } from '../../components/ui/NumberField'
import { cn } from '../../lib/cn'
import { usePrefs } from '../settings/usePrefs'
import { useSessionStore } from './sessionStore'
import type { ExerciseInputType, SessionSet } from './sessionStore'

export interface SetRowProps {
  exIdx: number
  setIdx: number
  set: SessionSet
  /** Which fields this exercise's sets are logged with. Drives whether Weight/Reps/
   *  Duration render, and gates the AMRAP/FSL badges — meaningless outside 'weighted'
   *  (there's no reps target to compare a duration against). */
  inputType: ExerciseInputType
}

/** One editable set within an exercise: the fields `inputType` calls for, a done toggle,
 *  and a remove action. Sized for mid-workout, sweaty-hands tapping — every interactive
 *  control here is at least 48px. */
export function SetRow({ exIdx, setIdx, set, inputType }: SetRowProps) {
  const updateSet = useSessionStore((s) => s.updateSet)
  const toggleDone = useSessionStore((s) => s.toggleDone)
  const removeSet = useSessionStore((s) => s.removeSet)
  const showRpe = usePrefs((s) => s.showRpe)

  const setNumber = setIdx + 1
  const showWeight = inputType === 'weighted' || inputType === 'weighted_time'
  const showDuration = inputType === 'timed' || inputType === 'weighted_time'
  const showBadges = inputType === 'weighted'

  return (
    <div
      data-testid={`set-row-${exIdx}-${setIdx}`}
      className={cn('flex flex-col gap-1 rounded-xl px-2 py-1 transition-colors', set.done && 'bg-accent/10')}
    >
      {set.isAmrap && showBadges ? (
        <span className="ml-12 inline-flex w-fit items-center rounded-full border border-danger bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
          AMRAP &middot; target {set.targetReps}
        </span>
      ) : null}

      {/* Grid, not flex: fixed 3rem tracks for the set label + done/remove buttons, and
          minmax(0,1fr) tracks for the weight/reps-or-duration fields. The 5-col template
          (weighted/weighted_time) vs 4-col template (bodyweight/timed) is a content swap
          inside the same two grids — not a new layout. */}
      <div
        className={cn(
          'grid items-end gap-1.5',
          showWeight
            ? 'grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_3rem_3rem]'
            : 'grid-cols-[3rem_minmax(0,1fr)_3rem_3rem]',
        )}
      >
        <div className="flex flex-col items-start gap-1 pb-3">
          <span className="text-sm font-medium text-muted">Set {setNumber}</span>
          {set.isFsl && showBadges ? (
            <span className="inline-flex rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
              FSL
            </span>
          ) : null}
        </div>

        {showWeight ? (
          <NumberField
            label="Weight"
            value={set.weight ?? 0}
            onChange={(weight) => updateSet(exIdx, setIdx, { weight })}
            step={5}
            hideSteppers
            inputClassName="text-xl font-bold"
          />
        ) : null}

        {showDuration ? (
          <DurationField
            label="Duration"
            valueSeconds={set.durationSeconds}
            onChange={(durationSeconds) => updateSet(exIdx, setIdx, { durationSeconds })}
            inputClassName="text-xl font-bold"
          />
        ) : (
          <NumberField
            label="Reps"
            value={set.reps ?? 0}
            onChange={(reps) => updateSet(exIdx, setIdx, { reps })}
            hideSteppers
            inputClassName="text-xl font-bold"
          />
        )}

        <button
          type="button"
          onClick={() => toggleDone(exIdx, setIdx)}
          aria-pressed={set.done}
          aria-label={`Set ${setNumber} done`}
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-xl font-bold',
            'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            set.done
              ? 'border-accent bg-accent text-accent-fg'
              : 'border-border bg-surface text-muted hover:bg-surface-hover',
          )}
        >
          ✓
        </button>

        <button
          type="button"
          onClick={() => removeSet(exIdx, setIdx)}
          aria-label={`Remove set ${setNumber}`}
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface',
            'text-xl font-bold text-danger transition-colors hover:bg-surface-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          )}
        >
          &minus;
        </button>
      </div>

      <div className="flex items-center gap-2 pl-14">
        <button
          type="button"
          onClick={() => updateSet(exIdx, setIdx, { isWarmup: !set.isWarmup })}
          aria-pressed={Boolean(set.isWarmup)}
          aria-label={`Warmup set ${setNumber}`}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
            set.isWarmup ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-surface text-muted',
          )}
        >
          Warmup
        </button>
        {showRpe ? (
          <label className="flex items-center gap-1 text-xs text-muted">
            RPE
            <select
              aria-label="RPE"
              value={set.rpe ?? ''}
              onChange={(e) => updateSet(exIdx, setIdx, { rpe: e.target.value === '' ? null : Number(e.target.value) })}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="">&mdash;</option>
              {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  )
}
