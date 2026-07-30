import { describe, it, expect } from 'vitest'
import { selectGlobalCandidates, buildProposal } from './clusterRun.ts'
import type { ClusterableExercise, ClusterResult } from './cluster.ts'

function row(id: string, name: string, overrides: Partial<ClusterableExercise> = {}): ClusterableExercise {
  return { id, name, userId: null, exerciseType: 'weighted', canonicalId: null, ...overrides }
}

function emptyResult(overrides: Partial<ClusterResult> = {}): ClusterResult {
  return {
    historyTouching: [],
    searchOnly: [],
    uncertain: [],
    junk: [],
    counts: { historyTouching: 0, searchOnly: 0, uncertain: 0, junk: 0 },
    ...overrides,
  }
}

describe('selectGlobalCandidates', () => {
  it('excludes user-owned (custom) rows, keeping only user_id === null rows', () => {
    const rows = [
      row('g1', 'Squat'),
      row('c1', 'My Custom Squat Variant', { userId: 'user-123' }),
      row('g2', 'Bench Press'),
    ]
    const candidates = selectGlobalCandidates(rows)
    expect(candidates.map(r => r.id).sort()).toEqual(['g1', 'g2'])
  })

  it('returns an empty array when every row is user-owned', () => {
    const rows = [row('c1', 'Custom A', { userId: 'u1' }), row('c2', 'Custom B', { userId: 'u2' })]
    expect(selectGlobalCandidates(rows)).toEqual([])
  })

  it('keeps every row when all are global', () => {
    const rows = [row('g1', 'Squat'), row('g2', 'Deadlift')]
    expect(selectGlobalCandidates(rows)).toHaveLength(2)
  })
})

describe('buildProposal', () => {
  it('carries totalActiveCount, globalCandidateCount, and historyTouchedCount through untouched', () => {
    const proposal = buildProposal({
      catalog: [row('g1', 'Squat'), row('g2', 'Bench Press')],
      totalActiveCount: 10,
      historyTouchedCount: 4,
      result: emptyResult(),
      generatedAt: '2026-07-30T00:00:00.000Z',
    })
    expect(proposal.totalActiveCount).toBe(10)
    expect(proposal.globalCandidateCount).toBe(2)
    expect(proposal.historyTouchedCount).toBe(4)
    expect(proposal.generatedAt).toBe('2026-07-30T00:00:00.000Z')
  })

  it('tags every family/junk/uncertain row with owner info looked up from the candidate catalog', () => {
    const catalog = [row('canon1', 'Pull Ups'), row('alias1', 'Pull-ups'), row('junk1', 'Barbell Squat Press')]
    const result = emptyResult({
      historyTouching: [
        { canonicalId: 'canon1', canonicalName: 'Pull Ups', aliasIds: ['alias1'], aliasNames: ['Pull-ups'] },
      ],
      junk: [{ id: 'junk1', name: 'Barbell Squat Press' }],
      uncertain: [
        {
          reason: 'equipment-prefix',
          members: [
            { id: 'canon1', name: 'Pull Ups' },
            { id: 'alias1', name: 'Pull-ups' },
          ],
          note: 'ambiguous',
        },
      ],
    })

    const proposal = buildProposal({ catalog, totalActiveCount: 3, historyTouchedCount: 1, result })

    expect(proposal.historyTouching[0].canonicalOwner).toBe('global')
    expect(proposal.historyTouching[0].aliasOwners).toEqual(['global'])
    expect(proposal.junk[0].owner).toBe('global')
    expect(proposal.uncertain[0].members.every(m => m.owner === 'global')).toBe(true)
  })

  it('tags an id not found in the candidate catalog as custom (safe default, never silently "global")', () => {
    // Defense-in-depth: a family/candidate referencing an id absent from the
    // catalog it was supposedly built from should never be mislabeled as a
    // safe global row — default to the more conservative 'custom' tag.
    const proposal = buildProposal({
      catalog: [],
      totalActiveCount: 1,
      historyTouchedCount: 0,
      result: emptyResult({ junk: [{ id: 'unknown', name: 'Mystery Row' }] }),
    })
    expect(proposal.junk[0].owner).toBe('custom')
  })

  it('includes a note documenting that user-owned custom rows are excluded from the sweep', () => {
    const proposal = buildProposal({
      catalog: [row('g1', 'Squat')],
      totalActiveCount: 1,
      historyTouchedCount: 0,
      result: emptyResult(),
    })
    expect(proposal.note).toMatch(/global/i)
    expect(proposal.note).toMatch(/custom/i)
  })
})
