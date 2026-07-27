export interface CandidateExercise {
  id: string
  name: string
  exerciseType: string | null
  primaryMuscles: string | null
  movementPattern: string | null
}

export interface AlternateExercise {
  id: string
  name: string
  exerciseType: string | null
  sharedCount: number
}

/** Tokenize a comma free-text muscle string into a normalized set (lowercase, trimmed, no empties). */
export function muscleTokens(primaryMuscles: string | null): Set<string> {
  if (!primaryMuscles) return new Set()
  return new Set(primaryMuscles.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
}

/** Pure: rank candidates that share ≥1 (primary+secondary) muscle token with `current`, by shared
 *  count desc, then same movement_pattern, then name asc; exclude the current exercise by id and
 *  zero-overlap candidates; cap at `limit`. Empty when current is null or has no tokens. */
export function suggestAlternates(
  current: CandidateExercise | null,
  candidates: CandidateExercise[],
  limit = 6,
): AlternateExercise[] {
  if (!current) return []
  const cur = muscleTokens(current.primaryMuscles)
  if (cur.size === 0) return []
  const scored: (AlternateExercise & { samePattern: boolean })[] = []
  for (const c of candidates) {
    if (c.id === current.id) continue
    let shared = 0
    for (const t of muscleTokens(c.primaryMuscles)) if (cur.has(t)) shared++
    if (shared === 0) continue
    scored.push({
      id: c.id, name: c.name, exerciseType: c.exerciseType, sharedCount: shared,
      samePattern: c.movementPattern != null && c.movementPattern === current.movementPattern,
    })
  }
  scored.sort((a, b) =>
    b.sharedCount - a.sharedCount ||
    (Number(b.samePattern) - Number(a.samePattern)) ||
    a.name.localeCompare(b.name),
  )
  return scored.slice(0, limit).map((s) => ({ id: s.id, name: s.name, exerciseType: s.exerciseType, sharedCount: s.sharedCount }))
}
