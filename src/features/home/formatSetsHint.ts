import type { PrescribedSet } from '../../domain/types'
import { formatDuration } from '../../domain/duration'
import { formatWeight, type WeightUnit } from '../../domain/weight'

/** Compact, readable summary of a prescribed exercise's sets, e.g.
 *  "6×5 @ 135/155/175" for reps, or "4×0:08" for a timed scheme. Consecutive sets
 *  sharing the same target (reps, or duration for a timed scheme) are grouped
 *  together. Weights render through `formatWeight` in the caller's unit. */
export function formatSetsHint(sets: PrescribedSet[], unit: WeightUnit): string {
  const groups: { reps?: number; durationSeconds?: number; count: number; weights: number[] }[] = []
  for (const s of sets) {
    const last = groups[groups.length - 1]
    if (last && last.reps === s.reps && last.durationSeconds === s.durationSeconds) {
      last.count += 1
      if (s.weight != null) last.weights.push(s.weight)
    } else {
      groups.push({ reps: s.reps, durationSeconds: s.durationSeconds, count: 1, weights: s.weight != null ? [s.weight] : [] })
    }
  }
  return groups
    .map(g => {
      const weightPart = g.weights.length > 0 ? ` @ ${[...new Set(g.weights)].map(w => formatWeight(w, unit)).join('/')}` : ''
      const target = g.durationSeconds != null ? formatDuration(g.durationSeconds) : g.reps
      return `${g.count}×${target}${weightPart}`
    })
    .join(', ')
}
