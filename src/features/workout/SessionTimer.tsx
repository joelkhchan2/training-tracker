import { useEffect, useState } from 'react'

/** Formats elapsed seconds as m:ss, or h:mm:ss past an hour. */
// eslint-disable-next-line react-refresh/only-export-components
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

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
