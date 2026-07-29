import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { formatElapsed } from './formatElapsed'
import { shiftedStartedAt, startedAtForElapsed } from './timerMath'
import { useSessionStore } from './sessionStore'

export interface TimerPopupProps {
  onClose: () => void
}

/** Centered popup (opened from SessionTimer) for correcting the running session timer,
 *  whose elapsed display drifts because it's pure wall-clock since `startedAt` and never
 *  pauses. Every control here writes a new `startedAt` via `setStartedAt` — elapsed is
 *  always *derived* from `startedAt`, so correcting it here also corrects the live
 *  SessionTimer display and the Finish-time `duration_minutes` (both re-derive from the
 *  same `startedAt`), with no separate "elapsed" field to keep in sync. */
export function TimerPopup({ onClose }: TimerPopupProps) {
  const startedAt = useSessionStore((s) => s.startedAt)
  const setStartedAt = useSessionStore((s) => s.setStartedAt)
  const [now, setNow] = useState(() => Date.now())
  const [minutes, setMinutes] = useState(() =>
    startedAt ? Math.round((Date.now() - new Date(startedAt).getTime()) / 60000) : 0,
  )

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // No active session (shouldn't happen — SessionTimer/onOpen only exist while startedAt
  // is set — but guards a stray render, e.g. Finish completing while the popup is open).
  if (!startedAt) return null

  const elapsedSeconds = (now - new Date(startedAt).getTime()) / 1000

  function handleSetExact() {
    setStartedAt(startedAtForElapsed(Date.now(), minutes * 60))
  }
  function handleShift(deltaSeconds: number) {
    setStartedAt(shiftedStartedAt(startedAt as string, Date.now(), deltaSeconds))
  }
  function handleReset() {
    setStartedAt(startedAtForElapsed(Date.now(), 0))
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Adjust workout timer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-border bg-surface p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-text">Workout timer</h2>
        <p className="text-sm text-muted">
          Elapsed: <span className="tabular-nums text-text">{formatElapsed(elapsedSeconds)}</span>
        </p>

        <NumberField label="Set exact minutes" value={minutes} onChange={setMinutes} min={0} />
        <Button fullWidth variant="secondary" onClick={handleSetExact}>
          Set
        </Button>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => handleShift(60)}>
            +1 min
          </Button>
          <Button variant="secondary" onClick={() => handleShift(-60)}>
            −1 min
          </Button>
        </div>

        <Button variant="secondary" fullWidth onClick={handleReset}>
          Reset
        </Button>

        <Button fullWidth onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}
