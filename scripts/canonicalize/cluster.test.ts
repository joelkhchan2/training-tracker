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

describe('clusterExercises — junk-compound detection', () => {
  it('flags the three known junk-compound examples, untouched -> junk list', () => {
    const rows = [
      row('n1', 'Band Squat Hold Row'),
      row('n2', 'Machine Squat Press'),
      row('n3', 'Plate Squat Hold Curl'),
    ]
    const result = clusterExercises(rows, new Set())
    expect(result.junk.map(j => j.id).sort()).toEqual(['n1', 'n2', 'n3'])
  })

  it('routes a history-touched junk-looking row to uncertain, NOT to junk', () => {
    const rows = [row('o1', 'Band Squat Hold Row')]
    const result = clusterExercises(rows, new Set(['o1']))
    expect(result.junk).toHaveLength(0)
    expect(result.uncertain).toHaveLength(1)
    expect(result.uncertain[0].reason).toBe('history-touched-junk')
    expect(result.uncertain[0].members).toEqual([{ id: 'o1', name: 'Band Squat Hold Row' }])
  })

  it('does NOT flag real single-movement exercises with an equipment prefix', () => {
    const rows = [
      row('p1', 'Barbell Back Squat'),
      row('p2', 'Barbell Bench Press'),
      row('p3', 'Machine Seated Row'),
      row('p4', 'Cable Pull-Through'),
      row('p5', 'Dumbbell Romanian Deadlift'),
    ]
    const result = clusterExercises(rows, new Set())
    expect(result.junk).toHaveLength(0)
  })

  it('does NOT flag a real two-movement-word compound lift name (Barbell Push Press)', () => {
    const rows = [row('q1', 'Barbell Push Press')]
    const result = clusterExercises(rows, new Set())
    expect(result.junk).toHaveLength(0)
  })

  it('does NOT flag real isometric-hold exercise names ("hold" is not a movement token)', () => {
    const rows = [row('q2', 'Barbell Squat Hold'), row('q3', 'Dumbbell Curl Hold')]
    const result = clusterExercises(rows, new Set())
    expect(result.junk).toHaveLength(0)
  })

  it('does not require an equipment prefix to leave a name un-flagged (no leading junk token -> never junk)', () => {
    const rows = [row('r1', 'Squat Press Curl')] // no leading equipment/junk token
    const result = clusterExercises(rows, new Set())
    expect(result.junk).toHaveLength(0)
  })

  it('junk rows are excluded from primary clustering (never appear in a family)', () => {
    const rows = [row('s1', 'Band Squat Hold Row'), row('s2', 'Band Squat Hold Row')] // hypothetical literal dup
    const result = clusterExercises(rows, new Set())
    expect([...result.historyTouching, ...result.searchOnly]).toHaveLength(0)
    expect(result.junk.map(j => j.id).sort()).toEqual(['s1', 's2'])
  })
})

describe('clusterExercises — equipment-prefix secondary key -> uncertain', () => {
  it('flags a simple equipment-prefix pair as uncertain, NOT as a merge family', () => {
    const rows = [row('t1', 'Barbell Curl'), row('t2', 'Curl')]
    const result = clusterExercises(rows, new Set())
    expect([...result.historyTouching, ...result.searchOnly]).toHaveLength(0)
    expect(result.uncertain).toHaveLength(1)
    expect(result.uncertain[0].reason).toBe('equipment-prefix')
    expect(result.uncertain[0].members.map(m => m.id).sort()).toEqual(['t1', 't2'])
  })

  it('never auto-merges different implements of the same movement (Barbell Bench Press vs Dumbbell Bench Press vs Machine Chest Press)', () => {
    const rows = [
      row('u1', 'Barbell Bench Press'),
      row('u2', 'Dumbbell Bench Press'),
      row('u3', 'Machine Chest Press'),
    ]
    const result = clusterExercises(rows, new Set())
    expect([...result.historyTouching, ...result.searchOnly]).toHaveLength(0)
    // Barbell Bench Press <-> "Bench Press" would match on equipment-stripped
    // key; Dumbbell Bench Press does too -> both land in one uncertain group
    // together with each other via the shared stripped key "bench press".
    // Machine Chest Press strips to "chest press" (different bare movement
    // name) so it does not cross-link with the other two.
    const equipmentGroups = result.uncertain.filter(g => g.reason === 'equipment-prefix')
    expect(equipmentGroups.length).toBeGreaterThanOrEqual(1)
    const bench = equipmentGroups.find(g => g.members.some(m => m.id === 'u1'))
    expect(bench?.members.map(m => m.id).sort()).toEqual(['u1', 'u2'])
  })

  it('does NOT flag Barbell Back Squat vs Squat (documented v1 limitation — extra "back" token survives the strip; already hand-resolved in Phase A)', () => {
    const rows = [row('v1', 'Barbell Back Squat'), row('v2', 'Squat')]
    const result = clusterExercises(rows, new Set())
    expect(result.uncertain.filter(g => g.reason === 'equipment-prefix')).toHaveLength(0)
  })

  it('does not flag angle-only differences with no equipment word at all (Front Squat vs Back Squat) — nothing to strip', () => {
    const rows = [row('w1', 'Front Squat'), row('w2', 'Back Squat')]
    const result = clusterExercises(rows, new Set())
    expect(result.uncertain.filter(g => g.reason === 'equipment-prefix')).toHaveLength(0)
  })

  it('does not double-report a pair that already shares the same primary key', () => {
    const rows = [row('x1', 'Pull-ups'), row('x2', 'Pull Ups')]
    const result = clusterExercises(rows, new Set())
    // already grouped as a primary-key family (Task 3) - must not ALSO
    // appear as an equipment-prefix uncertain group
    expect(result.uncertain.filter(g => g.reason === 'equipment-prefix')).toHaveLength(0)
  })

  it('handles the "ez bar" two-word equipment prefix', () => {
    const rows = [row('y1', 'EZ Bar Curl'), row('y2', 'Curl')]
    const result = clusterExercises(rows, new Set())
    const equipmentGroups = result.uncertain.filter(g => g.reason === 'equipment-prefix')
    expect(equipmentGroups).toHaveLength(1)
    expect(equipmentGroups[0].members.map(m => m.id).sort()).toEqual(['y1', 'y2'])
  })
})
