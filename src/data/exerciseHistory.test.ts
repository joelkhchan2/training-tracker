import { describe, expect, it } from 'vitest'
import { buildExerciseHistory, applyAutofill, buildTodayExerciseIdMap } from './exerciseHistory'

const rows = [
  // session B (newer) — 2 working sets + 1 warmup
  { session_id: 'sB', date: '2026-07-20', set_number: 1, weight: 45, reps: 5, is_warmup: true },
  { session_id: 'sB', date: '2026-07-20', set_number: 2, weight: 135, reps: 5, is_warmup: false },
  { session_id: 'sB', date: '2026-07-20', set_number: 3, weight: 155, reps: 3, is_warmup: false },
  // session A (older) — 1 working set
  { session_id: 'sA', date: '2026-07-13', set_number: 1, weight: 125, reps: 5, is_warmup: false },
]

describe('buildExerciseHistory', () => {
  it('groups by session, newest-first, e1RM+volume over non-warmup, warmup listed but not counted', () => {
    const out = buildExerciseHistory(rows)
    expect(out.map(s => s.sessionId)).toEqual(['sB', 'sA']) // newest first
    expect(out[0].sets).toHaveLength(3) // warmup still listed
    expect(out[0].volume).toBe(135 * 5 + 155 * 3) // warmup excluded
    expect(out[0].e1rm).toBeGreaterThan(155) // epley top set, > raw top weight
    expect(out[1].volume).toBe(125 * 5)
  })
  it('caps at 10 sessions', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      session_id: `s${i}`, date: `2026-07-${String(i + 1).padStart(2, '0')}`, set_number: 1, weight: 100, reps: 5, is_warmup: false,
    }))
    expect(buildExerciseHistory(many)).toHaveLength(10)
  })
})

describe('applyAutofill (per-set, weight-only, fallback)', () => {
  const last = { Curl: [{ weight: 30, reps: 12 }, { weight: 30, reps: 10 }] }
  it('fills weight for no-prescribed-weight sets by set index; never overrides a real weight', () => {
    const rx = [
      { exerciseName: 'Squat', sets: [{ weight: 135, reps: 5 }, { weight: 135, reps: 5 }] }, // prescribed → untouched
      { exerciseName: 'Curl', sets: [{ weight: undefined, reps: 12 }, { weight: 0, reps: 10 }, { weight: undefined, reps: 10 }] },
    ] as never
    const out = applyAutofill(rx, last) as never as { exerciseName: string; sets: { weight?: number; reps: number }[] }[]
    expect(out[0].sets.map(s => s.weight)).toEqual([135, 135]) // program weight authoritative
    expect(out[1].sets[0].weight).toBe(30) // undefined → filled from last set 1
    expect(out[1].sets[1].weight).toBe(30) // 0 → filled from last set 2
    expect(out[1].sets[2].weight).toBeUndefined() // today has more sets than last → blank
    expect(out[1].sets[0].reps).toBe(12) // prescribed reps target unchanged
  })
  it('no-op when exercise has no last data', () => {
    const rx = [{ exerciseName: 'Dip', sets: [{ weight: undefined, reps: 8 }] }] as never
    expect((applyAutofill(rx, {}) as never as { sets: { weight?: number }[] }[])[0].sets[0].weight).toBeUndefined()
  })
  it('never overrides a real prescribed weight, but still fills a sibling no-weight set', () => {
    const lastWithData = { Bench: [{ weight: 95, reps: 8 }, { weight: 95, reps: 8 }] }
    const rx = [
      { exerciseName: 'Bench', sets: [{ weight: 135, reps: 5 }, { weight: undefined, reps: 5 }] },
    ] as never
    const out = applyAutofill(rx, lastWithData) as never as { sets: { weight?: number }[] }[]
    expect(out[0].sets[0].weight).toBe(135) // real prescribed weight — not overridden
    expect(out[0].sets[1].weight).toBe(95) // sibling no-weight set — filled
  })
})

describe('buildTodayExerciseIdMap', () => {
  it("maps today's program-day exercise names to ids (not other days)", () => {
    const bundle = {
      cursor: { dayIndex: 0 },
      days: [{ id: 'day-0' }, { id: 'day-1' }],
      programExercises: [
        { program_day_id: 'day-0', exercise_id: 'ex-squat' },
        { program_day_id: 'day-1', exercise_id: 'ex-bench' }, // other day — excluded
      ],
      exercisesById: { 'ex-squat': { name: 'Squat' }, 'ex-bench': { name: 'Bench Press' } },
    } as never
    expect(buildTodayExerciseIdMap(bundle)).toEqual({ Squat: 'ex-squat' })
  })
})
