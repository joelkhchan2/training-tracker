import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { clusterExercises, type ClusterableExercise } from './cluster.ts'

/**
 * Phase B thin I/O runner — PREVIEW ONLY. Fetches the full active exercise
 * catalog + the 5 history-touched tables' referenced exercise_ids (4 FK
 * tables + favorite_exercises) from hosted Supabase (service-role,
 * read-only queries), calls the pure `clusterExercises`, and writes a JSON
 * proposal for human review. Does not mutate anything — no update/insert/
 * delete statement is ever built or run here.
 *
 * Usage: npx tsx scripts/canonicalize/clusterRun.ts [outputPath]
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the caller's shell
 * env (never pass these as literal CLI args or hardcode them here).
 */

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return value
}

// Same PostgREST max_rows cap as src/data/resolveDraftExercises.ts's
// fetchActiveCatalog — the catalog is 738 rows and growing, close enough to
// 1000 that a single unpaginated .select() would silently truncate. Used
// for every paginated fetch below (catalog + each history-touched table),
// not just the catalog.
const PAGE_SIZE = 1000

interface RawExerciseRow {
  id: string
  name: string
  user_id: string | null
  exercise_type: 'weighted' | 'bodyweight' | 'timed'
  canonical_id: string | null
}

function toClusterable(row: RawExerciseRow): ClusterableExercise {
  return {
    id: row.id,
    name: row.name,
    userId: row.user_id,
    exerciseType: row.exercise_type,
    canonicalId: row.canonical_id,
  }
}

/** Paginates the FULL active catalog (every user's rows, not scoped to one
 *  caller — this is a catalog-wide sweep, unlike the app resolvers'
 *  per-user-scoped fetch). Ordered by id for run-to-run determinism, since
 *  cluster.ts's Map-based grouping is stable only for a stably-ordered input. */
async function fetchAllActiveExercises(supabase: SupabaseClient): Promise<ClusterableExercise[]> {
  const rows: ClusterableExercise[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, user_id, exercise_type, canonical_id')
      .eq('is_active', true)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`exercises fetch failed: ${error.message}`)

    const page = (data ?? []) as RawExerciseRow[]
    rows.push(...page.map(toClusterable))
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

/** Distinct exercise_ids referenced by one history-touched table, paginated
 *  the same way as fetchAllActiveExercises. `strength_sets` in particular
 *  grows with every logged set and can eventually cross PostgREST's
 *  1000-row max_rows cap — an unpaginated fetch there would silently drop
 *  touched ids and mis-tier a history-touching family into searchOnly, so
 *  every table here is paginated, not just the ones currently under the
 *  cap. Ordered by `exercise_id` (not `id` — `favorite_exercises` has a
 *  composite primary key with no `id` column, but every one of these
 *  tables has `exercise_id`) for stable pagination across pages. */
async function fetchDistinctExerciseIds(supabase: SupabaseClient, table: string): Promise<Set<string>> {
  const ids = new Set<string>()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('exercise_id')
      .order('exercise_id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${table} exercise_id fetch failed: ${error.message}`)

    const page = (data ?? []) as { exercise_id: string | null }[]
    for (const row of page) {
      if (row.exercise_id) ids.add(row.exercise_id)
    }
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return ids
}

/** Union of exercise_ids referenced by every table that signals "the user
 *  cares about this exercise": the 4 FK tables the design names as
 *  "history-touching" (strength_sets, personal_records, program_exercises,
 *  exercise_progress) PLUS favorite_exercises. The 2026-07-20 design doc
 *  predates the favorite_exercises table (migration 0013, added
 *  2026-07-28), so it only names the 4 FK tables — including favorites
 *  here is a plan-level decision, not a design exclusion:
 *  `favoriteExercises.ts`'s `useFavoriteExercises` silently drops any
 *  since-deactivated row from the Favorites list, so a favorited-but-
 *  never-logged junk-looking row must never be silently deactivated
 *  either — treating a favorite as a touch signal routes it to
 *  uncertain/historyTouching for close review instead. */
async function buildHistoryTouchedIds(supabase: SupabaseClient): Promise<Set<string>> {
  const tables = [
    'strength_sets',
    'personal_records',
    'program_exercises',
    'exercise_progress',
    'favorite_exercises',
  ]
  const sets = await Promise.all(tables.map(t => fetchDistinctExerciseIds(supabase, t)))
  const touched = new Set<string>()
  for (const set of sets) for (const id of set) touched.add(id)
  return touched
}

async function main(): Promise<void> {
  const url = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const outputPath = path.resolve(process.cwd(), process.argv[2] ?? 'scripts/canonicalize/.data/proposal.json')

  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const [catalog, historyTouchedIds] = await Promise.all([
    fetchAllActiveExercises(supabase),
    buildHistoryTouchedIds(supabase),
  ])

  const result = clusterExercises(catalog, historyTouchedIds)

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        catalogRowCount: catalog.length,
        historyTouchedCount: historyTouchedIds.size,
        ...result,
      },
      null,
      2,
    ),
  )

  console.log(`Wrote proposal to ${outputPath}`)
  console.log(`catalog rows scanned: ${catalog.length}`)
  console.log(`history-touched ids:  ${historyTouchedIds.size}`)
  console.log(`history-touching families: ${result.counts.historyTouching}`)
  console.log(`search-only families:      ${result.counts.searchOnly}`)
  console.log(`uncertain groups:          ${result.counts.uncertain}`)
  console.log(`junk candidates:           ${result.counts.junk}`)
  console.log(
    '\nPREVIEW ONLY — nothing was written to the database. Review the proposal file, then hand-author ' +
      'the approved families/junk list for apply.ts, per the design doc review gate.',
  )
}

const isDirectRun = process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isDirectRun) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
