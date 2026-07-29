import { describe, expect, it } from 'vitest'
import { buildStrengthRecords, buildClimbingRecord, filterSortRecords, type StrengthRecord } from './personalRecords'

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

  it('carries movementPattern from a live row; seeded-only exercises resolve to null', () => {
    const seeded = [{ exerciseId: 'dl', name: 'Deadlift', prType: 'e1rm' as const, value: 440, weight: 405, reps: 3 }]
    const live = [{ exerciseId: 's', name: 'Squat', sessionId: 'x', weight: 315, reps: 3, movementPattern: 'squat' }]
    const out = buildStrengthRecords(seeded, live)
    const squat = out.find(r => r.exerciseId === 's')
    const deadlift = out.find(r => r.exerciseId === 'dl')
    expect(squat?.movementPattern).toBe('squat')
    expect(deadlift?.movementPattern).toBeNull()
  })

  it('an exercise with only timed/weighted_time live rows produces bestDuration>0 while bestE1rm/bestVolume stay 0', () => {
    const liveDurations = [
      { exerciseId: 'flp', name: 'Front Lever Progression', weight: null, durationSeconds: 8, movementPattern: null },
      { exerciseId: 'flp', name: 'Front Lever Progression', weight: null, durationSeconds: 12, movementPattern: null },
    ]
    const [r] = buildStrengthRecords([], [], liveDurations)
    expect(r.bestDuration).toBe(12)
    expect(r.bestE1rm).toBe(0)
    expect(r.bestVolume).toBe(0)
  })

  it('a weighted_time row carries its weight into bestDurationWeight; a pure timed row leaves it null', () => {
    const weightedTime = [{ exerciseId: 'hang', name: 'Weighted Dead Hang', weight: 25, durationSeconds: 30, movementPattern: null }]
    const [withWeight] = buildStrengthRecords([], [], weightedTime)
    expect(withWeight.bestDuration).toBe(30)
    expect(withWeight.bestDurationWeight).toBe(25)

    const bodyweightTimed = [{ exerciseId: 'flp', name: 'Front Lever Progression', weight: null, durationSeconds: 8, movementPattern: null }]
    const [noWeight] = buildStrengthRecords([], [], bodyweightTimed)
    expect(noWeight.bestDuration).toBe(8)
    expect(noWeight.bestDurationWeight).toBeNull()
  })

  it('reconciles a seeded max_duration row against live the same way e1rm does (larger wins, weight carried from the winning side)', () => {
    const seeded = [{ exerciseId: 'flp', name: 'Front Lever Progression', prType: 'max_duration' as const, value: 15, weight: null, reps: null }]
    const liveBeatsSeed = [{ exerciseId: 'flp', name: 'Front Lever Progression', weight: null, durationSeconds: 20, movementPattern: null }]

    const [beatenBySeed] = buildStrengthRecords(seeded, [], [])
    expect(beatenBySeed.bestDuration).toBe(15)

    const [beatsSeed] = buildStrengthRecords(seeded, [], liveBeatsSeed)
    expect(beatsSeed.bestDuration).toBe(20)
    expect(beatsSeed.bestDurationWeight).toBeNull() // live side won, and its weight is null
  })

  it('carries movementPattern from a duration-only row (e.g. Front Lever) instead of leaving it null/Other', () => {
    const liveDurations = [
      { exerciseId: 'flp', name: 'Front Lever Progression', weight: null, durationSeconds: 12, movementPattern: 'pull' },
    ]
    const [r] = buildStrengthRecords([], [], liveDurations)
    expect(r.movementPattern).toBe('pull')
  })

  it('does not overwrite a real movementPattern with a null one from a later duration row', () => {
    const liveDurations = [
      { exerciseId: 'flp', name: 'Front Lever Progression', weight: null, durationSeconds: 8, movementPattern: 'pull' },
      { exerciseId: 'flp', name: 'Front Lever Progression', weight: null, durationSeconds: 12, movementPattern: null },
    ]
    const [r] = buildStrengthRecords([], [], liveDurations)
    expect(r.movementPattern).toBe('pull')
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

describe('filterSortRecords', () => {
  const records: StrengthRecord[] = [
    { exerciseId: 'sq', exerciseName: 'Squat', bestE1rm: 300, bestE1rmWeight: 275, bestE1rmReps: 3, bestVolume: 4000, bestDuration: 0, bestDurationWeight: null, movementPattern: 'squat' },
    { exerciseId: 'bp', exerciseName: 'Bench Press', bestE1rm: 200, bestE1rmWeight: 185, bestE1rmReps: 3, bestVolume: 6000, bestDuration: 0, bestDurationWeight: null, movementPattern: 'push' },
    { exerciseId: 'ohp', exerciseName: 'Overhead Press', bestE1rm: 120, bestE1rmWeight: 105, bestE1rmReps: 4, bestVolume: 2000, bestDuration: 0, bestDurationWeight: null, movementPattern: 'push' },
    { exerciseId: 'cur', exerciseName: 'Curl', bestE1rm: 80, bestE1rmWeight: 60, bestE1rmReps: 8, bestVolume: 8000, bestDuration: 0, bestDurationWeight: null, movementPattern: null },
  ]

  it('empty opts returns input sorted by e1RM desc (reproduces current order)', () => {
    const out = filterSortRecords(records, { query: '', pattern: 'all', sort: 'e1rm' })
    expect(out.map(r => r.exerciseName)).toEqual(['Squat', 'Bench Press', 'Overhead Press', 'Curl'])
  })

  it('filters by name substring, case-insensitive', () => {
    const out = filterSortRecords(records, { query: 'squ', pattern: 'all', sort: 'e1rm' })
    expect(out.map(r => r.exerciseName)).toEqual(['Squat'])
  })

  it('filters by movement pattern', () => {
    expect(filterSortRecords(records, { query: '', pattern: 'push', sort: 'e1rm' }).map(r => r.exerciseName))
      .toEqual(['Bench Press', 'Overhead Press'])
    expect(filterSortRecords(records, { query: '', pattern: 'other', sort: 'e1rm' }).map(r => r.exerciseName))
      .toEqual(['Curl'])
    expect(filterSortRecords(records, { query: '', pattern: 'all', sort: 'e1rm' })).toHaveLength(4)
  })

  it('sorts by volume descending', () => {
    const out = filterSortRecords(records, { query: '', pattern: 'all', sort: 'volume' })
    expect(out.map(r => r.exerciseName)).toEqual(['Curl', 'Bench Press', 'Squat', 'Overhead Press'])
  })

  it('sorts by name A-Z', () => {
    const out = filterSortRecords(records, { query: '', pattern: 'all', sort: 'name' })
    expect(out.map(r => r.exerciseName)).toEqual(['Bench Press', 'Curl', 'Overhead Press', 'Squat'])
  })
})
