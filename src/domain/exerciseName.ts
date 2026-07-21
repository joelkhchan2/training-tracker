/**
 * Hardened exercise-name normalizer (pure domain, no deps).
 *
 * Produces a deterministic key for detecting "obviously the same name written
 * differently" — wording variants (hyphenation, casing, plurals, word order)
 * — NOT semantic equipment-prefix duplicates like "Squat" vs "Barbell Back
 * Squat". Those are intentionally left uncollapsed: they are handled by a
 * curated `canonical_id` mapping elsewhere, because collapsing them here
 * would silently merge exercises that are not actually the same movement
 * (e.g. "Squat" could mean "Barbell Back Squat" or "Goblet Squat").
 *
 * Steps:
 *  1. Lowercase.
 *  2. Replace hyphens/punctuation with spaces (so "Pull-ups" ~ "Pull Ups").
 *  3. Collapse whitespace and split into tokens.
 *  4. Singularize each token conservatively: strip a trailing "es" or "s"
 *     if the token is longer than 3 characters. This is deliberately dumb —
 *     it does not handle irregular plurals (e.g. "calves" -> "calve", not
 *     "calf") because chasing every irregular is not worth the complexity
 *     for a boundary that's supposed to stay conservative. Irregulars that
 *     matter can be curated via `canonical_id` instead.
 *  5. Sort tokens (order shouldn't matter: "Bent Over Row" == "Row Bent Over").
 *  6. Join with a single space.
 */
export function hardNormalizeExerciseName(name: string): string {
  const lowered = name.toLowerCase()
  const noPunctuation = lowered.replace(/[^a-z0-9]+/g, ' ')
  const tokens = noPunctuation.split(' ').filter((token) => token.length > 0)
  const singularized = tokens.map(singularizeToken)
  singularized.sort()
  return singularized.join(' ')
}

/**
 * Conservative singularization: strip a trailing "es" or "s" from tokens
 * longer than 3 characters. Short tokens (e.g. "abs", "lat") are left alone
 * to avoid mangling words that aren't really plurals in this domain.
 */
function singularizeToken(token: string): string {
  if (token.length > 3 && token.endsWith('es')) {
    return token.slice(0, -2)
  }
  if (token.length > 3 && token.endsWith('s')) {
    return token.slice(0, -1)
  }
  return token
}
