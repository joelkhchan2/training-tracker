import { describe, expect, it, vi, beforeEach } from 'vitest'
import { resolveExerciseListItems } from './exerciseListItems'

interface QueuedResult { data: unknown; error: unknown }

/** Dispatches `from(table)` to a per-table queue of { data, error } results (shift on each
 *  call) — resolveExerciseListItems makes two sequential calls to the SAME table
 *  ('exercises'), first for { id, canonical_id }, then for display rows, so a plain
 *  single-response stub per table isn't enough; each table's queue is consumed in order. */
function makeSupabase(responsesByTable: Record<string, QueuedResult[]>, calls: { table: string; args: unknown[] }[] = []) {
  return {
    from: (table: string) => {
      const queue = responsesByTable[table]
      if (!queue || queue.length === 0) throw new Error(`no queued response for table: ${table}`)
      const result = queue.shift() as QueuedResult
      const chain: Record<string, unknown> = {}
      const methods = ['select', 'eq', 'is', 'or', 'order', 'limit', 'in', 'not']
      for (const m of methods) {
        chain[m] = (...args: unknown[]) => { calls.push({ table, args: [m, ...args] }); return chain }
      }
      ;(chain as { then: unknown }).then = (resolve: (v: QueuedResult) => unknown) => Promise.resolve(result).then(resolve)
      return chain
    },
  }
}

const { getSupabase, __setSupabase } = vi.hoisted(() => {
  let current: unknown
  return { getSupabase: () => current, __setSupabase: (c: unknown) => { current = c } }
})
vi.mock('./supabase', () => ({ getSupabase }))

beforeEach(() => __setSupabase(undefined))

describe('resolveExerciseListItems', () => {
  it('returns [] for empty input without calling supabase', async () => {
    const calls: { table: string; args: unknown[] }[] = []
    __setSupabase(makeSupabase({}, calls))

    const result = await resolveExerciseListItems([], 'user-1')

    expect(result).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('resolves each raw id through followCanonical, dedupes preserving input order', async () => {
    // 'ex-alias' is an alias pointing at 'ex-canonical' — both raw ids should collapse to
    // one resolved id, keeping the FIRST occurrence's position ('ex-alias' came first).
    __setSupabase(makeSupabase({
      exercises: [
        { data: [
          { id: 'ex-alias', canonical_id: 'ex-canonical' },
          { id: 'ex-other', canonical_id: null },
        ], error: null },
        { data: [
          { id: 'ex-canonical', name: 'Barbell Squat', exercise_type: 'weighted', primary_muscles: 'quadriceps', equipment: 'barbell', is_active: true },
          { id: 'ex-other', name: 'Pull-up', exercise_type: 'bodyweight', primary_muscles: null, equipment: null, is_active: true },
        ], error: null },
      ],
    }))

    const result = await resolveExerciseListItems(['ex-alias', 'ex-other'], 'user-1')

    expect(result).toEqual([
      { id: 'ex-canonical', name: 'Barbell Squat', exerciseType: 'weighted', primaryMuscles: 'quadriceps', equipment: 'barbell' },
      { id: 'ex-other', name: 'Pull-up', exerciseType: 'bodyweight', primaryMuscles: null, equipment: null },
    ])
  })

  it('drops rows that have since gone is_active = false, without backfilling', async () => {
    __setSupabase(makeSupabase({
      exercises: [
        { data: [{ id: 'ex-a', canonical_id: null }, { id: 'ex-b', canonical_id: null }], error: null },
        { data: [
          { id: 'ex-a', name: 'Active One', exercise_type: 'weighted', primary_muscles: null, equipment: null, is_active: true },
          { id: 'ex-b', name: 'Deactivated One', exercise_type: 'weighted', primary_muscles: null, equipment: null, is_active: false },
        ], error: null },
      ],
    }))

    const result = await resolveExerciseListItems(['ex-a', 'ex-b'], 'user-1')

    expect(result.map(r => r.id)).toEqual(['ex-a'])
  })

  it('caps the deduped id list at the given limit BEFORE fetching display rows', async () => {
    const calls: { table: string; args: unknown[] }[] = []
    __setSupabase(makeSupabase({
      exercises: [
        { data: [{ id: 'ex-a', canonical_id: null }, { id: 'ex-b', canonical_id: null }, { id: 'ex-c', canonical_id: null }], error: null },
        { data: [{ id: 'ex-a', name: 'A', exercise_type: null, primary_muscles: null, equipment: null, is_active: true }], error: null },
      ],
    }, calls))

    await resolveExerciseListItems(['ex-a', 'ex-b', 'ex-c'], 'user-1', 1)

    const displayInCall = calls.filter(c => c.table === 'exercises' && c.args[0] === 'in').at(-1)
    expect(displayInCall?.args).toEqual(['in', 'id', ['ex-a']])
  })
})
