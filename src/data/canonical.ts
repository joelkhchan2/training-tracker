/** The subset of an `exercises` row the canonicalization helpers below need.
 *  Callers must select `canonical_id` alongside `id`/`name` — see the
 *  warning on each resolver's catalog-read `.select()` call. */
export interface CanonicalizableRow {
  id: string
  name: string
  canonical_id: string | null
}

/**
 * Resolves a catalog row to the id callers should actually use: its own id
 * if it's canonical (`canonical_id: null`), or the canonical row it points
 * at if it's an alias. This is the one place "which id wins" is decided —
 * every resolver match (weak or hard) must be passed through this before
 * being returned, so an alias name always resolves to its canonical id
 * rather than minting/reusing a separate row for the alias itself.
 */
export function followCanonical(row: CanonicalizableRow): string {
  return row.canonical_id ?? row.id
}

/**
 * Builds the hardened-name -> canonical-id lookup used as the second-pass
 * match before minting a new row (weak/exact normalization is tried first
 * by each resolver; this is the fallback for wording variants like
 * hyphenation, casing, plurals, or word order that the weak normalizer
 * doesn't catch).
 *
 * A hard key is stored ONLY when every row that normalizes to it agrees on
 * the same `followCanonical()` id. If two DISTINCT canonical exercises
 * happen to collide on a hard key (e.g. two separately-curated lifts whose
 * names normalize the same way), that key is dropped entirely — so a name
 * that only hard-matches falls through to mint a new row instead of being
 * silently resolved to an arbitrary one of the two candidates.
 */
export function buildHardKeyMap(
  rows: CanonicalizableRow[],
  hardNormalize: (name: string) => string,
): Map<string, string> {
  const idsByKey = new Map<string, Set<string>>()
  for (const row of rows) {
    const key = hardNormalize(row.name)
    const canonicalId = followCanonical(row)
    const ids = idsByKey.get(key) ?? new Set<string>()
    ids.add(canonicalId)
    idsByKey.set(key, ids)
  }

  const result = new Map<string, string>()
  for (const [key, ids] of idsByKey) {
    if (ids.size === 1) {
      result.set(key, [...ids][0])
    }
  }
  return result
}
