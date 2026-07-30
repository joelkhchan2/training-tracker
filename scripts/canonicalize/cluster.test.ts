import { describe, it, expect } from 'vitest'
import { clusterExercises, type ClusterableExercise } from './cluster.ts'

function row(
  id: string,
  name: string,
  overrides: Partial<ClusterableExercise> = {},
): ClusterableExercise {
  return { id, name, userId: null, exerciseType: 'weighted', canonicalId: null, ...overrides }
}

describe('clusterExercises — primary hard-key grouping', () => {
  it('groups hyphen/plural/word-order variants into one family (Pull-ups = Pull Ups)', () => {
    const rows = [row('a1', 'Pull-ups'), row('a2', 'Pull Ups')]
    const result = clusterExercises(rows, new Set())
    const all = [...result.historyTouching, ...result.searchOnly]
    expect(all).toHaveLength(1)
    expect(all[0].aliasIds.sort()).toEqual(['a1', 'a2'].filter(id => id !== all[0].canonicalId).sort())
    expect([all[0].canonicalId, ...all[0].aliasIds].sort()).toEqual(['a1', 'a2'])
  })

  it('groups word-order variants (Bent Over Barbell Row = Barbell Bent Over Row)', () => {
    const rows = [row('b1', 'Bent Over Barbell Row'), row('b2', 'Barbell Bent Over Row')]
    const result = clusterExercises(rows, new Set())
    const all = [...result.historyTouching, ...result.searchOnly]
    expect(all).toHaveLength(1)
    expect([all[0].canonicalId, ...all[0].aliasIds].sort()).toEqual(['b1', 'b2'])
  })

  it('leaves a singleton (no duplicate) ungrouped — no family emitted', () => {
    const rows = [row('c1', 'Squat')]
    const result = clusterExercises(rows, new Set())
    expect(result.historyTouching).toHaveLength(0)
    expect(result.searchOnly).toHaveLength(0)
  })

  it('keeps different implements separate (Barbell Row != Dumbbell Row) — no family, no crash', () => {
    const rows = [row('d1', 'Barbell Row'), row('d2', 'Dumbbell Row')]
    const result = clusterExercises(rows, new Set())
    expect([...result.historyTouching, ...result.searchOnly]).toHaveLength(0)
  })

  it('keeps different angles separate (Front Squat != Back Squat) — no family, not even uncertain', () => {
    const rows = [row('e1', 'Front Squat'), row('e2', 'Back Squat')]
    const result = clusterExercises(rows, new Set())
    expect([...result.historyTouching, ...result.searchOnly]).toHaveLength(0)
    expect(result.uncertain).toHaveLength(0)
  })

  it('excludes already-resolved rows (canonicalId set) from clustering entirely', () => {
    const rows = [
      row('f1', 'Squat'),
      row('f2', 'Barbell Back Squat', { canonicalId: 'f1' }), // already an alias from Phase A
    ]
    const result = clusterExercises(rows, new Set())
    // f1 is a singleton among clusterable rows (f2 is excluded) — no new family proposed
    expect([...result.historyTouching, ...result.searchOnly]).toHaveLength(0)
  })
})

describe('clusterExercises — tiering by history-touched', () => {
  it('routes a group with a touched member to historyTouching', () => {
    const rows = [row('g1', 'Pull-ups'), row('g2', 'Pull Ups')]
    const result = clusterExercises(rows, new Set(['g1']))
    expect(result.historyTouching).toHaveLength(1)
    expect(result.searchOnly).toHaveLength(0)
  })

  it('routes a group with no touched member to searchOnly', () => {
    const rows = [row('h1', 'Pull-ups'), row('h2', 'Pull Ups')]
    const result = clusterExercises(rows, new Set())
    expect(result.searchOnly).toHaveLength(1)
    expect(result.historyTouching).toHaveLength(0)
  })

  it('counts reflect the tier arrays exactly', () => {
    const rows = [
      row('i1', 'Pull-ups'), row('i2', 'Pull Ups'), // touched -> historyTouching
      row('j1', 'Face Pull'), row('j2', 'Face Pulls'), // untouched -> searchOnly
    ]
    const result = clusterExercises(rows, new Set(['i1']))
    expect(result.counts).toEqual({
      historyTouching: result.historyTouching.length,
      searchOnly: result.searchOnly.length,
      uncertain: result.uncertain.length,
      junk: result.junk.length,
    })
    expect(result.counts.historyTouching).toBe(1)
    expect(result.counts.searchOnly).toBe(1)
  })
})

describe('clusterExercises — canonical choice is deterministic', () => {
  it('prefers the touched member as canonical over an untouched one', () => {
    const rows = [row('k1', 'Pull-ups'), row('k2', 'Pull Ups')]
    const result = clusterExercises(rows, new Set(['k2']))
    expect(result.historyTouching[0].canonicalId).toBe('k2')
    expect(result.historyTouching[0].aliasIds).toEqual(['k1'])
  })

  it('falls back to the shortest name when no member is touched', () => {
    const rows = [row('l1', 'Face Pulls'), row('l2', 'Face Pull')]
    const result = clusterExercises(rows, new Set())
    // "Face Pull" (9 chars) is shorter than "Face Pulls" (10 chars)
    expect(result.searchOnly[0].canonicalId).toBe('l2')
    expect(result.searchOnly[0].canonicalName).toBe('Face Pull')
  })

  it('is stable across repeated calls with the same input (deterministic)', () => {
    const rows = [row('m1', 'Face Pulls'), row('m2', 'Face Pull')]
    const first = clusterExercises(rows, new Set())
    const second = clusterExercises(rows, new Set())
    expect(first).toEqual(second)
  })
})
