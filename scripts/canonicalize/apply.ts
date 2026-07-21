import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { phaseAFamilies } from './families.phase-a.ts'

/**
 * A confirmed "merge this alias family into one canonical exercise" plan.
 * `canonicalId`/`aliasIds` must already be real, resolved catalog ids by
 * the time this reaches `buildMergeSql` — see `families.phase-a.ts` for how
 * Phase A pins down the *names* now and defers id resolution to Task 7's
 * runtime lookup (`validateResolvedIds` guards that resolution).
 */
export interface MergeFamily {
  canonicalId: string
  canonicalName: string
  aliasIds: string[]
  aliasNames: string[]
}

/** The three SQL scripts a merge run needs, in the order they're safe to run. */
export interface MergeSql {
  /** Read-only counts — safe to run first, before anything else. */
  preview: string
  /** Points alias rows at their canonical in the `exercises` catalog. */
  catalog: string
  /** Remaps every history table that references an exercise_id. */
  history: string
}

type LookupRow = { name: string; id: string; canonical_id: string | null }

/**
 * Throws if any family's `canonicalId` is itself flagged as an alias by
 * `canonicalIdsWithCanonicalId` (the set of ids that currently HAVE a
 * canonical_id set, i.e. ids that are themselves aliases). Merging into an
 * alias would create a two-hop chain (alias -> alias -> canonical), which
 * the `exercises.canonical_id` self-FK is documented (migration 0008) to
 * forbid — every alias must point directly at a true canonical (a row
 * whose own `canonical_id` is null).
 */
export function validateNoChains(
  families: MergeFamily[],
  canonicalIdsWithCanonicalId: Set<string>,
): void {
  for (const family of families) {
    if (canonicalIdsWithCanonicalId.has(family.canonicalId)) {
      throw new Error(
        `Chain detected: "${family.canonicalName}" (${family.canonicalId}) is targeted as a ` +
          'merge canonical but is itself marked as an alias. Every canonicalId must be a true ' +
          'canonical (canonical_id is null) — resolve the chain before merging.',
      )
    }
  }
}

/**
 * Spec-review guard: throws unless EVERY family name (canonical + every
 * alias) resolves to EXACTLY ONE row in `lookup`, AND each family's
 * canonical name's row has `canonical_id === null` (i.e. it isn't itself
 * an alias). Run this against a live `exercises` lookup query before
 * trusting any ids resolved from `families.phase-a.ts`'s placeholders —
 * it catches typos, renamed/removed rows, and duplicate names.
 */
export function validateResolvedIds(families: MergeFamily[], lookup: LookupRow[]): void {
  const rowsByName = new Map<string, LookupRow[]>()
  for (const row of lookup) {
    const rows = rowsByName.get(row.name) ?? []
    rows.push(row)
    rowsByName.set(row.name, rows)
  }

  for (const family of families) {
    const allNames = [family.canonicalName, ...family.aliasNames]
    for (const name of allNames) {
      const rows = rowsByName.get(name) ?? []
      if (rows.length !== 1) {
        throw new Error(
          `Expected exactly one lookup row for "${name}" (family "${family.canonicalName}"), ` +
            `found ${rows.length}.`,
        )
      }
    }

    const canonicalRow = rowsByName.get(family.canonicalName)![0]
    if (canonicalRow.canonical_id !== null) {
      throw new Error(
        `Canonical name "${family.canonicalName}" resolves to a row (${canonicalRow.id}) that ` +
          `is itself an alias (canonical_id = ${canonicalRow.canonical_id}). Pick the true ` +
          'canonical of that chain instead.',
      )
    }
  }
}

// ---------------------------------------------------------------------------
// SQL text helpers (pure string formatting — trusted uuids/family data, not
// user input, so interpolation is acceptable here; see task brief).
// ---------------------------------------------------------------------------

function sqlUuidArray(ids: string[]): string {
  return `array[${ids.map(id => `'${id}'`).join(', ')}]::uuid[]`
}

function sqlIdList(ids: string[]): string {
  return ids.map(id => `'${id}'`).join(', ')
}

/** lower_snake_case slug for use in preview column aliases. */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function catalogSqlForFamily(family: MergeFamily): string {
  return [
    `-- ${family.canonicalName} <- ${family.aliasNames.join(', ')}`,
    `-- Aliases are NOT deactivated — only their canonical_id is set.`,
    `update exercises set canonical_id = '${family.canonicalId}' where id in (${sqlIdList(family.aliasIds)});`,
  ].join('\n')
}

function strengthSetsSqlForFamily(family: MergeFamily, userId: string): string {
  return [
    `-- strength_sets: has user_id directly, scope the remap to it.`,
    `update strength_sets`,
    `set exercise_id = '${family.canonicalId}'`,
    `where exercise_id = any(${sqlUuidArray(family.aliasIds)})`,
    `  and user_id = '${userId}';`,
  ].join('\n')
}

function programExercisesSqlForFamily(family: MergeFamily, userId: string): string {
  // program_exercises has NO user_id column (it's owned transitively via
  // program_days -> programs.user_id). A bare
  // `where exercise_id in (aliasIds)` would remap every user's/public
  // programs that reference the global alias ids — do NOT emit that form.
  return [
    `-- program_exercises: no user_id column — scope via program_days -> programs.`,
    `update program_exercises pe`,
    `set exercise_id = '${family.canonicalId}'`,
    `from program_days d`,
    `join programs p on p.id = d.program_id`,
    `where pe.program_day_id = d.id`,
    `  and p.user_id = '${userId}'`,
    `  and pe.exercise_id = any(${sqlUuidArray(family.aliasIds)});`,
  ].join('\n')
}

function personalRecordsSqlForFamily(family: MergeFamily, userId: string): string {
  const allIds = [family.canonicalId, ...family.aliasIds]
  // unique(user_id, exercise_id, pr_type): once alias rows remap onto the
  // canonical id, a pr_type that has a row under BOTH the alias and the
  // canonical today would collide. Delete the inferior one per pr_type
  // (keep the higher value, tiebreak on the later date_achieved) BEFORE
  // remapping survivors, so the remap UPDATE never hits the unique
  // constraint.
  return [
    `-- personal_records: unique(user_id, exercise_id, pr_type) — delete the`,
    `-- inferior alias/canonical duplicate per pr_type (keep higher value,`,
    `-- tiebreak later date_achieved) BEFORE remapping survivors.`,
    `with pr_dupes as (`,
    `  select pr.id, pr.pr_type,`,
    `    row_number() over (`,
    `      partition by pr.pr_type`,
    `      order by pr.value desc, pr.date_achieved desc`,
    `    ) as rk`,
    `  from personal_records pr`,
    `  where pr.user_id = '${userId}'`,
    `    and pr.exercise_id = any(${sqlUuidArray(allIds)})`,
    `)`,
    `delete from personal_records`,
    `where id in (select id from pr_dupes where rk > 1);`,
    ``,
    `update personal_records`,
    `set exercise_id = '${family.canonicalId}'`,
    `where exercise_id = any(${sqlUuidArray(family.aliasIds)})`,
    `  and user_id = '${userId}';`,
  ].join('\n')
}

function exerciseProgressSqlForFamily(family: MergeFamily, userId: string): string {
  const allIds = [family.canonicalId, ...family.aliasIds]
  // unique(user_id, program_id, exercise_id): same collision shape as
  // personal_records, but keyed by program_id instead of pr_type, and the
  // whole row must survive intact (current_weight/consecutive_fails belong
  // together — never mix/aggregate them across the alias and canonical
  // rows). Keep the row with the most recent updated_at per program_id,
  // delete the other, THEN remap survivors.
  return [
    `-- exercise_progress: unique(user_id, program_id, exercise_id) — keep the`,
    `-- WHOLE most-recently-updated row per program_id (never mix`,
    `-- current_weight/consecutive_fails across rows), delete the other,`,
    `-- BEFORE remapping survivors.`,
    `with ep_dupes as (`,
    `  select ep.id, ep.program_id,`,
    `    row_number() over (`,
    `      partition by ep.program_id`,
    `      order by ep.updated_at desc`,
    `    ) as rk`,
    `  from exercise_progress ep`,
    `  where ep.user_id = '${userId}'`,
    `    and ep.exercise_id = any(${sqlUuidArray(allIds)})`,
    `)`,
    `delete from exercise_progress`,
    `where id in (select id from ep_dupes where rk > 1);`,
    ``,
    `update exercise_progress`,
    `set exercise_id = '${family.canonicalId}'`,
    `where exercise_id = any(${sqlUuidArray(family.aliasIds)})`,
    `  and user_id = '${userId}';`,
  ].join('\n')
}

function previewSqlForFamily(family: MergeFamily, userId: string): string {
  const allIds = [family.canonicalId, ...family.aliasIds]
  const s = slug(family.canonicalName)
  return [
    `-- ${family.canonicalName} family (canonical ${family.canonicalId} <- ${family.aliasNames.join(', ')})`,
    `-- Logged-set total across alias + canonical ids. Compare this against`,
    `-- the known pre-merge total for this family — it must be unchanged`,
    `-- after catalog + history run (a remap never deletes a strength_sets row).`,
    `select count(*) as "${s}_logged_sets" from strength_sets`,
    `where user_id = '${userId}' and exercise_id = any(${sqlUuidArray(allIds)});`,
    ``,
    `-- personal_records rows for this family, pre-merge. Expect the`,
    `-- post-merge count to drop by exactly the number of pr_type collisions`,
    `-- resolved above (alias + canonical both having a row for the same pr_type).`,
    `select count(*) as "${s}_personal_records" from personal_records`,
    `where user_id = '${userId}' and exercise_id = any(${sqlUuidArray(allIds)});`,
    ``,
    `-- exercise_progress rows for this family, pre-merge. Expect the`,
    `-- post-merge count to drop by exactly the number of program_id`,
    `-- collisions resolved above.`,
    `select count(*) as "${s}_exercise_progress" from exercise_progress`,
    `where user_id = '${userId}' and exercise_id = any(${sqlUuidArray(allIds)});`,
  ].join('\n')
}

/**
 * Pure text-generator: turns a set of already-resolved `MergeFamily`
 * entries into the preview/catalog/history SQL scripts. No DB connection —
 * it only emits strings.
 *
 * Runtime validation (`validateResolvedIds` against a live lookup) is the
 * CLI wrapper's job, not this function's — this function only re-runs
 * `validateNoChains` against the alias ids implied by `families` itself,
 * a self-contained sanity check that no family's canonicalId is listed as
 * an alias by any family in this same batch (a chain fully internal to the
 * input, catchable without touching a DB).
 */
export function buildMergeSql(families: MergeFamily[], userId: string): MergeSql {
  const aliasIdsInBatch = new Set(families.flatMap(f => f.aliasIds))
  validateNoChains(families, aliasIdsInBatch)

  const preview = families.map(f => previewSqlForFamily(f, userId)).join('\n\n')

  const catalog = families.map(catalogSqlForFamily).join('\n\n')

  const history = families
    .map(family =>
      [
        `-- ==================== ${family.canonicalName} ====================`,
        strengthSetsSqlForFamily(family, userId),
        '',
        programExercisesSqlForFamily(family, userId),
        '',
        personalRecordsSqlForFamily(family, userId),
        '',
        exerciseProgressSqlForFamily(family, userId),
      ].join('\n'),
    )
    .join('\n\n')

  return { preview, catalog, history }
}

// ---------------------------------------------------------------------------
// CLI wrapper — I/O only, not unit-tested. Prints the preview/catalog/
// history SQL for a given userId so it can be copied into the Supabase SQL
// editor and run in that order (preview first — it's read-only).
//
// NOTE: `families.phase-a.ts` still has placeholder ids
// ('REPLACE_AT_DATA_OP__...') until Task 7 resolves them against a live
// `exercises` lookup and runs `validateResolvedIds` — this wrapper does
// NOT talk to the DB (Task 5 is pure SQL generation), so it can't do that
// resolution itself. Don't run the emitted SQL until the ids are real.
// ---------------------------------------------------------------------------

function printMergeSql(userId: string): void {
  const aliasIdsInBatch = new Set(phaseAFamilies.flatMap(f => f.aliasIds))
  validateNoChains(phaseAFamilies, aliasIdsInBatch)

  console.warn(
    'NOTE: families.phase-a.ts ids are placeholders until Task 7 resolves them via a live ' +
      'exercises lookup + validateResolvedIds. Do not run this SQL until that resolution has happened.',
  )

  const { preview, catalog, history } = buildMergeSql(phaseAFamilies, userId)

  console.log('-- ==================== PREVIEW (run first, read-only) ====================')
  console.log(preview)
  console.log('\n-- ==================== CATALOG ====================')
  console.log(catalog)
  console.log('\n-- ==================== HISTORY ====================')
  console.log(history)
}

function main(): void {
  const userId = process.argv[2]
  if (!userId) {
    console.error('Usage: npx tsx scripts/canonicalize/apply.ts <userId>')
    process.exitCode = 1
    return
  }
  printMergeSql(userId)
}

// Only run the CLI when this file is executed directly — not when imported
// for its exports (e.g. from apply.test.ts), matching the guard used by
// scripts/migration/load.ts.
const isDirectRun = process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isDirectRun) {
  main()
}
