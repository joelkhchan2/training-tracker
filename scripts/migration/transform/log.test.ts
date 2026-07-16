import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { loadExport } from '../loadExport.ts'
import type { RawExport } from '../exportSchema.ts'
import type { NameToIdResult } from './exercises.ts'
import { toExerciseCatalog, buildNameToId } from './exercises.ts'
import { toSessions } from './log.ts'

/** Builds a 33-column Training Log row (idx 0-32 per the mapping doc),
 * defaulting every column to null and overriding only what a test cares
 * about, so fixtures stay readable and don't drift if unrelated columns
 * are added upstream. */
function row(overrides: Record<number, string | number | null>): (string | number | null)[] {
  const cells = new Array(33).fill(null)
  for (const [idx, value] of Object.entries(overrides)) {
    cells[Number(idx)] = value
  }
  return cells
}

function emptyRawExport(trainingLogMatrix: (string | number | null)[][]): RawExport {
  return {
    trainingLog: [],
    trainingLogMatrix,
    exercises: [],
    personalBests: [],
    settings: [],
    templates: [],
    goals: [],
    sheetNames: [],
  }
}

function fixtureNameToId(): NameToIdResult {
  return {
    map: new Map([
      ['barbell back squat', 'ex-squat-id'],
      ['pull-up', 'ex-pullup-id'],
    ]),
    extraRows: [],
    createdFromLog: [],
  }
}

describe('toSessions (synthetic fixture, one row per entry type)', () => {
  const strengthRow = row({
    0: '2026-07-06',
    1: 'Monday Full-body Strength A',
    2: 'Strength',
    3: 'Barbell Back Squat',
    4: '1',
    5: '135',
    6: '8',
    7: '7',
    23: '180',
  })
  const calisthenicsRow = row({
    0: '2026-07-06',
    1: 'Monday Full-body Strength A',
    2: 'Calisthenics',
    3: 'Pull-up',
    4: '1',
    6: '10',
  })
  const unmatchedStrengthRow = row({
    0: '2026-07-06',
    1: 'Monday Full-body Strength A',
    2: 'Strength',
    3: 'Some Brand New Exercise',
    4: '2',
    5: '45',
    6: '12',
  })
  const climbingRow = row({
    0: '2026-07-06',
    1: 'Gym B',
    2: 'Climbing',
    9: '2', // V0 count
    11: '1', // V2 count
    // V1, V3-V8 left null/0 -> should not emit sends
  })
  const cardioRow = row({
    0: '7/6/26', // M/D/YY format, same calendar date as the ISO rows above
    1: 'Cardio Day',
    2: 'Cardio',
    3: 'Running',
    30: '30',
    31: 'Easy run',
    32: '5',
  })
  const gtgRow = row({
    0: '2026-07-07',
    2: 'GTG',
    3: 'Pull-up',
    6: '5',
  })
  const dailyCheckinRow = row({
    0: '2026-07-07',
    2: 'Daily Check-in',
    23: '179.5',
    24: '7.5',
    25: '8',
    26: '8000',
    27: '6',
    28: '3',
  })
  const skippedRow = row({
    0: '2026-07-08',
    1: 'Rest Day',
    2: 'Skipped',
  })

  const raw = emptyRawExport([
    strengthRow,
    calisthenicsRow,
    unmatchedStrengthRow,
    climbingRow,
    cardioRow,
    gtgRow,
    dailyCheckinRow,
    skippedRow,
  ])
  const result = toSessions(raw, fixtureNameToId())

  it('groups Strength + Calisthenics rows sharing a (date, session) into one session', () => {
    const strengthSession = result.sessions.find(s => s.session_type === 'Monday Full-body Strength A')
    expect(strengthSession).toBeDefined()
    expect(strengthSession?.date).toBe('2026-07-06')
    expect(strengthSession?.discipline).toBe('strength')
    expect(strengthSession?.body_weight).toBe(180)
    expect(strengthSession?.client_id).toBe('mig:2026-07-06|Monday Full-body Strength A')
    expect(strengthSession?.status).toBe('completed')
  })

  it('creates a separate session per distinct session name, even on the same date', () => {
    const names = result.sessions.map(s => s.session_type)
    expect(names).toContain('Monday Full-body Strength A')
    expect(names).toContain('Gym B')
    expect(names).toContain('Cardio Day')
    // GTG / Daily Check-in / Skipped never form sessions.
    expect(names).not.toContain('Rest Day')
  })

  it('resolves strength/calisthenics exercise names via nameToId and collects unmatched ones', () => {
    const squat = result.strengthSets.find(s => s.set_number === 1 && s.weight === 135)
    expect(squat?.exercise_id).toBe('ex-squat-id')
    expect(squat?.reps).toBe(8)
    expect(squat?.rpe).toBe(7)

    const pullup = result.strengthSets.find(s => s.reps === 10)
    expect(pullup?.exercise_id).toBe('ex-pullup-id')

    const unmatchedSet = result.strengthSets.find(s => s.set_number === 2)
    expect(unmatchedSet?.exercise_id).toBeNull()
    expect(result.unmatched).toEqual(['Some Brand New Exercise'])
  })

  it('emits climbing sends only for grades with count > 0, using v_scale grade labels', () => {
    expect(result.climbingSends).toHaveLength(2)
    expect(result.climbingSends.every(send => send.grade_system === 'v_scale')).toBe(true)
    expect(result.climbingSends.map(send => send.grade).sort()).toEqual(['V0', 'V2'])
    expect(result.climbingSends.find(send => send.grade === 'V0')?.count).toBe(2)
  })

  it('parses M/D/YY dates the same as YYYY-MM-DD and builds a cardio activity row', () => {
    const cardioSession = result.sessions.find(s => s.session_type === 'Cardio Day')
    expect(cardioSession?.date).toBe('2026-07-06')

    expect(result.cardioActivities).toHaveLength(1)
    expect(result.cardioActivities[0]).toMatchObject({
      activity: 'Running',
      duration_minutes: 30,
      distance_km: 5,
      notes: 'Easy run',
    })
  })

  it('routes GTG rows to calisthenicsSets, date-based rather than session-based', () => {
    expect(result.calisthenicsSets).toHaveLength(1)
    expect(result.calisthenicsSets[0]).toMatchObject({
      date: '2026-07-07',
      exercise: 'Pull-up',
      value: 5,
      client_id: 'mig:gtg:2026-07-07|Pull-up',
    })
  })

  it('routes Daily Check-in rows to dailyCheckins, date-based rather than session-based', () => {
    expect(result.dailyCheckins).toHaveLength(1)
    expect(result.dailyCheckins[0]).toMatchObject({
      date: '2026-07-07',
      body_weight: 179.5,
      sleep_hours: 7.5,
      sleep_quality: 8,
      steps: 8000,
      energy: 6,
      soreness: 3,
    })
  })

  it('skips Skipped/other entry types entirely', () => {
    expect(result.sessions.some(s => s.session_type === 'Rest Day')).toBe(false)
    // 3 real sessions total: Strength A, Gym B, Cardio Day.
    expect(result.sessions).toHaveLength(3)
  })
})

describe('toSessions (exact-duplicate row dedup — double-submit artifact)', () => {
  it('drops an exact-duplicate row (same date/session/entry type/exercise/set/weight/reps/V-block), keeping only one strengthSet', () => {
    const original = row({
      0: '2026-07-06',
      1: 'Monday Full-body Strength A',
      2: 'Strength',
      3: 'Barbell Back Squat',
      4: '1',
      5: '135',
      6: '8',
      7: '7',
    })
    const exactDuplicate = row({
      0: '2026-07-06',
      1: 'Monday Full-body Strength A',
      2: 'Strength',
      3: 'Barbell Back Squat',
      4: '1',
      5: '135',
      6: '8',
      7: '7',
    })

    const raw = emptyRawExport([original, exactDuplicate])
    const result = toSessions(raw, fixtureNameToId())

    expect(result.strengthSets).toHaveLength(1)
    expect(result.duplicatesRemoved).toBe(1)
  })

  it('keeps both rows when the set number matches but weight/reps differ (a legitimate second set, not a dupe)', () => {
    const setOne = row({
      0: '2026-07-06',
      1: 'Monday Full-body Strength A',
      2: 'Strength',
      3: 'Barbell Back Squat',
      4: '1',
      5: '135',
      6: '8',
      7: '7',
    })
    const setOneDifferentWeight = row({
      0: '2026-07-06',
      1: 'Monday Full-body Strength A',
      2: 'Strength',
      3: 'Barbell Back Squat',
      4: '1',
      5: '145', // different weight -> not a duplicate, even though set number matches
      6: '8',
      7: '7',
    })

    const raw = emptyRawExport([setOne, setOneDifferentWeight])
    const result = toSessions(raw, fixtureNameToId())

    expect(result.strengthSets).toHaveLength(2)
    expect(result.duplicatesRemoved).toBe(0)
  })

  it('keeps both rows when two identical GTG rows are logged the same day (legitimate repeat, not a dupe)', () => {
    const gtgOne = row({
      0: '2026-07-06',
      2: 'GTG',
      3: 'Push-up',
      6: '10',
    })
    const gtgTwo = row({
      0: '2026-07-06',
      2: 'GTG',
      3: 'Push-up',
      6: '10',
    })

    const raw = emptyRawExport([gtgOne, gtgTwo])
    const result = toSessions(raw, fixtureNameToId())

    expect(result.calisthenicsSets).toHaveLength(2)
    expect(result.duplicatesRemoved).toBe(0)
  })

  it('still collapses two identical Strength rows (same set number) to one, alongside untouched GTG duplicates', () => {
    const strengthOne = row({
      0: '2026-07-06',
      1: 'Monday Full-body Strength A',
      2: 'Strength',
      3: 'Barbell Back Squat',
      4: '1',
      5: '135',
      6: '8',
      7: '7',
    })
    const strengthDuplicate = row({
      0: '2026-07-06',
      1: 'Monday Full-body Strength A',
      2: 'Strength',
      3: 'Barbell Back Squat',
      4: '1',
      5: '135',
      6: '8',
      7: '7',
    })
    const gtgOne = row({
      0: '2026-07-06',
      2: 'GTG',
      3: 'Push-up',
      6: '10',
    })
    const gtgTwo = row({
      0: '2026-07-06',
      2: 'GTG',
      3: 'Push-up',
      6: '10',
    })

    const raw = emptyRawExport([strengthOne, strengthDuplicate, gtgOne, gtgTwo])
    const result = toSessions(raw, fixtureNameToId())

    expect(result.strengthSets).toHaveLength(1)
    expect(result.calisthenicsSets).toHaveLength(2)
    expect(result.duplicatesRemoved).toBe(1)
  })
})

// The real staged export (git-ignored) lives at scripts/migration/.data/export.xlsx.
// Vitest's cwd is the repo root, matching how scripts/migration/inspect.ts resolves it.
const dataPath = path.resolve(process.cwd(), 'scripts/migration/.data/export.xlsx')

describe.skipIf(!existsSync(dataPath))('toSessions (real export)', () => {
  const raw = loadExport(dataPath)
  const catalog = toExerciseCatalog(raw)
  const nameToId = buildNameToId(catalog, raw)
  const result = toSessions(raw, nameToId)

  it('produces at least one session, each with a client_id and a YYYY-MM-DD date', () => {
    expect(result.sessions.length).toBeGreaterThan(0)
    for (const session of result.sessions) {
      expect(session.client_id).toBeTruthy()
      expect(session.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('resolves every strength/calisthenics set to a real exercise_id (unmatched is empty)', () => {
    expect(result.unmatched).toEqual([])
    expect(result.strengthSets.length).toBeGreaterThan(0)
    for (const set of result.strengthSets) {
      expect(set.exercise_id).not.toBeNull()
    }
  })

  it('only emits climbing sends where count > 0', () => {
    for (const send of result.climbingSends) {
      expect(send.count).toBeGreaterThan(0)
      expect(send.grade_system).toBe('v_scale')
    }
  })

  it('produces GTG calisthenics sets and daily check-ins', () => {
    expect(result.calisthenicsSets.length).toBeGreaterThan(0)
    expect(result.dailyCheckins.length).toBeGreaterThan(0)
  })

  it('prints a summary of counts per output table', () => {
    const summary = {
      sessions: result.sessions.length,
      strengthSets: result.strengthSets.length,
      climbingSends: result.climbingSends.length,
      cardioActivities: result.cardioActivities.length,
      calisthenicsSets: result.calisthenicsSets.length,
      dailyCheckins: result.dailyCheckins.length,
      unmatched: result.unmatched,
      duplicatesRemoved: result.duplicatesRemoved,
    }
    console.log('Training Log transform summary (real export):', summary)
    expect(summary.sessions).toBeGreaterThan(0)
  })
})
