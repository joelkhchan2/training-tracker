import { describe, expect, it } from 'vitest'
import { buildHistoryRows } from './sessionHistory'

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

  it('excludes non-strength/cardio sessions (climbing has no renderer yet)', () => {
    const rows = buildHistoryRows(sessions, new Map(), new Map())
    expect(rows.map(r => r.id)).toEqual(['s-cardio', 's-strength']) // order preserved, climbing dropped
  })
})
