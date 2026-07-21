import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { resolveExerciseIds } from './resolveExerciseIds'

interface FakeExerciseRow { id: string; name: string; canonical_id?: string | null }

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
 *  minting a custom row. `queryCalls`, if passed, records the catalog `.select()`
 *  columns so tests can assert `canonical_id` is actually requested (the real bug
 *  this guards against: forgetting to widen the select means followCanonical()
 *  silently no-ops in prod, even though this fake happily returns canonical_id
 *  regardless of what columns were asked for). */
function makeSupabase(
  existingRows: FakeExerciseRow[],
  insert: Mock<(row: unknown) => void>,
  queryCalls?: { select?: string },
) {
  return {
    from: (table: string) => {
      if (table !== 'exercises') throw new Error(`unexpected table: ${table}`)
      return {
        select: (cols: string) => {
          if (queryCalls) queryCalls.select = cols
          return {
            or: () => Promise.resolve({ data: existingRows, error: null }),
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

  it('requests canonical_id in the catalog select (without it, followCanonical silently no-ops)', async () => {
    const insert = vi.fn()
    const queryCalls: { select?: string } = {}
    __setSupabase(makeSupabase([{ id: 'ex-squat', name: 'Squat', canonical_id: null }], insert, queryCalls))

    await resolveExerciseIds(['Squat'], 'user-1')

    expect(queryCalls.select).toContain('canonical_id')
  })

  it('follows an alias row to its canonical id instead of returning the alias id (weak match)', async () => {
    const insert = vi.fn()
    __setSupabase(makeSupabase([{ id: 'alias', name: 'Barbell Back Squat', canonical_id: 'sq' }], insert))

    const result = await resolveExerciseIds(['Barbell Back Squat'], 'user-1')

    expect(result.get('Barbell Back Squat')).toBe('sq')
    expect(insert).not.toHaveBeenCalled()
  })

  it('follows a weak-matched canonical row (canonical_id null) to itself', async () => {
    const insert = vi.fn()
    __setSupabase(makeSupabase([{ id: 'ex-squat', name: 'Squat', canonical_id: null }], insert))

    const result = await resolveExerciseIds(['squat'], 'user-1')

    expect(result.get('squat')).toBe('ex-squat')
    expect(insert).not.toHaveBeenCalled()
  })

  it('hardened second-pass: a wording variant with no weak match still resolves via hardNormalizeExerciseName, not a mint', async () => {
    const insert = vi.fn()
    __setSupabase(makeSupabase([{ id: 'ex-pullup', name: 'Pull-ups', canonical_id: null }], insert))

    const result = await resolveExerciseIds(['Pull Ups'], 'user-1')

    expect(result.get('Pull Ups')).toBe('ex-pullup')
    expect(insert).not.toHaveBeenCalled()
  })

  it('still mints a user-owned row for a genuinely unmatched name (unchanged behavior)', async () => {
    const insert = vi.fn()
    __setSupabase(makeSupabase([{ id: 'ex-squat', name: 'Squat', canonical_id: null }], insert))

    const result = await resolveExerciseIds(['Nordic Curl'], 'user-1')

    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'Nordic Curl',
      is_active: true,
      exercise_type: 'weighted',
    })
    expect(result.get('Nordic Curl')).toBe('new-1')
  })

  it('an ambiguous hard-key (two distinct canonicals colliding on hardNormalizeExerciseName) mints rather than mis-resolving', async () => {
    const insert = vi.fn()
    __setSupabase(makeSupabase([
      { id: 'face-pull', name: 'Face Pull', canonical_id: null },
      { id: 'face-pulls', name: 'Face Pulls', canonical_id: null },
    ], insert))

    // Hyphenated so the weak normalizer (trim/collapse-space/lowercase only)
    // does not match either catalog name verbatim — only the hard normalizer
    // (which strips punctuation and singularizes) would match both.
    const result = await resolveExerciseIds(['Face-Pulls'], 'user-1')

    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'Face-Pulls',
      is_active: true,
      exercise_type: 'weighted',
    })
    const resolvedId = result.get('Face-Pulls')
    expect(resolvedId).toBe('new-1')
    expect(resolvedId).not.toBe('face-pull')
    expect(resolvedId).not.toBe('face-pulls')
  })
})
