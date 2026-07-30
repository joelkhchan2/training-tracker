import { hardNormalizeExerciseName } from '../../src/domain/exerciseName.ts'
import type { MergeFamily } from './apply.ts'

/**
 * Pure, deterministic catalog-sweep clustering (Phase B). Given every active
 * exercise row + the set of ids referenced by the user's logged history AND
 * favorites (see `clusterRun.ts`'s `buildHistoryTouchedIds` for exactly which
 * tables), proposes candidate merge families split into review tiers.
 * No I/O — `clusterRun.ts` is the thin fetch-and-call wrapper around this.
 *
 * Determinism note: `Map` iteration order is insertion order, so this
 * function's output order is stable ONLY if the input `rows` array is
 * itself stably ordered across runs. `clusterRun.ts` fetches with
 * `.order('id')` to guarantee that.
 */

export interface ClusterableExercise {
  id: string
  name: string
  userId: string | null
  exerciseType: 'weighted' | 'bodyweight' | 'timed'
  canonicalId: string | null
}

/**
 * A pair/group of names that need a human decision — either an
 * equipment-prefix candidate (different implements/angles that must never be
 * auto-merged) or a junk-looking row that's actually been logged (so it must
 * never be silently deactivated).
 */
export interface UncertainGroup {
  reason: 'equipment-prefix' | 'history-touched-junk'
  members: { id: string; name: string }[]
  note: string
}

/** A junk-compound row with no logged history — safe to propose for
 *  `is_active = false` deactivation (never merged, never deleted). */
export interface JunkCandidate {
  id: string
  name: string
}

export interface ClusterCounts {
  historyTouching: number
  searchOnly: number
  uncertain: number
  junk: number
}

export interface ClusterResult {
  /** Any member (canonical or alias) is in the history-touched set —
   *  mandatory close review before merging. */
  historyTouching: MergeFamily[]
  /** No member of the family was ever logged — bulk-confirm tier. */
  searchOnly: MergeFamily[]
  /** Equipment-prefix ambiguities + history-touched junk-looking rows —
   *  needs a human decision, never auto-merged/auto-deactivated. */
  uncertain: UncertainGroup[]
  /** Junk compounds referenced by nothing — deactivate candidates. */
  junk: JunkCandidate[]
  counts: ClusterCounts
}

/**
 * Deterministic tiebreak for which group member becomes the proposed
 * canonical. Every row entering this function already has `canonicalId ===
 * null` (see `clusterExercises`'s pre-filter), so "prefer an already-
 * canonical row" is trivially true for all of them — the real decision is:
 *   1. Prefer a row the user has actually logged (history-touched) — the
 *      available proxy for "this is the one actually in use" (full
 *      logged-set *counts* would need extra plumbing this pure function
 *      doesn't have; the boolean touched/untouched signal is what
 *      `clusterRun.ts` supplies and is enough to break ties in the common
 *      case of at most one touched member per group).
 *   2. Else the shortest trimmed name (the "bare"/least-decorated form).
 *   3. Else alphabetical (locale compare) for determinism.
 *   4. Else lowest id string, as a final deterministic tiebreak.
 */
function chooseCanonical(
  members: ClusterableExercise[],
  historyTouchedIds: Set<string>,
): ClusterableExercise {
  const sorted = [...members].sort((a, b) => {
    const aTouched = historyTouchedIds.has(a.id) ? 0 : 1
    const bTouched = historyTouchedIds.has(b.id) ? 0 : 1
    if (aTouched !== bTouched) return aTouched - bTouched

    const lenDiff = a.name.trim().length - b.name.trim().length
    if (lenDiff !== 0) return lenDiff

    const nameCompare = a.name.localeCompare(b.name)
    if (nameCompare !== 0) return nameCompare

    return a.id.localeCompare(b.id)
  })
  return sorted[0]
}

function buildFamilyFromGroup(
  members: ClusterableExercise[],
  historyTouchedIds: Set<string>,
): MergeFamily {
  const canonical = chooseCanonical(members, historyTouchedIds)
  const aliases = members.filter(m => m.id !== canonical.id)
  return {
    canonicalId: canonical.id,
    canonicalName: canonical.name,
    aliasIds: aliases.map(a => a.id),
    aliasNames: aliases.map(a => a.name),
  }
}

function isHistoryTouching(family: MergeFamily, historyTouchedIds: Set<string>): boolean {
  return historyTouchedIds.has(family.canonicalId) || family.aliasIds.some(id => historyTouchedIds.has(id))
}

export function clusterExercises(
  rows: ClusterableExercise[],
  historyTouchedIds: Set<string>,
): ClusterResult {
  // Already-aliased rows (canonicalId set) are already resolved by an
  // earlier merge — re-clustering them risks nesting an alias inside a NEW
  // proposed family (a chain), so they're excluded up front. They still
  // exist in the live catalog; they're just not candidates for a new merge.
  const candidateRows = rows.filter(r => r.canonicalId === null)

  const byPrimaryKey = new Map<string, ClusterableExercise[]>()
  for (const row of candidateRows) {
    const key = hardNormalizeExerciseName(row.name)
    const group = byPrimaryKey.get(key) ?? []
    group.push(row)
    byPrimaryKey.set(key, group)
  }

  const historyTouching: MergeFamily[] = []
  const searchOnly: MergeFamily[] = []
  for (const group of byPrimaryKey.values()) {
    if (group.length < 2) continue // no duplicate — nothing to propose
    const family = buildFamilyFromGroup(group, historyTouchedIds)
    if (isHistoryTouching(family, historyTouchedIds)) {
      historyTouching.push(family)
    } else {
      searchOnly.push(family)
    }
  }

  // Junk detection (Task 4) and equipment-prefix uncertain routing (Task 5)
  // are added on top of this in later tasks — empty for now.
  const uncertain: UncertainGroup[] = []
  const junk: JunkCandidate[] = []

  return {
    historyTouching,
    searchOnly,
    uncertain,
    junk,
    counts: {
      historyTouching: historyTouching.length,
      searchOnly: searchOnly.length,
      uncertain: uncertain.length,
      junk: junk.length,
    },
  }
}
