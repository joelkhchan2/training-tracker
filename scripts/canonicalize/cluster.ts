import { hardNormalizeExerciseName } from '../../src/domain/exerciseName.ts'
import type { MergeFamily } from './apply.ts'

/**
 * Leading tokens that mark a name as starting with an "attachment"/implement
 * word, for JUNK detection only. Deliberately broader than the
 * EQUIPMENT_PREFIX_TOKENS used for the equipment-prefix *merge-candidate*
 * key in Task 5 (e.g. includes "plate") — a junk compound just needs SOME
 * generic prefix word to trigger the check; a semantic equipment-prefix
 * merge candidate needs a word that denotes a genuine alternate implement.
 */
const JUNK_LEADING_TOKENS = new Set([
  'barbell', 'dumbbell', 'machine', 'cable', 'band', 'kettlebell', 'smith', 'ez', 'ezbar', 'bodyweight', 'plate',
])

/**
 * Curated movement-word set for junk detection. Deliberately narrow —
 * "push" is excluded because "Push Press" is a real single lift (two
 * movement-sounding words describing ONE named exercise), and "hold" is
 * excluded for the same reason: "Barbell Squat Hold" / "Dumbbell Curl Hold"
 * are real isometric-hold exercise names, not junk, and would otherwise
 * trip the >=2-distinct-movement-words threshold ({squat, hold} / {curl,
 * hold}) and get silently deactivated with no reviewer signal if never
 * logged. The three named catalog junk examples still trip the threshold
 * without "hold": Band Squat Hold Row -> {squat, row}; Plate Squat Hold
 * Curl -> {squat, curl}; Machine Squat Press -> {squat, press}. Adding
 * generic words here would false-positive on real compound lift names.
 * This is a heuristic, not exhaustive; the human review gate (design doc)
 * is the actual safety net before anything is deactivated.
 */
const JUNK_MOVEMENT_TOKENS = new Set([
  'squat', 'press', 'row', 'curl', 'pull', 'raise', 'extension',
  'fly', 'deadlift', 'lunge', 'crunch', 'dip', 'thrust', 'swing', 'carry', 'hinge', 'chin',
])

const JUNK_MIN_MOVEMENT_TOKENS = 2

/**
 * Leading equipment phrases for the SEMANTIC equipment-prefix secondary key
 * (merge-candidate detection -> uncertain). This is the design's exact list
 * — narrower than JUNK_LEADING_TOKENS (no "plate": a plate isn't a genuine
 * alternate implement for the same movement the way barbell/dumbbell/
 * machine/cable are).
 */
const EQUIPMENT_PREFIXES = [
  'barbell', 'dumbbell', 'machine', 'cable', 'band', 'kettlebell', 'smith', 'ez bar', 'bodyweight',
]

function stripLeadingEquipment(name: string): string {
  const lowered = name.trim().toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ')
  for (const prefix of EQUIPMENT_PREFIXES) {
    if (lowered === prefix) return lowered // whole name is just the equipment word - nothing to strip
    if (lowered.startsWith(`${prefix} `)) {
      return lowered.slice(prefix.length + 1)
    }
  }
  return lowered
}

function equipmentAwareKey(name: string): string {
  return hardNormalizeExerciseName(stripLeadingEquipment(name))
}

function tokenize(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length > 0)
}

function isJunkCompound(name: string): boolean {
  const [first, ...rest] = tokenize(name)
  if (first === undefined || !JUNK_LEADING_TOKENS.has(first)) return false
  const distinctMovementTokens = new Set(rest.filter(t => JUNK_MOVEMENT_TOKENS.has(t)))
  return distinctMovementTokens.size >= JUNK_MIN_MOVEMENT_TOKENS
}

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

  const junk: JunkCandidate[] = []
  const uncertain: UncertainGroup[] = []
  const nonJunk: ClusterableExercise[] = []

  for (const row of candidateRows) {
    if (!isJunkCompound(row.name)) {
      nonJunk.push(row)
      continue
    }
    if (historyTouchedIds.has(row.id)) {
      uncertain.push({
        reason: 'history-touched-junk',
        members: [{ id: row.id, name: row.name }],
        note: `"${row.name}" looks like a junk compound but has logged history — review, do not auto-deactivate.`,
      })
    } else {
      junk.push({ id: row.id, name: row.name })
    }
  }

  const byPrimaryKey = new Map<string, ClusterableExercise[]>()
  for (const row of nonJunk) {
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

  // Equipment-prefix secondary key: candidates whose PRIMARY hard keys
  // differ (so they were never grouped as a family above) but whose
  // equipment-stripped keys collide. Route to uncertain — never auto-merge
  // different implements/angles.
  const bySecondaryKey = new Map<string, ClusterableExercise[]>()
  for (const row of nonJunk) {
    const key = equipmentAwareKey(row.name)
    if (key === '') continue
    const group = bySecondaryKey.get(key) ?? []
    group.push(row)
    bySecondaryKey.set(key, group)
  }

  for (const group of bySecondaryKey.values()) {
    if (group.length < 2) continue
    const distinctPrimaryKeys = new Set(group.map(r => hardNormalizeExerciseName(r.name)))
    if (distinctPrimaryKeys.size < 2) continue // already the same primary-key family - not new information
    uncertain.push({
      reason: 'equipment-prefix',
      members: group.map(r => ({ id: r.id, name: r.name })),
      note: `These names share a movement after stripping a leading equipment word, but differ enough (implement/angle) to require human review, not auto-merge: ${group.map(r => r.name).join(', ')}.`,
    })
  }

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
