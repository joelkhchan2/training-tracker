import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { loadExport } from '../loadExport.ts'
import { toExerciseCatalog, buildNameToId } from './exercises.ts'

// The real staged export (git-ignored) lives at scripts/migration/.data/export.xlsx.
// Vitest's cwd is the repo root, matching how scripts/migration/inspect.ts resolves it.
const dataPath = path.resolve(process.cwd(), 'scripts/migration/.data/export.xlsx')

describe.skipIf(!existsSync(dataPath))('exercise catalog transform (real export)', () => {
  const raw = loadExport(dataPath)
  const catalog = toExerciseCatalog(raw)

  it('imports only Active=Y rows, ~708 of them', () => {
    expect(catalog.length).toBeGreaterThan(700)
    expect(catalog.length).toBeLessThan(720)
  })

  it('gives every row an is_active flag and a uuid id', () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const row of catalog) {
      expect(row.is_active).toBe(true)
      expect(row.id).toMatch(uuidPattern)
    }
  })

  it('includes a known exercise by name', () => {
    expect(catalog.some(row => row.name === 'Barbell Back Squat')).toBe(true)
  })

  it('resolves every distinct Training Log strength/calisthenics exercise name to an id', () => {
    const { map, extraRows, createdFromLog } = buildNameToId(catalog, raw)

    const logNames = new Set<string>()
    for (const row of raw.trainingLogMatrix) {
      const entryType = row[2]
      if (entryType === 'Strength' || entryType === 'Calisthenics') {
        const name = row[3]
        if (typeof name === 'string' && name.trim() !== '') logNames.add(name.trim())
      }
    }
    expect(logNames.size).toBeGreaterThan(0)

    for (const name of logNames) {
      const key = name.trim().replace(/\s+/g, ' ').toLowerCase()
      expect(map.has(key)).toBe(true)
    }

    // extraRows and createdFromLog stay in lockstep, and every created name
    // is now resolvable via the map.
    expect(extraRows.length).toBe(createdFromLog.length)
    for (const row of extraRows) {
      expect(map.get(row.name.trim().replace(/\s+/g, ' ').toLowerCase())).toBe(row.id)
    }

    console.log(`buildNameToId: createdFromLog (${createdFromLog.length}):`, createdFromLog)
  })
})
