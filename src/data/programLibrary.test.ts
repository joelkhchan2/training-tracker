import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fetchPublicPrograms, usePublicPrograms } from './programLibrary'
import type { ExerciseRow, ProgramDayRow, ProgramExerciseRow, ProgramRow } from './types'

// A minimal chainable fake mirroring the subset of the supabase-js query builder this
// module touches (select/eq/or/in/order + the thenable terminal), plus optional call
// recording so tests can assert on the exact filter args passed to `.or()`/`.in()`.
interface QueryCall { table: string; method: string; args: unknown[] }

function fakeTable(rows: unknown[], record: (method: string, args: unknown[]) => void) {
  const builder = {
    select: (...args: unknown[]) => { record('select', args); return builder },
    eq: (...args: unknown[]) => { record('eq', args); return builder },
    or: (...args: unknown[]) => { record('or', args); return builder },
    in: (...args: unknown[]) => { record('in', args); return builder },
    order: (...args: unknown[]) => { record('order', args); return builder },
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  }
  return builder
}

function makeSupabase(tables: Record<string, unknown[]>, calls: QueryCall[] = []) {
  return {
    from: (table: string) => fakeTable(tables[table] ?? [], (method, args) => calls.push({ table, method, args })),
  }
}

const { getSupabase, __setSupabase } = vi.hoisted(() => {
  let current: unknown
  return {
    getSupabase: () => current,
    __setSupabase: (client: unknown) => { current = client },
  }
})

vi.mock('./supabase', () => ({ getSupabase }))

const OWN_PROGRAM: ProgramRow = {
  id: 'prog-own', user_id: 'me', name: 'My Program', description: 'A program I wrote',
  discipline: 'strength', progression_rule: null, is_public: false, created_at: '2026-01-01T00:00:00Z',
}
const COMMUNITY_PROGRAM: ProgramRow = {
  id: 'prog-community', user_id: 'other', name: 'Community Program', description: null,
  discipline: 'strength', progression_rule: null, is_public: true, created_at: '2026-01-01T00:00:00Z',
}
const OWN_DAYS: ProgramDayRow[] = [
  { id: 'day-own-1', program_id: 'prog-own', name: 'Day 1', order_index: 0 },
  { id: 'day-own-2', program_id: 'prog-own', name: 'Day 2', order_index: 1 },
]
const COMMUNITY_DAYS: ProgramDayRow[] = [
  { id: 'day-comm-1', program_id: 'prog-community', name: 'Day 1', order_index: 0 },
]
// An owned `programs` row produced by preset activation (`buildActivationRows` in
// activateProgram.ts), NOT the builder — its `program_exercises` rows never get
// `exercise_name` set, unlike a builder-authored/cloned program's. `is_public: true`
// here deliberately mirrors a pre-builder migrated program: even though it's public,
// it's still owned by the viewer, so it must never appear under "Shared by the
// community" — the classification is "public AND owned by someone else", not just
// "public".
const PRESET_SNAPSHOT_PROGRAM: ProgramRow = {
  id: 'prog-preset', user_id: 'me', name: '5/3/1 for Beginners', description: null,
  discipline: 'strength', progression_rule: null, is_public: true, created_at: '2026-01-01T00:00:00Z',
}
const PRESET_DAYS: ProgramDayRow[] = [
  { id: 'day-preset-1', program_id: 'prog-preset', name: 'Day 1', order_index: 0 },
]
const SQUAT_EXERCISE: ExerciseRow = {
  id: 'ex-squat', user_id: null, name: 'Squat', primary_muscles: null, equipment: null,
  movement_pattern: null, exercise_type: 'weighted', popularity: null, is_active: true, created_at: '2026-01-01T00:00:00Z',
  canonical_id: null,
}
// The actual shape a pre-builder migrated program lands in the DB with: `assemble()`
// in scripts/migration/load.ts never overrides `programSeed.program.user_id` (it
// stays the `user_id: null` hardcoded by `toProgramSeed()` in
// scripts/migration/transform/programs.ts), so this row is functionally the
// viewer's own active program but has NO real owner on the `programs` row itself.
// It must not render as "Shared by the community" (nobody actually shared it) or
// "My programs" (it's not builder-authored and has no confirmed owner).
const MIGRATED_NULL_OWNER_PROGRAM: ProgramRow = {
  id: 'prog-migrated', user_id: null, name: '5/3/1 for Beginners (migrated)', description: null,
  discipline: 'strength', progression_rule: null, is_public: true, created_at: '2026-01-01T00:00:00Z',
}
const MIGRATED_DAYS: ProgramDayRow[] = [
  { id: 'day-migrated-1', program_id: 'prog-migrated', name: 'Day 1', order_index: 0 },
]

function baseTables(): Record<string, unknown[]> {
  return {
    programs: [OWN_PROGRAM, COMMUNITY_PROGRAM],
    program_days: [...OWN_DAYS, ...COMMUNITY_DAYS],
    program_exercises: [
      // Builder-authored/cloned rows always set `exercise_name` (see the discriminator
      // comment in `fetchPublicPrograms`) — set it here so this fixture still qualifies
      // as authored and lands in `own`.
      { id: 'pe-own-1', program_day_id: 'day-own-1', exercise_id: 'ex-squat', role_key: 'squat',
        order_index: 0, scheme: { type: 'fixed', sets: [{ reps: 5 }] }, exercise_name: 'Squat', exercise_type: 'weighted' },
      // This program_exercise's exercise_id points at a row the viewer can't read (belongs
      // to the community program's author, RLS filters it out of the `exercises` fetch), so
      // the assembled program must fall back to the denormalized exercise_name.
      { id: 'pe-comm-1', program_day_id: 'day-comm-1', exercise_id: 'ex-unreadable', role_key: null,
        order_index: 0, scheme: { type: 'fixed', sets: [{ reps: 8 }] }, exercise_name: 'Bulgarian Split Squat', exercise_type: 'weighted' },
    ] as ProgramExerciseRow[],
    // Only the squat exercise is readable; ex-unreadable is deliberately absent.
    exercises: [SQUAT_EXERCISE],
  }
}

/** `baseTables()` plus an owned preset-activation snapshot: a `programs` row with
 *  `user_id: 'me'` whose `program_exercises` rows all have `exercise_name: null`,
 *  mirroring what `buildActivationRows` inserts when a preset is activated. */
function tablesWithPresetSnapshot(): Record<string, unknown[]> {
  const tables = baseTables()
  return {
    ...tables,
    programs: [...(tables.programs as ProgramRow[]), PRESET_SNAPSHOT_PROGRAM],
    program_days: [...(tables.program_days as ProgramDayRow[]), ...PRESET_DAYS],
    program_exercises: [
      ...(tables.program_exercises as ProgramExerciseRow[]),
      { id: 'pe-preset-1', program_day_id: 'day-preset-1', exercise_id: 'ex-squat', role_key: 'squat',
        order_index: 0, scheme: { type: 'fixed', sets: [{ reps: 5 }] }, exercise_name: null, exercise_type: null },
    ] as ProgramExerciseRow[],
  }
}

/** `baseTables()` plus a null-owner migrated program — the real shape produced by
 *  scripts/migration/load.ts today (see `MIGRATED_NULL_OWNER_PROGRAM` above). */
function tablesWithMigratedNullOwnerProgram(): Record<string, unknown[]> {
  const tables = baseTables()
  return {
    ...tables,
    programs: [...(tables.programs as ProgramRow[]), MIGRATED_NULL_OWNER_PROGRAM],
    program_days: [...(tables.program_days as ProgramDayRow[]), ...MIGRATED_DAYS],
    program_exercises: [
      ...(tables.program_exercises as ProgramExerciseRow[]),
      { id: 'pe-migrated-1', program_day_id: 'day-migrated-1', exercise_id: 'ex-squat', role_key: 'squat',
        order_index: 0, scheme: { type: 'fixed', sets: [{ reps: 5 }] }, exercise_name: null, exercise_type: null },
    ] as ProgramExerciseRow[],
  }
}

describe('fetchPublicPrograms', () => {
  it('fetches programs where is_public = true or user_id = me', async () => {
    const calls: QueryCall[] = []
    __setSupabase(makeSupabase(baseTables(), calls))

    await fetchPublicPrograms('me')

    const orCall = calls.find(c => c.table === 'programs' && c.method === 'or')
    expect(orCall).toBeDefined()
    expect(orCall!.args[0]).toBe('is_public.eq.true,user_id.eq.me')
  })

  it('splits programs into own (authored by me) and community (public, not mine)', async () => {
    __setSupabase(makeSupabase(baseTables()))

    const bundle = await fetchPublicPrograms('me')

    expect(bundle.own.map(p => p.id)).toEqual(['prog-own'])
    expect(bundle.community.map(p => p.id)).toEqual(['prog-community'])
    expect(bundle.own[0].isOwn).toBe(true)
    expect(bundle.community[0].isOwn).toBe(false)
  })

  it('sets daysPerWeek to the number of days for each program', async () => {
    __setSupabase(makeSupabase(baseTables()))

    const bundle = await fetchPublicPrograms('me')

    expect(bundle.own[0].daysPerWeek).toBe(2)
    expect(bundle.community[0].daysPerWeek).toBe(1)
  })

  it('assembles name/description/discipline from the program row, defaulting a null description to empty string', async () => {
    __setSupabase(makeSupabase(baseTables()))

    const bundle = await fetchPublicPrograms('me')

    expect(bundle.own[0].name).toBe('My Program')
    expect(bundle.own[0].description).toBe('A program I wrote')
    expect(bundle.own[0].discipline).toBe('strength')
    expect(bundle.community[0].description).toBe('')
  })

  it("resolves a community program's exercise name from exercise_name when the exercise row is unreadable, not 'Unknown exercise'", async () => {
    __setSupabase(makeSupabase(baseTables()))

    const bundle = await fetchPublicPrograms('me')

    const communityExerciseName = bundle.community[0].program.days[0].exercises[0].exerciseName
    expect(communityExerciseName).toBe('Bulgarian Split Squat')
    expect(communityExerciseName).not.toBe('Unknown exercise')
  })

  it('resolves a readable exercise from the exercises table as usual', async () => {
    __setSupabase(makeSupabase(baseTables()))

    const bundle = await fetchPublicPrograms('me')

    expect(bundle.own[0].program.days[0].exercises[0].exerciseName).toBe('Squat')
  })

  it('returns empty own/community arrays when there are no programs', async () => {
    __setSupabase(makeSupabase({ programs: [] }))

    const bundle = await fetchPublicPrograms('me')

    expect(bundle).toEqual({ own: [], community: [] })
  })

  it('includes a builder-authored own program (exercise_name set on every exercise row) in own', async () => {
    __setSupabase(makeSupabase(tablesWithPresetSnapshot()))

    const bundle = await fetchPublicPrograms('me')

    expect(bundle.own.map(p => p.id)).toContain('prog-own')
  })

  it('excludes an owned preset-activation snapshot (exercise_name null on every exercise row) from own', async () => {
    __setSupabase(makeSupabase(tablesWithPresetSnapshot()))

    const bundle = await fetchPublicPrograms('me')

    expect(bundle.own.map(p => p.id)).not.toContain('prog-preset')
  })

  it('excludes an owned preset-activation snapshot from community too, even though it is public (own programs never render as community)', async () => {
    __setSupabase(makeSupabase(tablesWithPresetSnapshot()))

    const bundle = await fetchPublicPrograms('me')

    expect(bundle.community.map(p => p.id)).not.toContain('prog-preset')
    expect(bundle.own.map(p => p.id)).not.toContain('prog-preset')
  })

  it('classifies a builder-authored own program, a migrated/preset-snapshot own program, and another user\'s public program correctly in one fetch', async () => {
    __setSupabase(makeSupabase(tablesWithPresetSnapshot()))

    const bundle = await fetchPublicPrograms('me')

    // (a) my builder-authored program -> own only.
    expect(bundle.own.map(p => p.id)).toContain('prog-own')
    expect(bundle.community.map(p => p.id)).not.toContain('prog-own')

    // (b) my migrated/preset-snapshot program (owned by me, exercise_name null,
    // is_public: true) -> neither own nor community.
    expect(bundle.own.map(p => p.id)).not.toContain('prog-preset')
    expect(bundle.community.map(p => p.id)).not.toContain('prog-preset')

    // (c) another user's public program -> community only.
    expect(bundle.community.map(p => p.id)).toContain('prog-community')
    expect(bundle.own.map(p => p.id)).not.toContain('prog-community')
  })

  it('excludes a null-owner migrated program from community even though is_public is true (own is not the same as "not mine")', async () => {
    __setSupabase(makeSupabase(tablesWithMigratedNullOwnerProgram()))

    const bundle = await fetchPublicPrograms('me')

    expect(bundle.community.map(p => p.id)).not.toContain('prog-migrated')
    expect(bundle.own.map(p => p.id)).not.toContain('prog-migrated')
  })
})

describe('usePublicPrograms', () => {
  function createWrapper() {
    const queryClient = new QueryClient()
    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children)
    }
    return { Wrapper, queryClient }
  }

  it('stays disabled (no fetch) when userId is undefined', () => {
    __setSupabase(makeSupabase(baseTables()))
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => usePublicPrograms(undefined), { wrapper: Wrapper })

    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('fetches under the exact query key [publicPrograms, userId]', async () => {
    __setSupabase(makeSupabase(baseTables()))
    const { Wrapper, queryClient } = createWrapper()

    const { result } = renderHook(() => usePublicPrograms('me'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(queryClient.getQueryCache().find({ queryKey: ['publicPrograms', 'me'] })).toBeDefined()
    expect(result.current.data?.own.map(p => p.id)).toEqual(['prog-own'])
  })
})
