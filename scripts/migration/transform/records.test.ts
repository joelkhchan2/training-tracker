import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { loadExport } from '../loadExport.ts'
import { toExerciseCatalog, buildNameToId } from './exercises.ts'
import { toPersonalRecords, toTemplates } from './records.ts'

// The real staged export (git-ignored) lives at scripts/migration/.data/export.xlsx.
const dataPath = path.resolve(process.cwd(), 'scripts/migration/.data/export.xlsx')

describe.skipIf(!existsSync(dataPath))('records transform (real export)', () => {
  const raw = loadExport(dataPath)
  const catalog = toExerciseCatalog(raw)
  const { map: nameToId } = buildNameToId(catalog, raw)

  it('produces the ~56 personal_records with mapped pr_type enum values', () => {
    const records = toPersonalRecords(raw, nameToId)
    expect(records.length).toBe(56)

    const prTypes = new Set(records.map(r => r.pr_type))
    for (const t of prTypes) {
      expect(['e1rm', 'volume', 'max_v_grade']).toContain(t)
    }
    expect(records.filter(r => r.pr_type === 'e1rm')).toHaveLength(27)
    expect(records.filter(r => r.pr_type === 'volume')).toHaveLength(28)
    expect(records.filter(r => r.pr_type === 'max_v_grade')).toHaveLength(1)
  })

  it('resolves exercise_id for every personal record via the name map', () => {
    const records = toPersonalRecords(raw, nameToId)
    for (const record of records) {
      expect(record.exercise_id).not.toBeNull()
    }
  })

  it('coerces value/reps/weight/previous_value to numbers and parses date_achieved', () => {
    const records = toPersonalRecords(raw, nameToId)
    const squatE1rm = records.find(
      r => r.pr_type === 'e1rm' && r.exercise_id === nameToId.get('squat'),
    )
    expect(squatE1rm).toBeDefined()
    expect(squatE1rm?.value).toBe(365)
    expect(squatE1rm?.reps).toBe(1)
    expect(squatE1rm?.weight).toBe(365)
    expect(squatE1rm?.previous_value).toBe(282)
    expect(squatE1rm?.date_achieved).toBe('2024-11-26')
  })

  it('produces the ~5 templates with parsed exercises arrays', () => {
    const templates = toTemplates(raw)
    expect(templates.length).toBe(5)

    for (const template of templates) {
      expect(template.user_id).toBeNull()
      expect(template.is_preset).toBe(true)
      expect(Array.isArray(template.exercises)).toBe(true)
      expect(template.exercises.length).toBeGreaterThan(0)
      for (const entry of template.exercises) {
        expect(typeof entry.name).toBe('string')
        expect(typeof entry.sets).toBe('number')
      }
    }

    const push = templates.find(t => t.name === 'Push')
    expect(push?.exercises).toEqual([
      { name: 'Bench Press', sets: 4 },
      { name: 'Overhead Press', sets: 3 },
      { name: 'Triceps Pushdown', sets: 3 },
      { name: 'Lateral Raise', sets: 3 },
    ])
  })
})
