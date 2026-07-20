import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { resolveDraftExerciseIds } from './resolveDraftExercises'
import type { ProgramDraft } from '../domain/programDraft'

interface FakeExerciseRow { id: string; name: string }

const { getSupabase, __setSupabase } = vi.hoisted(() => {
  let current: unknown
  return {
    getSupabase: () => current,
    __setSupabase: (client: unknown) => { current = client },
  }
})

vi.mock('./supabase', () => ({ getSupabase }))

interface PageCall { eq: [string, unknown]; or: string; order: string; range: [number, number] }
interface QueryCalls { select?: string; calls?: PageCall[] }

/** Mirrors the subset of the supabase-js query builder resolveDraftExerciseIds
 *  touches: select(...).eq('is_active', true).or(...).order(...).range(...) for
 *  each page of the catalog read, insert(...).select(...).single() for minting a
 *  custom row. `pages` is one entry per expected `.range()` call, in order — a
 *  single-page test just passes a one-element array. Records the select/eq/or/
 *  order/range args for every page so tests can assert the exact catalog-read
 *  filters are preserved across pagination. */
function makeSupabase(pages: FakeExerciseRow[][], insert: Mock<(row: unknown) => void>, queryCalls: QueryCalls) {
  let pageIndex = 0
  return {
    from: (table: string) => {
      if (table !== 'exercises') throw new Error(`unexpected table: ${table}`)
      return {
        select: (cols: string) => {
          queryCalls.select = cols
          return {
            eq: (col: string, val: unknown) => ({
              or: (filter: string) => ({
                order: (orderCol: string) => ({
                  range: (from: number, to: number) => {
                    const data = pages[pageIndex] ?? []
                    queryCalls.calls = queryCalls.calls ?? []
                    queryCalls.calls.push({ eq: [col, val], or: filter, order: orderCol, range: [from, to] })
                    pageIndex += 1
                    return Promise.resolve({ data, error: null })
                  },
                }),
              }),
            }),
          }
        },
        insert: (row: unknown) => {
          insert(row)
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: `new-${insert.mock.calls.length}` }, error: null }),
            }),
          }
        },
      }
    },
  }
}

function draftWith(days: ProgramDraft['days']): ProgramDraft {
  return { name: 'Test Program', description: '', isPublic: false, days }
}

describe('resolveDraftExerciseIds', () => {
  it('queries the exercises catalog scoped to global rows + the user, and only active rows', async () => {
    const insert = vi.fn()
    const queryCalls: QueryCalls = {}
    __setSupabase(makeSupabase([[{ id: 'ex-squat', name: 'Squat' }]], insert, queryCalls))

    const draft = draftWith([
      { name: 'Day A', exercises: [{ exerciseName: 'Squat', kind: 'strength', sets: [{ reps: 5 }] }] },
    ])

    await resolveDraftExerciseIds(draft, 'user-1')

    expect(queryCalls.calls).toHaveLength(1)
    expect(queryCalls.calls![0].eq).toEqual(['is_active', true])
    expect(queryCalls.calls![0].or).toBe('user_id.is.null,user_id.eq.user-1')
  })

  it('matches an existing catalog exercise by normalized name (case/whitespace-insensitive)', async () => {
    const insert = vi.fn()
    __setSupabase(makeSupabase([[{ id: 'ex-squat', name: 'Squat' }]], insert, {}))

    const draft = draftWith([
      { name: 'Day A', exercises: [{ exerciseName: '  SQUAT ', kind: 'strength', sets: [{ reps: 5 }] }] },
    ])

    const result = await resolveDraftExerciseIds(draft, 'user-1')

    expect(result['  SQUAT ']).toBe('ex-squat')
    expect(insert).not.toHaveBeenCalled()
  })

  it('mints a user-owned strength exercise as exercise_type "weighted" for an unmatched strength draft exercise', async () => {
    const insert = vi.fn()
    __setSupabase(makeSupabase([[]], insert, {}))

    const draft = draftWith([
      { name: 'Day A', exercises: [{ exerciseName: 'Zercher Squat', kind: 'strength', sets: [{ reps: 5 }] }] },
    ])

    const result = await resolveDraftExerciseIds(draft, 'user-1')

    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'Zercher Squat',
      is_active: true,
      exercise_type: 'weighted',
    })
    expect(result['Zercher Squat']).toBe('new-1')
  })

  it('mints a user-owned bodyweight exercise as exercise_type "bodyweight" for an unmatched bodyweight draft exercise, not "weighted"', async () => {
    const insert = vi.fn()
    __setSupabase(makeSupabase([[]], insert, {}))

    const draft = draftWith([
      { name: 'Day A', exercises: [{ exerciseName: 'My Machine Row', kind: 'bodyweight', sets: [{ reps: 10 }] }] },
    ])

    const result = await resolveDraftExerciseIds(draft, 'user-1')

    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'My Machine Row',
      is_active: true,
      exercise_type: 'bodyweight',
    })
    expect(result['My Machine Row']).toBe('new-1')
  })

  it('resolves a matched and an unmatched name together, returning both keyed by their original exerciseName', async () => {
    const insert = vi.fn()
    __setSupabase(makeSupabase([[{ id: 'ex-squat', name: 'Squat' }]], insert, {}))

    const draft = draftWith([
      {
        name: 'Day A',
        exercises: [
          { exerciseName: 'Squat', kind: 'strength', sets: [{ reps: 5 }] },
          { exerciseName: 'My Machine Row', kind: 'bodyweight', sets: [{ reps: 10 }] },
        ],
      },
    ])

    const result = await resolveDraftExerciseIds(draft, 'user-1')

    expect(result).toEqual({ Squat: 'ex-squat', 'My Machine Row': 'new-1' })
  })

  it('dedupes by normalized name: the same lift repeated (with case/whitespace differences) across days resolves once', async () => {
    const insert = vi.fn()
    __setSupabase(makeSupabase([[]], insert, {}))

    const draft = draftWith([
      { name: 'Day A', exercises: [{ exerciseName: 'Nordic Curl', kind: 'bodyweight', sets: [{ reps: 8 }] }] },
      { name: 'Day B', exercises: [{ exerciseName: ' nordic curl ', kind: 'bodyweight', sets: [{ reps: 6 }] }] },
    ])

    const result = await resolveDraftExerciseIds(draft, 'user-1')

    expect(insert).toHaveBeenCalledTimes(1)
    expect(result['Nordic Curl']).toBe('new-1')
    expect(result[' nordic curl ']).toBe('new-1')
  })

  it('returns an empty map for a draft with no exercises, without querying', async () => {
    const from = vi.fn(() => { throw new Error('should not query') })
    __setSupabase({ from })

    const draft = draftWith([{ name: 'Day A', exercises: [] }])

    const result = await resolveDraftExerciseIds(draft, 'user-1')

    expect(result).toEqual({})
    expect(from).not.toHaveBeenCalled()
  })

  it('paginates the catalog read past the PostgREST 1000-row cap, resolving a draft exercise whose catalog row only appears on the second page instead of minting a duplicate', async () => {
    const PAGE = 1000
    const page1: FakeExerciseRow[] = Array.from({ length: PAGE }, (_, i) => ({ id: `filler-${i}`, name: `Filler Exercise ${i}` }))
    const page2: FakeExerciseRow[] = [{ id: 'ex-late-squat', name: 'Late Page Squat' }]

    const insert = vi.fn()
    const queryCalls: QueryCalls = {}
    __setSupabase(makeSupabase([page1, page2], insert, queryCalls))

    const draft = draftWith([
      { name: 'Day A', exercises: [{ exerciseName: 'Late Page Squat', kind: 'strength', sets: [{ reps: 5 }] }] },
    ])

    const result = await resolveDraftExerciseIds(draft, 'user-1')

    // Resolves to the existing catalog row from page 2 — must NOT mint a duplicate.
    expect(result['Late Page Squat']).toBe('ex-late-squat')
    expect(insert).not.toHaveBeenCalled()

    // Fetched exactly two pages, and every page still carries the is_active +
    // null-or-own filters.
    expect(queryCalls.calls).toHaveLength(2)
    for (const call of queryCalls.calls!) {
      expect(call.eq).toEqual(['is_active', true])
      expect(call.or).toBe('user_id.is.null,user_id.eq.user-1')
    }
  })
})
