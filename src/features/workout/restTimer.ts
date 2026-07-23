import { create } from 'zustand'

const LS_KEY = 'tt-rest-timer-seconds'
const DEFAULT_SECONDS = 120

function loadLast(): number {
  const v = Number(localStorage.getItem(LS_KEY))
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_SECONDS
}

/** Pure: seconds remaining until `endAt` (ms epoch) at time `now` (ms), clamped ≥ 0, ceil. */
export function computeRemaining(endAt: number | null, now: number): number {
  if (endAt == null) return 0
  return Math.max(0, Math.ceil((endAt - now) / 1000))
}

// The single tick interval lives at module scope (one owner), NOT in a component, so it
// survives re-renders. start() (re)creates it; skip()/expiry clear it; stop() (= skip) is
// called by WorkoutPage on Finish + unmount so nothing fires after leaving the workout.
let intervalId: ReturnType<typeof setInterval> | null = null
function clearTick() { if (intervalId) { clearInterval(intervalId); intervalId = null } }

interface RestTimerState {
  endAt: number | null
  remaining: number
  lastDuration: number
  start: (seconds?: number) => void
  addThirty: () => void
  skip: () => void
  tick: () => void
}

export const useRestTimer = create<RestTimerState>((set, get) => ({
  endAt: null,
  remaining: 0,
  lastDuration: loadLast(),
  start: (seconds) => {
    const dur = seconds ?? get().lastDuration
    localStorage.setItem(LS_KEY, String(dur))
    const endAt = Date.now() + dur * 1000
    set({ endAt, remaining: dur, lastDuration: dur })
    clearTick()
    intervalId = setInterval(() => get().tick(), 250)
  },
  addThirty: () => {
    if (get().endAt == null) return
    const base = Math.max(get().endAt ?? Date.now(), Date.now())
    const endAt = base + 30_000
    set({ endAt, remaining: computeRemaining(endAt, Date.now()) })
    if (intervalId == null) {
      clearTick()
      intervalId = setInterval(() => get().tick(), 250)
    }
  },
  skip: () => {
    clearTick()
    set({ endAt: null, remaining: 0 })
  },
  tick: () => {
    const endAt = get().endAt
    if (endAt == null) return
    const remaining = computeRemaining(endAt, Date.now())
    set({ remaining })
    if (remaining <= 0) {
      clearTick()
      navigator.vibrate?.([60, 40, 120])
      // keep endAt briefly so the pill shows 0:00 + pulse, then auto-clear (unless restarted)
      setTimeout(() => { if (get().endAt === endAt) set({ endAt: null }) }, 3000)
    }
  },
}))
