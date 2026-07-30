import { describe, it, expect } from 'vitest'
import { phaseAFamilies } from './families.phase-a.ts'

describe('phaseAFamilies — Row family matches prod reality', () => {
  it('records canonical "Barbell Row" for alias "Barbell Bent Over Row" (verified against hosted 2026-07-30 — prod has no row named "Bent Over Barbell Row")', () => {
    const rowFamily = phaseAFamilies.find(f => f.aliasNames.includes('Barbell Bent Over Row'))
    expect(rowFamily).toBeDefined()
    expect(rowFamily!.canonicalName).toBe('Barbell Row')
  })

  it('has no family whose canonical name is the never-existed "Bent Over Barbell Row"', () => {
    expect(phaseAFamilies.some(f => f.canonicalName === 'Bent Over Barbell Row')).toBe(false)
  })
})
