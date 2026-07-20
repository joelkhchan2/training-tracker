import { describe, it, expect } from 'vitest'
import { assemble } from './load.ts'
import type { RawExport } from './exportSchema.ts'

/**
 * Regression test for the migration-data-hygiene bug where a migrated
 * program landed with `user_id: null` / `is_public: true` — i.e. behaving
 * like an ownerless, world-readable library preset instead of the seed
 * user's own private program (it showed under "Shared by the community"
 * and was absent from "My programs"). See `toProgramSeed()` in
 * `transform/programs.ts` for the ownerless-library-preset defaults this
 * `assemble()` must override.
 */

const emptyRaw: RawExport = {
  trainingLog: [],
  trainingLogMatrix: [],
  exercises: [],
  personalBests: [],
  settings: [],
  templates: [],
  goals: [],
  sheetNames: [],
}

describe('assemble', () => {
  it('writes the migrated program as personally owned and private, not an ownerless public library row', () => {
    const userId = '11111111-1111-1111-1111-111111111111'
    const assembly = assemble(emptyRaw, userId)

    expect(assembly.program.user_id).toBe(userId)
    expect(assembly.program.is_public).toBe(false)
  })

  it('never leaves the migrated program with a null user_id, regardless of which seed user resolved', () => {
    const userId = '22222222-2222-2222-2222-222222222222'
    const assembly = assemble(emptyRaw, userId)

    expect(assembly.program.user_id).not.toBeNull()
  })
})
