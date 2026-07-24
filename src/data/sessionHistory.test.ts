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
      { grade: 'V2', count: 1 }, { grade: 'V4', count: 3 }, { grade: 'V3', count: 2 },
    ]]])
    const [row] = buildHistoryRows(sessions.slice(2, 3), new Map(), new Map(), climbing)
    expect(row).toEqual({
      kind: 'climbing', id: 's-climb', date: '2026-07-19',
      breakdown: 'V4×3, V3×2, V2×1', totalSends: 6,
    })
  })

  it('keeps all three disciplines, order preserved', () => {
    const climbing = new Map([['s-climb', [{ grade: 'V1', count: 1 }]]])
    const rows = buildHistoryRows(sessions, new Map(), new Map(), climbing)
    expect(rows.map(r => r.id)).toEqual(['s-cardio', 's-strength', 's-climb'])
  })
})

describe('buildClimbingBreakdown', () => {
  it('orders grades high-to-low and sums counts', () => {
    expect(buildClimbingBreakdown([
      { grade: 'V0', count: 2 }, { grade: 'V5', count: 1 }, { grade: 'V3', count: 4 },
    ])).toEqual({ breakdown: 'V5×1, V3×4, V0×2', totalSends: 7 })
  })

  it('drops unparseable grades from the breakdown', () => {
    expect(buildClimbingBreakdown([
      { grade: 'V2', count: 1 }, { grade: 'VX', count: 9 },
    ])).toEqual({ breakdown: 'V2×1', totalSends: 1 })
  })
})
