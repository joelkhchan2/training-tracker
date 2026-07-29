/** Pure elapsed<->startedAt math for the workout session timer (SessionTimer/TimerPopup).
 *  No React, no store — extracted so it needs no `get` inside sessionStore and is
 *  unit-testable without stubbing Date.now there. Both helpers clamp elapsed seconds to
 *  >= 0: the timer never runs "negative". Callers always pass `Date.now()` for `nowMs`. */

/** The ISO startedAt that produces exactly `seconds` of elapsed time at `nowMs`. */
export function startedAtForElapsed(nowMs: number, seconds: number): string {
  return new Date(nowMs - Math.max(0, seconds) * 1000).toISOString()
}

/** The ISO startedAt after shifting the current elapsed time (derived from `startedAt`
 *  and `nowMs`) by `deltaSeconds` — positive lengthens elapsed (earlier start), negative
 *  shortens it (later start) — clamped so elapsed never drops below 0. */
export function shiftedStartedAt(startedAt: string, nowMs: number, deltaSeconds: number): string {
  const currentElapsedSeconds = (nowMs - new Date(startedAt).getTime()) / 1000
  return startedAtForElapsed(nowMs, Math.max(0, currentElapsedSeconds + deltaSeconds))
}
