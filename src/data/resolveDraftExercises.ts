import { getSupabase } from './supabase'
import type { DraftExerciseKind, ProgramDraft } from '../domain/programDraft'
import { hardNormalizeExerciseName } from '../domain'
import { buildHardKeyMap, followCanonical, type CanonicalizableRow } from './canonical'

/** trim + collapse internal whitespace + lowercase, for use as a map key.
 *  Replicated (not imported) from resolveExerciseIds.ts's normalizeName, which
 *  isn't exported there — kept byte-for-byte identical so both resolvers match
 *  the same catalog rows. Do not edit resolveExerciseIds.ts; preset activation
 *  still depends on it as-is. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The draft's own exercise kind decides the minted row's exercise_type — unlike
 *  resolveExerciseIds.ts, which always mints 'weighted' (fine for presets, which
 *  are strength-only today; the builder also supports bodyweight exercises). */
function exerciseTypeFor(kind: DraftExerciseKind): 'weighted' | 'bodyweight' {
  return kind === 'bodyweight' ? 'bodyweight' : 'weighted'
}

/** PostgREST caps any single response at `max_rows` (1000, see supabase/config.toml)
 *  regardless of how many rows match the filter — so a catalog with more than this
 *  many active rows silently truncates a plain `.select()`, and any exercise whose
 *  row falls past the cap reads as unmatched and gets minted as a duplicate. Paginate
 *  with `.range()` until a page comes back short (the exhaustion signal), accumulating
 *  every page into one array before running the normal in-memory matching below. */
const CATALOG_PAGE_SIZE = 1000

type CatalogRow = CanonicalizableRow

async function fetchActiveCatalog(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
): Promise<CatalogRow[]> {
  const rows: CatalogRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('exercises')
      // canonical_id is required here, not just id/name: followCanonical()
      // below reads it to map an alias row to its canonical id. Omitting it
      // from this select is a silent bug — every row comes back with
      // canonical_id undefined, followCanonical() falls back to the alias's
      // own id every time, and no mocked test catches it unless the mock
      // itself is asked to honor the requested columns.
      .select('id, name, canonical_id')
      .eq('is_active', true)
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order('id')
      .range(from, from + CATALOG_PAGE_SIZE - 1)
    if (error) throw error

    const page = (data ?? []) as CatalogRow[]
    rows.push(...page)
    if (page.length < CATALOG_PAGE_SIZE) break
    from += CATALOG_PAGE_SIZE
  }
  return rows
}

/**
 * Resolves a flat list of `{ name, kind }` to catalog `exercises.id`s for `userId`, minting a
 * user-owned custom exercise for any name with no existing match. Matching is weak-normalized
 * name first, then `hardNormalizeExerciseName`; any match is followed through `followCanonical`
 * (an alias resolves to its canonical id). Minted rows take `exercise_type` from `kind`. Dedups
 * by normalized name across the list (first occurrence matches-or-mints; later occurrences of the
 * same normalized name reuse the id). Result is keyed by each input `name`.
 */
export async function resolveExercisesByName(
  items: { name: string; kind: DraftExerciseKind }[],
  userId: string,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  if (items.length === 0) return result

  const supabase = getSupabase()
  const catalogRows = await fetchActiveCatalog(supabase, userId)

  const byWeak = new Map<string, string>()
  for (const row of catalogRows) {
    byWeak.set(normalizeName(row.name), followCanonical(row))
  }
  const byHard = buildHardKeyMap(catalogRows, hardNormalizeExerciseName)

  for (const { name, kind } of items) {
    const weakKey = normalizeName(name)
    const existingId = byWeak.get(weakKey) ?? byHard.get(hardNormalizeExerciseName(name))
    if (existingId) {
      result[name] = existingId
      continue
    }

    const { data: inserted, error: insertError } = await supabase
      .from('exercises')
      .insert({ user_id: userId, name, is_active: true, exercise_type: exerciseTypeFor(kind) })
      .select('id')
      .single()
    if (insertError) throw insertError

    const newId = (inserted as { id: string }).id
    byWeak.set(weakKey, newId)
    result[name] = newId
  }

  return result
}

/** Resolves every distinct exercise name in a `ProgramDraft` to a catalog id (see
 *  `resolveExercisesByName`). Thin wrapper: flattens the draft's exercises to a `{name, kind}`
 *  list and delegates. Result keyed by the draft's own `exerciseName`s. */
export async function resolveDraftExerciseIds(draft: ProgramDraft, userId: string): Promise<Record<string, string>> {
  const items = draft.days.flatMap((day) =>
    day.exercises.map((exercise) => ({ name: exercise.exerciseName, kind: exercise.kind })),
  )
  return resolveExercisesByName(items, userId)
}
