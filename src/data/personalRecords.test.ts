import { describe, expect, it } from 'vitest'
import { buildStrengthRecords, buildClimbingRecord } from './personalRecords'

describe('buildStrengthRecords', () => {
  it('keeps a seeded-only exercise that has no live sets (preserves old all-time PR)', () => {
    const seeded = [{ exerciseId: 'dl', name: 'Deadlift', prType: 'e1rm' as const, value: 440, weight: 405, reps: 3 }]
    const out = buildStrengthRecords(seeded, [])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ exerciseId: 'dl', exerciseName: 'Deadlift', bestE1rm: 440, bestE1rmWeight: 405, bestE1rmReps: 3, bestVolume: 0 })
  })

  it('lets a heavier live set beat a stale seed and carries the live set', () => {
    const seeded = [{ exerciseId: 's', name: 'Squat', prType: 'e1rm' as const, value: 299, weight: 275, reps: 2 }]
    const live = [{ exerciseId: 's', name: 'Squat', sessionId: 'x', weight: 315, reps: 3 }] // epley ~346.5
    const [r] = buildStrengthRecords(seeded, live)
    expect(r.bestE1rm).toBeGreaterThan(299)
    expect(r.bestE1rmWeight).toBe(315)
    expect(r.bestE1rmReps).toBe(3)
  })

  it('lets a seed beat a lighter live set and carries the seeded weight/reps', () => {
    const seeded = [{ exerciseId: 's', name: 'Squat', prType: 'e1rm' as const, value: 365, weight: 335, reps: 3 }]
    const live = [{ exerciseId: 's', name: 'Squat', sessionId: 'x', weight: 275, reps: 5 }] // epley ~320.8
    const [r] = buildStrengthRecords(seeded, live)
    expect(r.bestE1rm).toBe(365)
    expect(r.bestE1rmWeight).toBe(335)
    expect(r.bestE1rmReps).toBe(3)
  })

  it('takes best volume as max per-session tonnage vs seeded volume', () => {
    const seeded = [{ exerciseId: 's', name: 'Squat', prType: 'volume' as const, value: 5000, weight: null, reps: null }]
    const live = [
      { exerciseId: 's', name: 'Squat', sessionId: 'a', weight: 100, reps: 10 }, // session a: 1000
      { exerciseId: 's', name: 'Squat', sessionId: 'a', weight: 100, reps: 10 }, // session a total 2000
      { exerciseId: 's', name: 'Squat', sessionId: 'b', weight: 200, reps: 30 }, // session b: 6000
    ]
    const [r] = buildStrengthRecords(seeded, live)
    expect(r.bestVolume).toBe(6000) // live session b beats seeded 5000; not summed across sessions
  })

  it('sorts by bestE1rm descending and includes an exercise present in only one source', () => {
    const seeded = [{ exerciseId: 'a', name: 'A', prType: 'e1rm' as const, value: 100, weight: 90, reps: 3 }]
    const live = [{ exerciseId: 'b', name: 'B', sessionId: 'x', weight: 200, reps: 1 }] // epley ~206.7
    const out = buildStrengthRecords(seeded, live)
    expect(out.map(r => r.exerciseName)).toEqual(['B', 'A'])
  })

  it('returns [] for no data', () => {
    expect(buildStrengthRecords([], [])).toEqual([])
  })
})

describe('buildClimbingRecord', () => {
  it('takes the max of seeded and live', () => {
    expect(buildClimbingRecord(5, ['V3', 'V4'])).toBe(5) // seed V5 beats live V4
    expect(buildClimbingRecord(4, ['V6', 'V2'])).toBe(6) // live V6 beats seed V4
  })
  it('ignores unparseable grades', () => {
    expect(buildClimbingRecord(null, ['6C', 'V2'])).toBe(2)
  })
  it('returns null when both sources are empty', () => {
    expect(buildClimbingRecord(null, [])).toBeNull()
    expect(buildClimbingRecord(null, ['6C'])).toBeNull()
  })
})
