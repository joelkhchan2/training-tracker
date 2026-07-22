/** Formats a cardio session's pace as "m:ss" per kilometre from its total duration and
 *  distance. Returns null when distance is absent or non-positive (no meaningful pace) or
 *  when duration is absent. Rounds to whole seconds. Pure — no I/O, no React. */
export function formatPace(
  durationMinutes: number | null | undefined,
  distanceKm: number | null | undefined,
): string | null {
  if (durationMinutes == null || distanceKm == null || distanceKm <= 0) return null
  const secondsPerKm = Math.round((durationMinutes * 60) / distanceKm)
  const minutes = Math.floor(secondsPerKm / 60)
  const seconds = secondsPerKm % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
