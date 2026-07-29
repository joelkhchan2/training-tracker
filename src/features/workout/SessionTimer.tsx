import { useEffect, useState } from 'react'
import { formatElapsed } from './formatElapsed'

/** Running elapsed clock since the session's ISO `startedAt`, ticking each second.
 *  Mounted in the workout header as a tappable button — the saved duration is computed
 *  at Finish from `startedAt`, so a drifted display is corrected via `onOpen`'s
 *  TimerPopup (Set/±1/Reset), not by directly editing this component's state. */
export function SessionTimer({ startedAt, onOpen }: { startedAt: string; onOpen: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const elapsed = (now - new Date(startedAt).getTime()) / 1000
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Adjust workout timer"
      className="text-sm font-medium tabular-nums text-muted"
    >
      {formatElapsed(elapsed)}
    </button>
  )
}
