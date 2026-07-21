import { getSupabase } from './supabase'
import { hardNormalizeExerciseName } from '../domain'
import { buildHardKeyMap, followCanonical, type CanonicalizableRow } from './canonical'

/** trim + collapse internal whitespace + lowercase, for use as a map key.
 *  Mirrors scripts/migration/transform/exercises.ts's normalizeName so
 *  activation resolves to the same catalog rows the seed migration uses. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Resolves preset exercise names to `exercises.id` for `userId`.
 *
 * Reads the global catalog (`user_id is null`) plus the user's own custom
 * rows in one query (RLS enforces that scope regardless), matching first by
 * normalized name and, failing that, by `hardNormalizeExerciseName` (catches
 * wording variants like hyphenation/casing/plurals/word-order that the weak
 * normalizer misses). Any match — weak or hard — is followed through
 * `followCanonical()`, so an alias row resolves to its canonical exercise's
 * id rather than the alias's own id. Any name with no match at all gets a
 * brand-new user-owned custom exercise row (`is_active: true`,
 * `exercise_type: 'weighted'`) — both reads and this insert are allowed by
 * the `exercises` RLS policies without a service role.
 *
 * Returns verbatim (non-normalized) name -> id, since callers look up by
 * the preset's own exercise names.
 */
export async function resolveExerciseIds(names: string[], userId: string): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const uniqueNames = [...new Set(names)]
  if (uniqueNames.length === 0) return result

  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('exercises')
    // canonical_id is required here, not just id/name: followCanonical()
    // below reads it to map an alias row to its canonical id. Omitting it
    // from this select is a silent bug — every row comes back with
    // canonical_id undefined, followCanonical() falls back to the alias's
    // own id every time, and no mocked test catches it unless the mock
    // itself is asked to honor the requested columns.
    .select('id, name, canonical_id')
    .or(`user_id.is.null,user_id.eq.${userId}`)
  if (error) throw error

  const rows = (data ?? []) as CanonicalizableRow[]

  const byWeak = new Map<string, string>()
  for (const row of rows) {
    byWeak.set(normalizeName(row.name), followCanonical(row))
  }
  const byHard = buildHardKeyMap(rows, hardNormalizeExerciseName)

  for (const name of uniqueNames) {
    const weakKey = normalizeName(name)
    const existingId = byWeak.get(weakKey) ?? byHard.get(hardNormalizeExerciseName(name))
    if (existingId) {
      result.set(name, existingId)
      continue
    }

    const { data: inserted, error: insertError } = await supabase
      .from('exercises')
      .insert({ user_id: userId, name, is_active: true, exercise_type: 'weighted' })
      .select('id')
      .single()
    if (insertError) throw insertError

    const newId = (inserted as { id: string }).id
    byWeak.set(weakKey, newId)
    result.set(name, newId)
  }

  return result
}
