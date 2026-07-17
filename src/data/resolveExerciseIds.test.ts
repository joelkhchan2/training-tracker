import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { resolveExerciseIds } from './resolveExerciseIds'

interface FakeExerciseRow { id: string; name: string }

const { getSupabase, __setSupabase } = vi.hoisted(() => {
  let current: unknown
  return {
    getSupabase: () => current,
    __setSupabase: (client: unknown) => { current = client },
  }
})

vi.mock('./supabase', () => ({ getSupabase }))

/** Mirrors the subset of the supabase-js query builder resolveExerciseIds touches:
 *  select(...).or(...) for the catalog read, insert(...).select(...).single() for
 *  minting a custom row. */
function makeSupabase(existingRows: FakeExerciseRow[], insert: Mock<(row: unknown) => void>) {
  return {
    from: (table: string) => {
      if (table !== 'exercises') throw new Error(`unexpected table: ${table}`)
      return {
        select: () => ({
          or: () => Promise.resolve({ data: existingRows, error: null }),
        }),
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

describe('resolveExerciseIds', () => {
  it('maps names to catalog ids, normalizing case/whitespace differences', async () => {
    const insert = vi.fn()
    __setSupabase(makeSupabase([{ id: 'ex-squat', name: 'Squat' }], insert))

    const result = await resolveExerciseIds(['  squat ', 'SQUAT'], 'user-1')

    expect(result.get('  squat ')).toBe('ex-squat')
    expect(result.get('SQUAT')).toBe('ex-squat')
    expect(insert).not.toHaveBeenCalled()
  })

  it('mints a user-owned custom exercise for any unmatched name', async () => {
    const insert = vi.fn()
    __setSupabase(makeSupabase([{ id: 'ex-squat', name: 'Squat' }], insert))

    const result = await resolveExerciseIds(['Squat', 'Nordic Curl'], 'user-1')

    expect(result.get('Squat')).toBe('ex-squat')
    expect(result.get('Nordic Curl')).toBe('new-1')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'Nordic Curl',
      is_active: true,
      exercise_type: 'weighted',
    })
  })

  it('returns an empty map for an empty name list without querying', async () => {
    const insert = vi.fn()
    const from = vi.fn(() => { throw new Error('should not query') })
    __setSupabase({ from })

    const result = await resolveExerciseIds([], 'user-1')

    expect(result.size).toBe(0)
    expect(from).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })
})
