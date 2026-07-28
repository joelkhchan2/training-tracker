import { describe, expect, it } from 'vitest'
import { muscleTokens, suggestAlternates, type CandidateExercise } from './alternates'

const ex = (
  id: string,
  name: string,
  primaryMuscles: string | null,
  movementPattern: string | null = null,
  exerciseType: string | null = 'weighted',
  equipment: string | null = null,
): CandidateExercise => ({ id, name, exerciseType, primaryMuscles, movementPattern, equipment })

describe('muscleTokens', () => {
  it('splits, lowercases, trims, drops empties', () => {
    expect([...muscleTokens('Chest, Shoulders , ,triceps')]).toEqual(['chest', 'shoulders', 'triceps'])
  })
  it('empty for null', () => { expect(muscleTokens(null).size).toBe(0) })
})

describe('suggestAlternates', () => {
  // primary_muscles strings copied VERBATIM from the live catalog (2026-07-27) so these pin the
  // user's real acceptance examples, not hand-authored tokens. Barbell Squat vs Barbell Deadlift
  // share {quadriceps,calves,glutes,hamstrings,back}=5; vs Barbell Front Squat share 4.
  const squat = ex('sq', 'Barbell Squat', 'quadriceps, calves, glutes, hamstrings, back', 'squat')
  const deadlift = ex('dl', 'Barbell Deadlift', 'lower back, hamstrings, back, calves, arms, glutes, hamstrings, lats, back, quadriceps, traps', 'pull')
  const frontSquat = ex('fs', 'Barbell Front Squat', 'quadriceps, glutes, hamstrings, back', 'squat')
  const legExt = ex('le', 'Leg Extension', 'quadriceps', 'squat')
  const curl = ex('cu', 'Biceps Curl', 'biceps', 'pull')

  it('ranks by shared-token count desc, excludes zero-overlap + self (real squat/deadlift data)', () => {
    const out = suggestAlternates(squat, [squat, deadlift, frontSquat, legExt, curl])
    expect(out.map(a => a.id)).not.toContain('sq') // self excluded
    expect(out.map(a => a.id)).not.toContain('cu') // zero overlap excluded
    expect(out[0].id).toBe('dl') // deadlift shares 5 > front squat 4 > leg ext 1
    expect(out[0].sharedCount).toBe(5)
    expect(out.map(a => a.id)).toEqual(['dl', 'fs', 'le'])
  })
  it('movement_pattern breaks ties, then name', () => {
    const a = ex('a', 'Zebra', 'chest', 'push')
    const b = ex('b', 'Alpha', 'chest', 'push')
    const cur = ex('c', 'Cur', 'chest', 'push')
    // a & b both share 1 token + same pattern → name asc → Alpha(b) before Zebra(a)
    expect(suggestAlternates(cur, [a, b]).map(x => x.id)).toEqual(['b', 'a'])
  })
  it('excludes current by resolved id even if a name-casing twin exists', () => {
    const cur = ex('sq', 'Squat', 'quadriceps, glutes')
    const twin = ex('sq2', 'squat', 'quadriceps, glutes') // different id, same-ish name
    const out = suggestAlternates(cur, [cur, twin])
    expect(out.map(a => a.id)).toEqual(['sq2']) // only the real self (id sq) excluded
  })
  it('respects limit and returns [] for null current or no tokens', () => {
    expect(suggestAlternates(null, [squat])).toEqual([])
    expect(suggestAlternates(ex('x', 'X', null), [squat])).toEqual([])
    expect(suggestAlternates(squat, [deadlift, frontSquat, legExt], 1).length).toBe(1)
  })
  it('passes primaryMuscles and equipment through unchanged (no ranking impact)', () => {
    const bench = ex('bp', 'Bench Press', 'chest, triceps', 'push', 'weighted', 'barbell')
    const ohp = ex('ohp', 'Overhead Press', 'shoulders, triceps', 'push', 'weighted', 'dumbbell')
    const out = suggestAlternates(bench, [bench, ohp])
    expect(out).toEqual([{ id: 'ohp', name: 'Overhead Press', exerciseType: 'weighted', primaryMuscles: 'shoulders, triceps', equipment: 'dumbbell', sharedCount: 1 }])
  })
  it('pins the user example: Bench Press surfaces an overhead press (real catalog strings)', () => {
    // Real catalog: Bench Press = 'chest, triceps, delts'; Dumbbell Overhead Press =
    // 'shoulders, triceps, chest' → share {chest,triceps}=2 (note 'delts' ≠ 'shoulders' — distinct
    // tokens, so the overlap rides chest+triceps). A lats/biceps row shares nothing.
    const bench = ex('bp', 'Bench Press', 'chest, triceps, delts', 'push')
    const ohp = ex('ohp', 'Dumbbell Overhead Press', 'shoulders, triceps, chest', 'vertical push')
    const row = ex('row', 'Barbell Row', 'lats, biceps', 'pull')
    const out = suggestAlternates(bench, [bench, ohp, row])
    expect(out.map(a => a.id)).toEqual(['ohp']) // shares chest+triceps=2; row shares nothing
  })
})
