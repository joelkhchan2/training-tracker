import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { WeightField } from '../../components/ui/WeightField'
import { useUpdateTrainingMaxes } from '../../data/trainingMaxes'
import type { TrainingMaxEdit } from '../../data/trainingMaxes'
import { labelForKey } from './tmLabels'

export interface TrainingMaxSheetProps {
  /** The tmKeys the active program actually uses (percentage lifts), in display order. */
  keys: string[]
  /** Current training maxes on file, in lb, keyed by tmKey. Missing = not set yet (shown as 0). */
  current: Record<string, number>
  onClose: () => void
}

/**
 * Edit the training maxes that drive every percentage-scheme lift. One big-number field per
 * lift, prefilled from the values on file. Only changed lifts are written (each carries its
 * previous value into `prev_value`); saving with nothing changed just closes. On success the
 * active-workout bundle is invalidated, so the next session's prescribed weights recalculate
 * from the new maxes.
 */
export function TrainingMaxSheet({ keys, current, onClose }: TrainingMaxSheetProps) {
  const updateMaxes = useUpdateTrainingMaxes()
  const [maxes, setMaxes] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const key of keys) out[key] = current[key] ?? 0
    return out
  })
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const changed = keys.filter((key) => (maxes[key] ?? 0) !== (current[key] ?? 0))
  // Every edited lift must be a real, positive weight — a 0 would zero out that lift's whole
  // prescription. Unchanged lifts (including any left at 0) don't block saving.
  const allChangedValid = changed.every((key) => (maxes[key] ?? 0) > 0)
  const canSave = changed.length > 0 && allChangedValid && !updateMaxes.isPending

  function handleSave() {
    setErrorMsg(null)
    const updates: TrainingMaxEdit[] = changed.map((key) => ({
      key,
      value: maxes[key],
      prevValue: current[key] ?? null,
    }))
    updateMaxes.mutate(
      { updates },
      {
        onSuccess: () => onClose(),
        onError: (err) => setErrorMsg(err.message || 'Could not save your training maxes. Please try again.'),
      },
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit training maxes"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
    >
      <div
        className="w-full max-w-md space-y-4 rounded-t-2xl border border-border bg-surface p-6 sm:rounded-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        <h2 className="text-xl font-semibold text-text">Training maxes</h2>
        <p className="text-sm text-muted">
          The weight each lift&rsquo;s percentages are calculated from — usually about 90% of your true 1-rep max.
          Update it after you test a new max or want to adjust.
        </p>

        <div className="space-y-3">
          {keys.map((key) => (
            <WeightField
              key={key}
              label={labelForKey(key)}
              valueLb={maxes[key] ?? 0}
              onChangeLb={(value) => setMaxes((prev) => ({ ...prev, [key]: value }))}
              stepLb={5}
              min={0}
              disabled={updateMaxes.isPending}
            />
          ))}
        </div>

        {errorMsg ? (
          <p role="alert" className="text-sm text-danger">
            {errorMsg}
          </p>
        ) : null}

        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={updateMaxes.isPending}>
            Cancel
          </Button>
          <Button fullWidth onClick={handleSave} disabled={!canSave}>
            {updateMaxes.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
