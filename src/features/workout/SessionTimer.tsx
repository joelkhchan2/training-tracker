import { useEffect, useState } from 'react'
import { formatElapsed } from './formatElapsed'

/** Running elapsed clock since the session's ISO `startedAt`, ticking each second.
 *  Mounted in the workout header; read-only (the saved duration is computed at Finish). */
export function SessionTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const elapsed = (now - new Date(startedAt).getTime()) / 1000
  return <span className="text-sm font-medium tabular-nums text-muted">{formatElapsed(elapsed)}</span>
}
