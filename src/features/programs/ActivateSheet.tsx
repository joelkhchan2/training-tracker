import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import type { PresetMeta } from '../../domain/presets'
import { useActivateProgram } from '../../data/activateProgram'

export interface ActivateSheetProps {
  preset: PresetMeta
  /** The user's existing training maxes (from the active-workout bundle, if any),
   *  used to prefill the maxes form so switching/re-activating a %-based program
   *  doesn't force re-entering numbers already on file. */
  existingTrainingMaxes?: Record<string, number>
  onClose: () => void
}

/** Friendly labels for the `tmKeys` used by percentage-based presets. Falls back to
 *  the raw key for any future key this map hasn't been updated for. */
const TM_LABELS: Record<string, string> = {
  squat: 'Squat',
  benchPress: 'Bench Press',
  barbellDeadlift: 'Deadlift',
  overheadPress: 'Overhead Press',
}

function labelForKey(key: string): string {
  return TM_LABELS[key] ?? key
}

function initialMaxes(preset: PresetMeta, existing?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of preset.tmKeys) out[key] = existing?.[key] ?? 0
  return out
}

function initialStartingWeights(preset: PresetMeta): Record<string, number> {
  const out: Record<string, number> = {}
  for (const lift of preset.startingWeightLifts) out[lift.exerciseName] = 0
  return out
}

/**
 * Confirmation step between "Use this program" and it actually going live.
 * Percentage-based presets (`requiresTrainingMaxes`) get a big-number form for
 * each `tmKey`, prefilled from the user's existing maxes when available; linear-
 * progression presets (`requiresStartingWeights`) get a big-number form for each
 * `startingWeightLifts` entry instead (a preset never needs both); every other
 * preset skips straight to a plain confirm. Either way, "Activate" calls
 * `useActivateProgram` and — on success — navigates Home, where the invalidated
 * `activeWorkout` query picks up the newly-cloned program. On error the entered
 * values stay put so the user can just retry rather than re-typing everything.
 */
export function ActivateSheet({ preset, existingTrainingMaxes, onClose }: ActivateSheetProps) {
  const navigate = useNavigate()
  const activateProgram = useActivateProgram()
  const [maxes, setMaxes] = useState<Record<string, number>>(() => initialMaxes(preset, existingTrainingMaxes))
  const [startingWeights, setStartingWeights] = useState<Record<string, number>>(() => initialStartingWeights(preset))
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const needsMaxes = preset.requiresTrainingMaxes
  const needsStartingWeights = preset.requiresStartingWeights
  const canActivate =
    (!needsMaxes || preset.tmKeys.every(key => (maxes[key] ?? 0) > 0)) &&
    (!needsStartingWeights || preset.startingWeightLifts.every(lift => (startingWeights[lift.exerciseName] ?? 0) > 0))

  function handleActivate() {
    setErrorMsg(null)
    activateProgram.mutate(
      {
        preset,
        trainingMaxes: needsMaxes ? maxes : {},
        startingWeights: needsStartingWeights ? startingWeights : {},
      },
      {
        onSuccess: () => navigate('/'),
        onError: (err) => setErrorMsg(err.message || 'Could not activate this program. Please try again.'),
      },
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Activate program"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
    >
      <div
        className="w-full max-w-md space-y-4 rounded-t-2xl border border-border bg-surface p-6 sm:rounded-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        <h2 className="text-xl font-semibold text-text">Activate {preset.name}?</h2>

        {needsMaxes ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Enter your current training maxes — percentages for each session are calculated from these.
            </p>
            {preset.tmKeys.map(key => (
              <NumberField
                key={key}
                label={labelForKey(key)}
                value={maxes[key] ?? 0}
                onChange={(value) => setMaxes(prev => ({ ...prev, [key]: value }))}
                step={5}
                disabled={activateProgram.isPending}
              />
            ))}
          </div>
        ) : needsStartingWeights ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Enter your starting weight for each lift — linear progression begins from here.
            </p>
            {preset.startingWeightLifts.map(lift => (
              <NumberField
                key={lift.exerciseName}
                label={lift.label}
                value={startingWeights[lift.exerciseName] ?? 0}
                onChange={(value) => setStartingWeights(prev => ({ ...prev, [lift.exerciseName]: value }))}
                step={5}
                disabled={activateProgram.isPending}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">This will replace your current active program.</p>
        )}

        {errorMsg ? (
          <p role="alert" className="text-sm text-danger">
            {errorMsg}
          </p>
        ) : null}

        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={activateProgram.isPending}>
            Cancel
          </Button>
          <Button fullWidth onClick={handleActivate} disabled={!canActivate || activateProgram.isPending}>
            {activateProgram.isPending ? 'Activating…' : 'Activate'}
          </Button>
        </div>
      </div>
    </div>
  )
}
