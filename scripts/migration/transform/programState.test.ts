import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { loadExport } from '../loadExport.ts'
import { toTrainingMaxes, toProgramState } from './programState.ts'

// The real staged export (git-ignored) lives at scripts/migration/.data/export.xlsx.
const dataPath = path.resolve(process.cwd(), 'scripts/migration/.data/export.xlsx')

describe.skipIf(!existsSync(dataPath))('program state transform (real export)', () => {
  const raw = loadExport(dataPath)

  it('produces the 4 training maxes with real current + prev values', () => {
    const maxes = toTrainingMaxes(raw)
    expect(maxes).toHaveLength(4)

    const byKey = new Map(maxes.map(m => [m.key, m]))
    expect(byKey.get('squat')).toEqual({ key: 'squat', value: 270, prev_value: 260 })
    expect(byKey.get('benchPress')).toEqual({ key: 'benchPress', value: 175, prev_value: 170 })
    expect(byKey.get('barbellDeadlift')).toEqual({ key: 'barbellDeadlift', value: 395, prev_value: 385 })
    expect(byKey.get('overheadPress')).toEqual({ key: 'overheadPress', value: 115, prev_value: 110 })
  })

  it('derives cursor {dayIndex:1, week:2, cycle:6} from program_slot=3 + cycle_number=6', () => {
    const state = toProgramState(raw)
    expect(state.cursor).toEqual({ dayIndex: 1, week: 2, cycle: 6 })
  })

  it('carries program_last_advance through verbatim as last_advance_key', () => {
    const state = toProgramState(raw)
    expect(state.last_advance_key).toBe('2026-07-14|A')
  })

  it('leaves active_program_id null and points active_program_ref at the 5/3/1 program name for the load step to resolve', () => {
    const state = toProgramState(raw)
    expect(state.active_program_id).toBeNull()
    expect(state.active_program_ref).toBe('5/3/1')
  })
})
