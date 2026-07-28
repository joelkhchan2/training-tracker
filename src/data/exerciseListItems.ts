import { followCanonical, type CanonicalizableRow } from './canonical'
import { getSupabase } from './supabase'
import { toExerciseListItem, type ExerciseListItem, type RawExerciseListRow } from './exerciseCatalog'

interface DisplayRow extends RawExerciseListRow {
  is_active: boolean
}

/**
 * Shared "raw ids -> display rows" chase used by both Favorites and Recent: resolves each
 * raw exercise id through `followCanonical` (an id that's since been merged into an alias
 * resolves to its canonical exercise's id), dedupes the RESOLVED ids while preserving the
 * input order's first occurrence, optionally caps the deduped list at `limit` (applied
 * BEFORE the display fetch, so a caller like Recent's "cap 8" never fetches more display
 * rows than it needs), then fetches display rows and drops any that have since gone
 * `is_active = false` (silently, not backfilled from a later candidate).
 */
export async function resolveExerciseListItems(
  rawIdsInOrder: string[],
  // Unused for now — kept in the signature per the brief's declared interface (future
  // callers pass it positionally); RLS + the fact that favorite/recent ids are already
  // scoped to the user upstream means no app-level user_id filter is needed here yet.
  // Flagged for the brief's author: revisit if a case needs it (e.g. blocking lookups
  // of another user's still-active custom exercises by id).
  _userId: string,
  limit?: number,
): Promise<ExerciseListItem[]> {
  if (rawIdsInOrder.length === 0) return []
  const supabase = getSupabase()

  const { data: canonicalRows, error: canonicalError } = await supabase
    .from('exercises')
    .select('id, name, canonical_id')
    .in('id', rawIdsInOrder)
  if (canonicalError) throw canonicalError

  const canonicalById = new Map<string, string>()
  for (const row of (canonicalRows ?? []) as CanonicalizableRow[]) {
    canonicalById.set(row.id, followCanonical(row))
  }

  const resolvedIdsInOrder: string[] = []
  const seenResolved = new Set<string>()
  for (const rawId of rawIdsInOrder) {
    // A raw id absent from canonicalRows (e.g. a row deleted since it was logged) has no
    // known resolution — fall back to the raw id itself so it's still attempted below;
    // the display fetch simply returns nothing for it and it's dropped there.
    const resolvedId = canonicalById.get(rawId) ?? rawId
    if (!seenResolved.has(resolvedId)) {
      seenResolved.add(resolvedId)
      resolvedIdsInOrder.push(resolvedId)
    }
  }

  const cappedIds = typeof limit === 'number' ? resolvedIdsInOrder.slice(0, limit) : resolvedIdsInOrder
  if (cappedIds.length === 0) return []

  const { data: displayRows, error: displayError } = await supabase
    .from('exercises')
    .select('id, name, exercise_type, primary_muscles, equipment, is_active')
    .in('id', cappedIds)
  if (displayError) throw displayError

  const rowById = new Map<string, DisplayRow>()
  for (const row of (displayRows ?? []) as DisplayRow[]) rowById.set(row.id, row)

  const items: ExerciseListItem[] = []
  for (const id of cappedIds) {
    const row = rowById.get(id)
    if (!row || !row.is_active) continue
    items.push(toExerciseListItem(row))
  }
  return items
}
