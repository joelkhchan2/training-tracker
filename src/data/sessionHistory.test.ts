import { describe, expect, it } from 'vitest'
import { buildHistoryRows, buildClimbingBreakdown } from './sessionHistory'

const sessions = [
  { id: 's-cardio', discipline: 'cardio' as const, date: '2026-07-21', session_type: null, duration_minutes: 32 },
  { id: 's-strength', discipline: 'strength' as const, date: '2026-07-20', session_type: 'Gym A', duration_minutes: null },
  { id: 's-climb', discipline: 'climbing' as const, date: '2026-07-19', session_type: null, duration_minutes: null },
]

describe('buildHistoryRows', () => {
  it('builds a cardio row with pace from the joined activity', () => {
    const cardio = new Map([['s-cardio', { activity: 'Run', duration_minutes: 32, distance_km: 5.2 }]])
    const [row] = buildHistoryRows(sessions.slice(0, 1), cardio, new Map())
    expect(row).toEqual({
      kind: 'cardio', id: 's-cardio', date: '2026-07-21',
      activity: 'Run', durationMinutes: 32, distanceKm: 5.2, pace: '6:09',
    })
  })

  it('cardio row has null pace when distance is absent', () => {
    const cardio = new Map([['s-cardio', { activity: 'Walk', duration_minutes: 20, distance_km: null }]])
    const [row] = buildHistoryRows(sessions.slice(0, 1), cardio, new Map())
    expect(row).toMatchObject({ kind: 'cardio', pace: null, distanceKm: null })
  })

  it('builds a strength row with its set count and label', () => {
    const rows = buildHistoryRows(sessions.slice(1, 2), new Map(), new Map([['s-strength', 12]]))
    expect(rows[0]).toEqual({ kind: 'strength', id: 's-strength', date: '2026-07-20', label: 'Gym A', setCount: 12 })
  })

  it('builds a climbing row with a highest-first breakdown and total sends', () => {
    const climbing = new Map([['s-climb', [
      { grade: 'V2', count: 1, attempts: 2 }, { grade: 'V4', count: 3, attempts: 5 }, { grade: 'V3', count: 2, attempts: 3 },
    ]]])
    const [row] = buildHistoryRows(sessions.slice(2, 3), new Map(), new Map(), climbing)
    expect(row).toEqual({
      kind: 'climbing', id: 's-climb', date: '2026-07-19',
      breakdown: 'V4×3, V3×2, V2×1', totalSends: 6, totalAttempts: 10,
    })
  })

  it('keeps all three disciplines, order preserved', () => {
    const climbing = new Map([['s-climb', [{ grade: 'V1', count: 1, attempts: 1 }]]])
    const rows = buildHistoryRows(sessions, new Map(), new Map(), climbing)
    expect(rows.map(r => r.id)).toEqual(['s-cardio', 's-strength', 's-climb'])
  })
})

describe('buildClimbingBreakdown', () => {
  it('lists sent grades highest-first and totals sends + attempts', () => {
    const { breakdown, totalSends, totalAttempts } = buildClimbingBreakdown([
      { grade: 'V3', count: 2, attempts: 4 },
      { grade: 'V4', count: 3, attempts: 8 },
    ])
    expect(breakdown).toBe('V4×3, V3×2')
    expect(totalSends).toBe(5)
    expect(totalAttempts).toBe(12)
  })

  it('omits zero-send grades from the breakdown (no ×0) but counts their attempts', () => {
    const { breakdown, totalSends, totalAttempts } = buildClimbingBreakdown([
      { grade: 'V6', count: 0, attempts: 8 },
      { grade: 'V4', count: 1, attempts: 3 },
    ])
    expect(breakdown).toBe('V4×1')
    expect(totalSends).toBe(1)
    expect(totalAttempts).toBe(11)
  })

  it('returns an empty breakdown for a projecting-only session', () => {
    const { breakdown, totalSends, totalAttempts } = buildClimbingBreakdown([
      { grade: 'V6', count: 0, attempts: 8 },
    ])
    expect(breakdown).toBe('')
    expect(totalSends).toBe(0)
    expect(totalAttempts).toBe(8)
  })
})
