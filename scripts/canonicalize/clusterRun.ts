import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { clusterExercises, type ClusterableExercise, type ClusterResult, type JunkCandidate, type UncertainGroup } from './cluster.ts'
import type { MergeFamily } from './apply.ts'

/**
 * Phase B thin I/O runner — PREVIEW ONLY. Fetches the GLOBAL (user_id IS
 * NULL) active exercise catalog + the 5 history-touched tables' referenced
 * exercise_ids (4 FK tables + favorite_exercises) from hosted Supabase
 * (service-role, read-only queries), calls the pure `clusterExercises`,
 * and writes a JSON proposal for human review. Does not mutate anything —
 * no update/insert/delete statement is ever built or run here.
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
// for every paginated fetch below (candidate catalog + each
// history-touched table), not just the catalog.
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

/** Total active row count across ALL owners (global rows + every user's
 *  custom rows) — logged for transparency alongside the (smaller) global
 *  candidate count, never used as clustering input. A head-only count
 *  request returns no row data (just a count in the response), so unlike
 *  a real `.select()` it isn't subject to PostgREST's max_rows cap and
 *  needs no pagination loop. */
async function countActiveExercises(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('exercises')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
  if (error) throw new Error(`exercises count failed: ${error.message}`)
  return count ?? 0
}

/**
 * Paginates the GLOBAL (`user_id IS NULL`) active catalog — the Phase B
 * clustering CANDIDATE set. User-owned custom rows are deliberately
 * excluded here at the query level: they're minted by the app's own
 * resolvers (`resolveDraftExercises.ts`, `resolveExercisesByName`) and
 * resolve fine as-is, and `chooseCanonical`'s history-touched tiebreak in
 * `cluster.ts` has no way to know a touched row is privately RLS-scoped —
 * so letting a custom row win canonical status for a family that also
 * contains a global alias would make `apply.ts`'s un-user-scoped
 * `update exercises set canonical_id=...` point every OTHER user's
 * resolver at a row RLS hides from them, silently breaking the shared
 * catalog for everyone else. This matches the design doc's stated scope:
 * the full 708-row *global* catalog sweep. Ordered by id for run-to-run
 * determinism, since cluster.ts's Map-based grouping is stable only for a
 * stably-ordered input.
 */
async function fetchGlobalCandidateExercises(supabase: SupabaseClient): Promise<ClusterableExercise[]> {
  const rows: ClusterableExercise[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, user_id, exercise_type, canonical_id')
      .eq('is_active', true)
      .is('user_id', null)
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

/**
 * Pure defense-in-depth filter applied to whatever a candidate fetch
 * returns, right before it's handed to `clusterExercises`. In production
 * `fetchGlobalCandidateExercises` already restricts the query itself to
 * `user_id IS NULL`, so this is normally a no-op — but keeping the
 * exclusion as its own pure, exported function means a future change to
 * the fetch (e.g. someone dropping the `.is()` filter while refactoring)
 * can never silently let a user-owned row become a clustering candidate,
 * and the exclusion logic itself is unit-testable without a Supabase mock.
 */
export function selectGlobalCandidates(rows: ClusterableExercise[]): ClusterableExercise[] {
  return rows.filter(row => row.userId === null)
}

/**
 * Distinct exercise_ids referenced by one history-touched table, paginated
 * the same way as fetchGlobalCandidateExercises. `strength_sets` in
 * particular grows with every logged set and can eventually cross
 * PostgREST's 1000-row max_rows cap — an unpaginated fetch there would
 * silently drop touched ids and mis-tier a history-touching family into
 * searchOnly, so every table here is paginated, not just the ones
 * currently under the cap.
 *
 * `orderColumns` must be a column set that TOTALLY orders the table (i.e.
 * unique per row) for `.range()` windows to tile without gaps or overlaps.
 * Ordering by `exercise_id` alone (the earlier, buggy version of this
 * function) does NOT satisfy that: `exercise_id` repeats heavily — one
 * `strength_sets` row per logged SET, for example — so a row sitting
 * exactly at a page boundary can be excluded by both the page ending there
 * and the page starting after it, silently dropping a touched id. Each
 * caller passes its own table's primary key: `id` for the four tables that
 * have one, or `favorite_exercises`'s composite PK columns
 * (`user_id`, `exercise_id`) for the one table that doesn't.
 */
async function fetchDistinctExerciseIds(
  supabase: SupabaseClient,
  table: string,
  orderColumns: string[],
): Promise<Set<string>> {
  const ids = new Set<string>()
  let from = 0
  while (true) {
    const base = supabase.from(table).select('exercise_id')
    const ordered = orderColumns.reduce((query, column) => query.order(column), base)
    const { data, error } = await ordered.range(from, from + PAGE_SIZE - 1)
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

/** The 5 history-touched tables plus each one's own PRIMARY KEY column set,
 *  used to page `fetchDistinctExerciseIds` with a total order (see that
 *  function's docstring for why `exercise_id` itself can't be used as the
 *  order column). `favorite_exercises` has a composite PK
 *  (`user_id`, `exercise_id`, migration 0013) and no `id` column; the other
 *  four each have a surrogate `id uuid primary key`. */
const HISTORY_TABLES: { table: string; orderColumns: string[] }[] = [
  { table: 'strength_sets', orderColumns: ['id'] },
  { table: 'personal_records', orderColumns: ['id'] },
  { table: 'program_exercises', orderColumns: ['id'] },
  { table: 'exercise_progress', orderColumns: ['id'] },
  { table: 'favorite_exercises', orderColumns: ['user_id', 'exercise_id'] },
]

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
 *  uncertain/historyTouching for close review instead. This union is about
 *  TOUCH SIGNAL, not clustering candidacy: a global row the user logged
 *  against is still eligible to be a clustering candidate (and still
 *  routes its family to historyTouching), unlike the user_id-based
 *  candidate restriction in `fetchGlobalCandidateExercises`. */
async function buildHistoryTouchedIds(supabase: SupabaseClient): Promise<Set<string>> {
  const sets = await Promise.all(
    HISTORY_TABLES.map(({ table, orderColumns }) => fetchDistinctExerciseIds(supabase, table, orderColumns)),
  )
  const touched = new Set<string>()
  for (const set of sets) for (const id of set) touched.add(id)
  return touched
}

type Owner = 'global' | 'custom'

function ownerOf(userId: string | null): Owner {
  return userId === null ? 'global' : 'custom'
}

export interface OwnerTaggedFamily extends MergeFamily {
  canonicalOwner: Owner
  aliasOwners: Owner[]
}

export interface OwnerTaggedJunkCandidate extends JunkCandidate {
  owner: Owner
}

export interface OwnerTaggedUncertainGroup extends Omit<UncertainGroup, 'members'> {
  members: (UncertainGroup['members'][number] & { owner: Owner })[]
}

export interface Proposal {
  generatedAt: string
  /** Active rows across ALL owners (global + every user's custom rows) — context only. */
  totalActiveCount: number
  /** Active GLOBAL rows — the actual clustering candidate count (subset of totalActiveCount). */
  globalCandidateCount: number
  historyTouchedCount: number
  note: string
  historyTouching: OwnerTaggedFamily[]
  searchOnly: OwnerTaggedFamily[]
  uncertain: OwnerTaggedUncertainGroup[]
  junk: OwnerTaggedJunkCandidate[]
  counts: ClusterResult['counts']
}

/**
 * Pure proposal-assembly step: takes the clustering result plus the exact
 * candidate rows it was computed from, and produces the JSON-serializable
 * object `clusterRun.ts` writes to disk — annotated with a global/custom
 * `owner` tag per row (looked up from `catalog`, the candidate list) so a
 * reviewer never has to cross-reference ids by hand. Since candidates are
 * restricted to global rows before this runs (see
 * `fetchGlobalCandidateExercises` / `selectGlobalCandidates`), every tag
 * here is expected to read 'global' in a real run — the tagging is
 * transparency/defense-in-depth, not a new filter. No I/O — a pure
 * function of its arguments (aside from the default `generatedAt`, which
 * callers can override for deterministic tests), so it's unit-testable
 * without a Supabase mock.
 */
export function buildProposal(params: {
  catalog: ClusterableExercise[]
  totalActiveCount: number
  historyTouchedCount: number
  result: ClusterResult
  generatedAt?: string
}): Proposal {
  const { catalog, totalActiveCount, historyTouchedCount, result } = params
  const ownerById = new Map<string, Owner>(catalog.map(row => [row.id, ownerOf(row.userId)]))
  const ownerOfId = (id: string): Owner => ownerById.get(id) ?? 'custom'

  const tagFamily = (family: MergeFamily): OwnerTaggedFamily => ({
    ...family,
    canonicalOwner: ownerOfId(family.canonicalId),
    aliasOwners: family.aliasIds.map(ownerOfId),
  })

  const tagJunk = (candidate: JunkCandidate): OwnerTaggedJunkCandidate => ({
    ...candidate,
    owner: ownerOfId(candidate.id),
  })

  const tagUncertain = (group: UncertainGroup): OwnerTaggedUncertainGroup => ({
    ...group,
    members: group.members.map(member => ({ ...member, owner: ownerOfId(member.id) })),
  })

  return {
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    totalActiveCount,
    globalCandidateCount: catalog.length,
    historyTouchedCount,
    note:
      'Phase B candidates are restricted to GLOBAL rows (user_id IS NULL) — see the design doc\'s ' +
      '"full 708-row global catalog sweep" scope. User-owned custom exercises are intentionally ' +
      'excluded from this sweep: they resolve fine as-is today, and merging one into/out of a ' +
      'global family risks pointing other users\' resolvers (via apply.ts\'s un-user-scoped ' +
      'canonical_id update) at a row Row Level Security hides from them.',
    historyTouching: result.historyTouching.map(tagFamily),
    searchOnly: result.searchOnly.map(tagFamily),
    uncertain: result.uncertain.map(tagUncertain),
    junk: result.junk.map(tagJunk),
    counts: result.counts,
  }
}

async function main(): Promise<void> {
  const url = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const outputPath = path.resolve(process.cwd(), process.argv[2] ?? 'scripts/canonicalize/.data/proposal.json')

  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const [totalActiveCount, rawCandidates, historyTouchedIds] = await Promise.all([
    countActiveExercises(supabase),
    fetchGlobalCandidateExercises(supabase),
    buildHistoryTouchedIds(supabase),
  ])

  // Defense-in-depth: fetchGlobalCandidateExercises already restricts the
  // query to user_id IS NULL — this re-applies the same restriction
  // in-memory (see selectGlobalCandidates's docstring).
  const catalog = selectGlobalCandidates(rawCandidates)

  const result = clusterExercises(catalog, historyTouchedIds)

  const proposal = buildProposal({
    catalog,
    totalActiveCount,
    historyTouchedCount: historyTouchedIds.size,
    result,
  })

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(proposal, null, 2))

  console.log(`Wrote proposal to ${outputPath}`)
  console.log(`active rows (all owners):      ${totalActiveCount}`)
  console.log(`global candidate rows scanned: ${catalog.length}`)
  console.log(`history-touched ids:           ${historyTouchedIds.size}`)
  console.log(`history-touching families: ${result.counts.historyTouching}`)
  console.log(`search-only families:      ${result.counts.searchOnly}`)
  console.log(`uncertain groups:          ${result.counts.uncertain}`)
  console.log(`junk candidates:           ${result.counts.junk}`)
  const excludedCustomCount = totalActiveCount - catalog.length
  if (excludedCustomCount > 0) {
    console.log(
      `\n${excludedCustomCount} active user-owned custom row(s) were excluded from this sweep ` +
        '(out of Phase B scope — see the proposal file\'s "note" field).',
    )
  }
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
