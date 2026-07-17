import { getSupabase } from './supabase'
import type { DraftExerciseKind, ProgramDraft } from '../domain/programDraft'

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

/**
 * Resolves every distinct exercise name referenced in a `ProgramDraft` to a
 * catalog `exercises.id` for `userId`, minting a new user-owned custom
 * exercise for any name with no existing match.
 *
 * Reads the global catalog (`user_id is null`) plus the user's own custom
 * rows in one query (RLS enforces that scope regardless), restricted to
 * `is_active` rows, matching by normalized name. An unmatched name gets a
 * brand-new user-owned custom exercise row (`is_active: true`), with
 * `exercise_type` taken from the draft exercise's own `kind` — `'weighted'`
 * for `'strength'`, `'bodyweight'` for `'bodyweight'` — rather than
 * hardcoded, since the builder (unlike today's presets) supports both kinds.
 *
 * Every draft exercise is resolved/minted against a single in-memory
 * normalized-name -> id map: the first occurrence of a given normalized name
 * either matches the catalog read or mints exactly one new row (and its kind
 * decides that row's `exercise_type` if a later occurrence varies); every
 * subsequent occurrence of that same normalized name — even under a
 * differently-cased/spaced original string — reuses the id with no extra
 * query. The result is keyed by each exercise's original (non-normalized)
 * `exerciseName`, since callers look up by the draft's own names.
 */
export async function resolveDraftExerciseIds(draft: ProgramDraft, userId: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}

  const draftExercises: { originalName: string; kind: DraftExerciseKind }[] = draft.days.flatMap(day =>
    day.exercises.map(exercise => ({ originalName: exercise.exerciseName, kind: exercise.kind })),
  )
  if (draftExercises.length === 0) return result

  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('exercises')
    .select('id, name')
    .eq('is_active', true)
    .or(`user_id.is.null,user_id.eq.${userId}`)
  if (error) throw error

  const idByNormalized = new Map<string, string>()
  for (const row of (data ?? []) as { id: string; name: string }[]) {
    idByNormalized.set(normalizeName(row.name), row.id)
  }

  for (const { originalName, kind } of draftExercises) {
    const key = normalizeName(originalName)
    const existingId = idByNormalized.get(key)
    if (existingId) {
      result[originalName] = existingId
      continue
    }

    const { data: inserted, error: insertError } = await supabase
      .from('exercises')
      .insert({ user_id: userId, name: originalName, is_active: true, exercise_type: exerciseTypeFor(kind) })
      .select('id')
      .single()
    if (insertError) throw insertError

    const newId = (inserted as { id: string }).id
    idByNormalized.set(key, newId)
    result[originalName] = newId
  }

  return result
}
