import { describe, it, expect } from 'vitest'
import {
  buildMergeSql,
  validateNoChains,
  validateResolvedIds,
  type MergeFamily,
} from './apply.ts'

/**
 * Pure fixtures — no DB. `buildMergeSql` only ever emits text; these tests
 * assert the *shape* of that text (which tables/columns/scoping it touches
 * and in what order), not that it's valid against a live schema.
 */

const userId = '11111111-1111-1111-1111-111111111111'

const squat: MergeFamily = {
  canonicalId: 'c0000000-0000-0000-0000-00000000c001',
  canonicalName: 'Squat',
  aliasIds: [
    'a0000000-0000-0000-0000-00000000a001',
    'a0000000-0000-0000-0000-00000000a002',
  ],
  aliasNames: ['Barbell Back Squat', 'Back Squat'],
}

const ohp: MergeFamily = {
  canonicalId: 'c0000000-0000-0000-0000-00000000c002',
  canonicalName: 'Overhead Press',
  aliasIds: ['a0000000-0000-0000-0000-00000000a003'],
  aliasNames: ['Barbell Overhead Press'],
}

const families: MergeFamily[] = [squat, ohp]

describe('buildMergeSql — catalog', () => {
  it('sets canonical_id on every aliasId, per family, without touching is_active', () => {
    const { catalog } = buildMergeSql(families, userId)

    expect(catalog).toContain(`canonical_id = '${squat.canonicalId}'`)
    expect(catalog).toContain(`'${squat.aliasIds[0]}'`)
    expect(catalog).toContain(`'${squat.aliasIds[1]}'`)
    expect(catalog).toContain(`canonical_id = '${ohp.canonicalId}'`)
    expect(catalog).toContain(`'${ohp.aliasIds[0]}'`)
    expect(catalog.toLowerCase()).not.toContain('is_active')
  })

  it('scopes the update to exercises rows by id, not by user_id (catalog rows are global/shared)', () => {
    const { catalog } = buildMergeSql([squat], userId)
    expect(catalog).toMatch(/update exercises set canonical_id = '.*' where id in \(/i)
  })
})

describe('buildMergeSql — history: strength_sets', () => {
  it('remaps exercise_id and scopes by user_id', () => {
    const { history } = buildMergeSql([squat], userId)

    expect(history).toMatch(/update strength_sets/i)
    expect(history).toContain(`set exercise_id = '${squat.canonicalId}'`)
    expect(history).toContain(`user_id = '${userId}'`)
    // any() over the alias ids, not the canonical id (canonical rows should
    // never need remapping onto themselves)
    expect(history).toContain(`'${squat.aliasIds[0]}'`)
    expect(history).toContain(`'${squat.aliasIds[1]}'`)
  })
})

describe('buildMergeSql — history: program_exercises (join-scoped)', () => {
  it('uses the program_days/programs join to scope by user_id, not a bare user_id column', () => {
    const { history } = buildMergeSql([squat], userId)

    expect(history).toContain('from program_days d')
    expect(history).toContain('join programs p on p.id = d.program_id')
    expect(history).toContain(`p.user_id = '${userId}'`)
    expect(history).toContain('pe.program_day_id = d.id')
    // program_exercises has no user_id column — must never appear as pe.user_id
    expect(history).not.toContain('pe.user_id')
  })

  it('does NOT emit the over-broad bare where-exercise_id-in form', () => {
    const { history } = buildMergeSql([squat], userId)
    const programExercisesBlock = history.slice(history.indexOf('update program_exercises'))
    const nextUpdate = programExercisesBlock.indexOf('update', 'update program_exercises'.length)
    const block = nextUpdate === -1 ? programExercisesBlock : programExercisesBlock.slice(0, nextUpdate)
    expect(block).not.toMatch(/where\s+exercise_id\s+in\s*\(/i)
  })
})

describe('buildMergeSql — history: personal_records collision handling', () => {
  it('deletes the inferior duplicate per pr_type (keep higher value, tiebreak later date_achieved) BEFORE remapping survivors', () => {
    const { history } = buildMergeSql([squat], userId)

    const deleteIdx = history.indexOf('delete from personal_records')
    const remapIdx = history.indexOf(`update personal_records\nset exercise_id = '${squat.canonicalId}'`)

    expect(deleteIdx).toBeGreaterThan(-1)
    expect(remapIdx).toBeGreaterThan(-1)
    expect(deleteIdx).toBeLessThan(remapIdx)

    // ordering used to pick the survivor: highest value first, then latest
    // date_achieved as the tiebreak
    const dedupeBlock = history.slice(deleteIdx - 400, deleteIdx)
    expect(dedupeBlock).toMatch(/partition by\s+pr\.pr_type/i)
    expect(dedupeBlock).toMatch(/order by\s+pr\.value desc,\s*pr\.date_achieved desc/i)
  })

  it('scopes the personal_records dedupe/remap to this family\'s ids and this user', () => {
    const { history } = buildMergeSql([squat], userId)
    const prSection = history.slice(
      history.indexOf('-- personal_records'),
      history.indexOf('-- exercise_progress'),
    )
    expect(prSection).toContain(`pr.user_id = '${userId}'`)
    expect(prSection).toContain(userId)
  })
})

describe('buildMergeSql — history: exercise_progress collision handling', () => {
  it('keeps the WHOLE most-recent updated_at row per program_id and deletes the other, BEFORE remapping survivors', () => {
    const { history } = buildMergeSql([squat], userId)

    const deleteIdx = history.indexOf('delete from exercise_progress')
    const remapIdx = history.indexOf(`update exercise_progress\nset exercise_id = '${squat.canonicalId}'`)

    expect(deleteIdx).toBeGreaterThan(-1)
    expect(remapIdx).toBeGreaterThan(-1)
    expect(deleteIdx).toBeLessThan(remapIdx)

    const dedupeBlock = history.slice(deleteIdx - 400, deleteIdx)
    expect(dedupeBlock).toMatch(/partition by\s+ep\.program_id/i)
    expect(dedupeBlock).toMatch(/order by\s+ep\.updated_at desc/i)
  })

  it('never mixes current_weight/consecutive_fails across rows (no aggregation of those columns)', () => {
    const { history } = buildMergeSql([squat], userId)
    expect(history.toLowerCase()).not.toContain('max(current_weight')
    expect(history.toLowerCase()).not.toContain('max(consecutive_fails')
    expect(history.toLowerCase()).not.toContain('avg(current_weight')
  })
})

describe('buildMergeSql — preview', () => {
  it('includes a read-only total strength_sets count for the user (the before/after invariant)', () => {
    const { preview } = buildMergeSql(families, userId)
    expect(preview.toLowerCase()).toMatch(/select count\(\*\).*from strength_sets\s+where user_id/is)
    expect(preview).not.toMatch(/^\s*(update|delete|insert)\s/im)
  })

  it('includes a per-family logged-set total covering both alias and canonical ids', () => {
    const { preview } = buildMergeSql([squat], userId)
    const squatSection = preview.slice(preview.indexOf('Squat'))
    expect(squatSection).toContain(squat.canonicalId)
    expect(squatSection).toContain(squat.aliasIds[0])
    expect(squatSection).toContain(squat.aliasIds[1])
    expect(squatSection.toLowerCase()).toContain('strength_sets')
  })

  it('includes per-table counts for personal_records and exercise_progress, per family', () => {
    const { preview } = buildMergeSql([squat], userId)
    expect(preview.toLowerCase()).toContain('personal_records')
    expect(preview.toLowerCase()).toContain('exercise_progress')
  })

  it('covers every family passed in', () => {
    const { preview } = buildMergeSql(families, userId)
    expect(preview).toContain('Squat')
    expect(preview).toContain('Overhead Press')
  })
})

describe('validateNoChains', () => {
  it('throws when a family canonicalId is itself in the alias set', () => {
    const aliasSet = new Set([squat.canonicalId])
    expect(() => validateNoChains([squat], aliasSet)).toThrow()
  })

  it('passes when no canonicalId appears in the alias set', () => {
    const aliasSet = new Set([...squat.aliasIds, ...ohp.aliasIds])
    expect(() => validateNoChains(families, aliasSet)).not.toThrow()
  })
})

describe('validateResolvedIds', () => {
  const goodLookup = [
    { name: 'Squat', id: squat.canonicalId, canonical_id: null },
    { name: 'Barbell Back Squat', id: squat.aliasIds[0], canonical_id: null },
    { name: 'Back Squat', id: squat.aliasIds[1], canonical_id: null },
  ]

  it('passes when every name resolves to exactly one row and the canonical row has canonical_id === null', () => {
    expect(() => validateResolvedIds([squat], goodLookup)).not.toThrow()
  })

  it('throws when a family name has zero matching rows (typo/absent)', () => {
    const lookup = goodLookup.filter(r => r.name !== 'Back Squat')
    expect(() => validateResolvedIds([squat], lookup)).toThrow()
  })

  it('throws when a family name has two matching rows', () => {
    const lookup = [...goodLookup, { name: 'Squat', id: 'dupe-id', canonical_id: null }]
    expect(() => validateResolvedIds([squat], lookup)).toThrow()
  })

  it("throws when the canonicalId's looked-up row has a non-null canonical_id (canonical is itself an alias)", () => {
    const lookup = goodLookup.map(r =>
      r.name === 'Squat' ? { ...r, canonical_id: 'some-other-canonical-id' } : r,
    )
    expect(() => validateResolvedIds([squat], lookup)).toThrow()
  })
})
