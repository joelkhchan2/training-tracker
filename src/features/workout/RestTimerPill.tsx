import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn'
import { formatElapsed } from './formatElapsed'
import { useRestTimer } from './restTimer'

const PRESETS = [90, 120, 180, 300]

/** Floating rest-timer pill (manual-start). Drift-resistant countdown, presets, a custom
 *  minutes:seconds entry, +30s, and skip. Auto-hides while the mobile keyboard is open
 *  (guarded visualViewport heuristic). Rendered only while a timer is active. */
export function RestTimerPill() {
  const endAt = useRestTimer((s) => s.endAt)
  const remaining = useRestTimer((s) => s.remaining)
  const start = useRestTimer((s) => s.start)
  const addThirty = useRestTimer((s) => s.addThirty)
  const skip = useRestTimer((s) => s.skip)

  const [customMin, setCustomMin] = useState('')
  const [customSec, setCustomSec] = useState('')
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  // Recompute immediately when the tab regains visibility (drift after screen-lock).
  useEffect(() => {
    const onVis = () => useRestTimer.getState().tick()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Auto-hide while the on-screen keyboard is open so the pill doesn't cover inputs.
  // Guarded: visualViewport is undefined on desktop — skip the behavior there.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => setKeyboardOpen(vv.height < window.innerHeight * 0.7)
    vv.addEventListener('resize', onResize)
    onResize()
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  function startCustom() {
    const secs = (Number(customMin) || 0) * 60 + (Number(customSec) || 0)
    if (secs > 0) start(secs)
  }

  if (endAt == null || keyboardOpen) return null

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-24 z-30 mx-auto flex w-fit max-w-[95vw] flex-wrap items-center justify-center gap-2 rounded-2xl border px-3 py-2 shadow-lg',
        'border-border bg-surface',
        remaining <= 0 && 'animate-pulse border-danger',
      )}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span data-testid="rest-timer-remaining" className="w-14 text-center text-lg font-bold tabular-nums text-text">
        {formatElapsed(remaining)}
      </span>
      <div className="flex items-center gap-1">
        {PRESETS.map((p) => (
          <button key={p} type="button" onClick={() => start(p)} className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-bg">
            {formatElapsed(p)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input
          aria-label="Custom minutes"
          type="number"
          inputMode="numeric"
          min={0}
          value={customMin}
          onChange={(e) => setCustomMin(e.target.value)}
          placeholder="m"
          className="w-10 rounded-lg border border-border bg-bg px-1 py-1 text-center text-xs text-text"
        />
        <span className="text-xs text-muted">:</span>
        <input
          aria-label="Custom seconds"
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          value={customSec}
          onChange={(e) => setCustomSec(e.target.value)}
          placeholder="s"
          className="w-10 rounded-lg border border-border bg-bg px-1 py-1 text-center text-xs text-text"
        />
        <button type="button" onClick={startCustom} className="rounded-lg border border-border px-2 py-1 text-xs text-text">Set</button>
      </div>
      <button type="button" onClick={addThirty} className="rounded-lg border border-border px-2 py-1 text-xs text-text">+30s</button>
      <button type="button" onClick={skip} className="rounded-lg border border-border px-2 py-1 text-xs text-danger">Skip</button>
    </div>
  )
}
