import { getSupabase } from './supabase'

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
 * rows in one query (RLS enforces that scope regardless), matching by
 * normalized name. Any name with no match gets a brand-new user-owned
 * custom exercise row (`is_active: true`, `exercise_type: 'weighted'`) —
 * both reads and this insert are allowed by the `exercises` RLS policies
 * without a service role.
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
    .select('id, name')
    .or(`user_id.is.null,user_id.eq.${userId}`)
  if (error) throw error

  const byNormalized = new Map<string, string>()
  for (const row of (data ?? []) as { id: string; name: string }[]) {
    byNormalized.set(normalizeName(row.name), row.id)
  }

  for (const name of uniqueNames) {
    const key = normalizeName(name)
    const existingId = byNormalized.get(key)
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
    byNormalized.set(key, newId)
    result.set(name, newId)
  }

  return result
}
