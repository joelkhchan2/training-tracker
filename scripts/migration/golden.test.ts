import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'
import { loadExport } from './loadExport.ts'
import type { RawExport } from './exportSchema.ts'
import { toExerciseCatalog, buildNameToId } from './transform/exercises.ts'
import type { NameToIdResult } from './transform/exercises.ts'
import { toSessions } from './transform/log.ts'
import type { SessionRow, StrengthSetRow } from './transform/log.ts'
import { epley1RM, round1 } from '../../src/domain/oneRepMax.ts'

/**
 * Golden test: proves the Phase-1 domain core reproduces the Sheet's OWN
 * computed numbers on the real (staged, git-ignored) training history.
 *
 * The Training Log tab is a PARTIAL/recent window (2026-05-04..2026-07-14,
 * 590 rows) while Personal Bests dates back to 2024 — so this deliberately
 * does NOT assert "recomputed-from-log PRs == stored PBs" globally. Instead:
 *
 *   Oracle 1 (primary): for every Strength row that has weight+reps+the
 *   Sheet's own derived e1RM (idx8), recomputing via the domain's
 *   `epley1RM`/`round1` must equal the Sheet's number. This is a direct,
 *   date-independent proof that the domain Epley implementation matches
 *   what the Sheet itself computed on real data.
 *
 *   Oracle 2: for each Personal Bests row (e1RM / Session Volume) whose
 *   Date Achieved falls INSIDE the log's date window, recomputing the best
 *   value from the log must equal the stored PB (the log fully covers that
 *   PR). For PBs dated BEFORE the log's window, the log can't contain that
 *   history, so recomputed-from-log must only be <= the stored PB (never
 *   exceed an all-time best the log doesn't have evidence for).
 *
 *   Oracle 3 (sanity): the highest V-grade actually sent in the log must
 *   not exceed the stored Max V-Grade PB.
 */

const dataPath = path.resolve(process.cwd(), 'scripts/migration/.data/export.xlsx')

type LogRow = (string | number | null)[]

function num(v: string | number | boolean | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function str(v: string | number | boolean | null | undefined): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** trim + collapse internal whitespace + lowercase — duplicated from
 * exercises.ts's private `normalizeName` (not exported) so this test can
 * match names against `nameToId` the exact same way the transforms do. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Parses either `YYYY-MM-DD` or `M/D/YY` into `YYYY-MM-DD` — duplicated
 * from log.ts/records.ts's private `parseDate` (not exported) for the same
 * reason: this test needs to parse Training Log + Personal Bests dates
 * identically to how the transforms do. */
function parseDate(v: string | number | boolean | null | undefined): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '') return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s)
  if (us) {
    const [, m, d, yy] = us
    const year = 2000 + Number(yy)
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return null
}

describe.skipIf(!existsSync(dataPath))('golden test: domain core vs the Sheet\'s own numbers (real export)', () => {
  // NOTE: no real-file I/O may happen here at describe/collection scope — a
  // describe.skipIf block's factory still runs during collection even when
  // skipped, so any loadExport() call made directly in this scope would
  // throw ENOENT on CI (where the git-ignored fixture is absent) before the
  // skip ever takes effect. Everything derived from the real file is
  // deferred to beforeAll, which vitest does not invoke for skipped suites.
  let raw: RawExport
  let rows: LogRow[]
  let catalog: ReturnType<typeof toExerciseCatalog>
  let nameToIdResult: NameToIdResult
  let sessions: SessionRow[]
  let strengthSets: StrengthSetRow[]

  beforeAll(() => {
    raw = loadExport(dataPath)
    rows = raw.trainingLogMatrix as LogRow[]
    catalog = toExerciseCatalog(raw)
    nameToIdResult = buildNameToId(catalog, raw)
    const result = toSessions(raw, nameToIdResult)
    sessions = result.sessions
    strengthSets = result.strengthSets
  })

  it('oracle 1: per-row e1RM faithfulness — domain epley1RM matches the Sheet\'s own derived column (idx8) for every checkable Strength row', () => {
    let checked = 0
    const mismatches: Array<{
      date: unknown; exercise: unknown; weight: number; reps: number
      sheetE1RM: number; computedE1RM: number; diff: number
    }> = []

    for (const row of rows) {
      if (row[2] !== 'Strength') continue
      const weight = num(row[5])
      const reps = num(row[6])
      const sheetE1RM = num(row[8])
      if (weight == null || reps == null || sheetE1RM == null) continue

      checked++
      const computedE1RM = round1(epley1RM(weight, reps))
      const diff = Math.abs(computedE1RM - sheetE1RM)
      if (diff > 0.1) {
        mismatches.push({ date: row[0], exercise: row[3], weight, reps, sheetE1RM, computedE1RM, diff })
      }
    }

    console.log(`Oracle 1: checked ${checked} Strength rows with weight+reps+sheet-e1RM; ${mismatches.length} mismatches`)
    if (mismatches.length > 0) {
      console.log('Oracle 1 mismatches:', JSON.stringify(mismatches, null, 2))
    }

    // ~437 rows expected in the real staged export.
    expect(checked).toBeGreaterThan(400)
    expect(mismatches).toEqual([])
  })

  it('oracle 2: date-scoped PR reconciliation — in-window PBs equal the recomputed best, out-of-window PBs bound it from above', () => {
    const sessionDateById = new Map(sessions.map(s => [s.id, s.date]))

    interface SetInfo { weight: number; reps: number; sessionId: string }
    const setsByExerciseId = new Map<string, SetInfo[]>()
    for (const s of strengthSets) {
      if (s.exercise_id == null || s.weight == null || s.reps == null) continue
      if (!sessionDateById.has(s.session_id)) continue
      const arr = setsByExerciseId.get(s.exercise_id) ?? []
      arr.push({ weight: s.weight, reps: s.reps, sessionId: s.session_id })
      setsByExerciseId.set(s.exercise_id, arr)
    }

    const NO_DATA = Number.NEGATIVE_INFINITY

    function bestE1RMFor(exerciseId: string | null | undefined): number {
      if (!exerciseId) return NO_DATA
      const sets = setsByExerciseId.get(exerciseId)
      if (!sets || sets.length === 0) return NO_DATA
      return round1(Math.max(...sets.map(s => epley1RM(s.weight, s.reps))))
    }

    function bestSessionVolumeFor(exerciseId: string | null | undefined): number {
      if (!exerciseId) return NO_DATA
      const sets = setsByExerciseId.get(exerciseId)
      if (!sets || sets.length === 0) return NO_DATA
      const bySession = new Map<string, number>()
      for (const s of sets) {
        bySession.set(s.sessionId, (bySession.get(s.sessionId) ?? 0) + s.weight * s.reps)
      }
      return Math.max(...bySession.values())
    }

    // Global log date window, from every parseable Training Log date (not
    // just Strength rows) — this is the window the whole log covers.
    const allLogDates = rows
      .map(r => parseDate(r[0]))
      .filter((d): d is string => d != null)
      .sort()
    const logMinDate = allLogDates[0]
    const logMaxDate = allLogDates[allLogDates.length - 1]
    expect(logMinDate).toBeTruthy()
    expect(logMaxDate).toBeTruthy()

    let inRange = 0
    let outOfRange = 0
    const inRangeFailures: Array<{
      exercise: string; prType: string; sheetValue: number; recomputed: number
      diff: number; dateAchieved: string
    }> = []
    const outOfRangeFailures: Array<{
      exercise: string; prType: string; sheetValue: number; recomputed: number
      dateAchieved: string | null
    }> = []

    for (const pb of raw.personalBests) {
      const prTypeRaw = str(pb['PR Type'])
      if (prTypeRaw !== 'Estimated 1-Rep Max' && prTypeRaw !== 'Session Volume') continue

      const exerciseName = str(pb.Exercise)
      const value = num(pb.Value)
      const dateAchieved = parseDate(pb['Date Achieved'])
      if (exerciseName == null || value == null) continue

      const exerciseId = nameToIdResult.map.get(normalizeName(exerciseName))
      const recomputed = prTypeRaw === 'Estimated 1-Rep Max'
        ? bestE1RMFor(exerciseId)
        : bestSessionVolumeFor(exerciseId)
      const hasData = recomputed !== NO_DATA

      const withinRange = dateAchieved != null && logMinDate != null && logMaxDate != null
        && dateAchieved >= logMinDate && dateAchieved <= logMaxDate

      const epsilon = prTypeRaw === 'Estimated 1-Rep Max' ? 0.15 : 1.0

      if (withinRange) {
        inRange++
        if (!hasData) {
          inRangeFailures.push({
            exercise: exerciseName, prType: prTypeRaw, sheetValue: value,
            recomputed: NaN, diff: NaN, dateAchieved: dateAchieved ?? '',
          })
          continue
        }
        const diff = Math.abs(recomputed - value)
        if (diff > epsilon) {
          inRangeFailures.push({
            exercise: exerciseName, prType: prTypeRaw, sheetValue: value,
            recomputed, diff, dateAchieved: dateAchieved ?? '',
          })
        }
      } else {
        outOfRange++
        if (hasData && recomputed > value + epsilon) {
          outOfRangeFailures.push({
            exercise: exerciseName, prType: prTypeRaw, sheetValue: value,
            recomputed, dateAchieved,
          })
        }
      }
    }

    console.log(`Oracle 2: log window ${logMinDate}..${logMaxDate}; ${inRange} PBs in-range (asserted equal), ${outOfRange} out-of-range (asserted bounded)`)

    // Diagnostic (informational, not gating): detect exact-duplicate raw
    // Training Log rows. A duplicated row inflates a session's summed
    // volume (weight*reps counted twice) but never changes any single-set
    // e1RM maximum — so if this finds duplicate sessions, any in-range
    // Session Volume failure above is most likely a source-data artifact
    // in the staged export, not a domain/faithfulness bug.
    if (inRangeFailures.length > 0) {
      const rawRowCounts = new Map<string, number>()
      for (const row of rows) {
        const key = JSON.stringify(row)
        rawRowCounts.set(key, (rawRowCounts.get(key) ?? 0) + 1)
      }
      const duplicateSessionKeys = new Set<string>()
      for (const [key, count] of rawRowCounts) {
        if (count <= 1) continue
        const row = JSON.parse(key) as LogRow
        duplicateSessionKeys.add(`${parseDate(row[0])}|${row[1]}`)
      }
      if (duplicateSessionKeys.size > 0) {
        console.log(
          `Oracle 2 diagnostic: found exact-duplicate raw rows within ${duplicateSessionKeys.size} (date|session) group(s) — `
          + `${[...duplicateSessionKeys].join(', ')}. This is a source-data issue in the staged export `
          + '(rows logged twice), not a domain bug: it only inflates summed Session Volume, never a single-set e1RM max.',
        )
      }
    }
    if (inRangeFailures.length > 0) {
      console.log('Oracle 2 in-range failures:', JSON.stringify(inRangeFailures, null, 2))
    }
    if (outOfRangeFailures.length > 0) {
      console.log('Oracle 2 out-of-range bound violations:', JSON.stringify(outOfRangeFailures, null, 2))
    }

    expect(inRange).toBeGreaterThan(0)
    expect(outOfRange).toBeGreaterThan(0)
    expect(inRangeFailures).toEqual([])
    expect(outOfRangeFailures).toEqual([])
  })

  it('oracle 3 (sanity): highest V-grade sent in the log does not exceed the stored Max V-Grade PB', () => {
    const { climbingSends } = toSessions(raw, nameToIdResult)

    let highestSentGrade = -1
    for (const send of climbingSends) {
      const g = Number(send.grade.replace('V', ''))
      if (!Number.isNaN(g) && g > highestSentGrade) highestSentGrade = g
    }

    const maxVGradePB = raw.personalBests.find(r => str(r['PR Type']) === 'Max V-Grade')
    const storedMaxGrade = maxVGradePB ? num(maxVGradePB.Value) : null
    const storedMaxGradeDate = maxVGradePB ? parseDate(maxVGradePB['Date Achieved']) : null

    console.log(`Oracle 3: highest sent grade in log = V${highestSentGrade}; stored PB = V${storedMaxGrade ?? '?'} (achieved ${storedMaxGradeDate ?? 'unknown'})`)

    if (storedMaxGrade != null) {
      expect(highestSentGrade).toBeLessThanOrEqual(storedMaxGrade)
    }
  })
})
