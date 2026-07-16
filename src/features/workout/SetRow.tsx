import { NumberField } from '../../components/ui/NumberField'
import { cn } from '../../lib/cn'
import { useSessionStore } from './sessionStore'
import type { SessionSet } from './sessionStore'

export interface SetRowProps {
  exIdx: number
  setIdx: number
  set: SessionSet
}

/** One editable set within an exercise: weight + reps entry, a done toggle,
 *  and a remove action. Sized for mid-workout, sweaty-hands tapping — every
 *  interactive control here is at least 48px. */
export function SetRow({ exIdx, setIdx, set }: SetRowProps) {
  const updateSet = useSessionStore((s) => s.updateSet)
  const toggleDone = useSessionStore((s) => s.toggleDone)
  const removeSet = useSessionStore((s) => s.removeSet)

  const setNumber = setIdx + 1

  return (
    <div
      data-testid={`set-row-${exIdx}-${setIdx}`}
      className={cn(
        'flex items-end gap-2 rounded-xl p-2 transition-colors',
        set.done && 'bg-accent/10',
      )}
    >
      <div className="flex w-12 shrink-0 flex-col items-start gap-1 pb-3">
        <span className="text-sm font-medium text-muted">Set {setNumber}</span>
        {set.isFsl ? (
          <span className="inline-flex rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
            FSL
          </span>
        ) : null}
      </div>

      <NumberField
        label="Weight"
        value={set.weight ?? 0}
        onChange={(weight) => updateSet(exIdx, setIdx, { weight })}
        step={5}
        className="flex-1"
      />
      <NumberField
        label="Reps"
        value={set.reps ?? 0}
        onChange={(reps) => updateSet(exIdx, setIdx, { reps })}
        className="flex-1"
      />

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
  )
}
