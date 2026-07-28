/** Pure mm:ss formatting/parsing + input-type inference for exercises logged by duration
 *  (front lever holds, dead hangs, planks, weighted hangs) — shared by DurationField
 *  (live entry), the WorkoutPage save path, and session-detail/history rendering. */

/** Canonical display format: minutes unbounded, seconds always 2-digit zero-padded
 *  ("0:45", "1:30", "12:05"). Negative/fractional input is clamped/rounded away — a
 *  duration is always a non-negative whole number of seconds by the time it gets here. */
export function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

/** Parses a DurationField buffer into total seconds, or null when the buffer is empty or
 *  not yet a complete, valid duration:
 *  - Contains a colon → split into minutes:seconds; both parts must be whole numbers and
 *    the seconds part must be 0-59, or the whole buffer is invalid (null).
 *  - No colon → the whole buffer is total seconds ("90" → 90s) — lets a short hold be
 *    typed without the colon.
 *  - Empty (after trim) → null (the caller treats this as "erase the value", not "invalid"). */
export function parseDurationInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':')
    if (parts.length !== 2) return null
    const [minPart, secPart] = parts
    if (!/^\d+$/.test(minPart) || !/^\d+$/.test(secPart)) return null
    const minutes = Number(minPart)
    const seconds = Number(secPart)
    if (seconds < 0 || seconds > 59) return null
    return minutes * 60 + seconds
  }

  if (!/^\d+$/.test(trimmed)) return null
  return Number(trimmed)
}
