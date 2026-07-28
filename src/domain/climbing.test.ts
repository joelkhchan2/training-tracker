import { describe, expect, it } from 'vitest'
import { parseVGrade, formatVGrade, normalizeClimbingEntries } from './climbing'

describe('parseVGrade', () => {
  it('parses V0..V8 to their integer', () => {
    expect(parseVGrade('V0')).toBe(0)
    expect(parseVGrade('V5')).toBe(5)
    expect(parseVGrade('V8')).toBe(8)
  })

  it('parses above V8 (no artificial upper cap)', () => {
    expect(parseVGrade('V10')).toBe(10)
  })

  it('returns null for malformed grades', () => {
    expect(parseVGrade('5')).toBeNull()
    expect(parseVGrade('VX')).toBeNull()
    expect(parseVGrade('')).toBeNull()
    expect(parseVGrade('V')).toBeNull()
    expect(parseVGrade('V-1')).toBeNull()
  })
})

describe('formatVGrade', () => {
  it('formats an integer as V{n}', () => {
    expect(formatVGrade(0)).toBe('V0')
    expect(formatVGrade(5)).toBe('V5')
  })

  it('round-trips with parseVGrade', () => {
    for (let g = 0; g <= 8; g++) expect(parseVGrade(formatVGrade(g))).toBe(g)
  })
})

describe('normalizeClimbingEntries', () => {
  it('drops all-zero grades and empty input', () => {
    expect(normalizeClimbingEntries([])).toEqual([])
    expect(normalizeClimbingEntries([{ grade: 'V1', attempts: 0, sends: 0 }])).toEqual([])
  })

  it('keeps a projecting grade (attempts > 0, zero sends) with count 0', () => {
    expect(normalizeClimbingEntries([{ grade: 'V6', attempts: 4, sends: 0 }]))
      .toEqual([{ grade: 'V6', count: 0, attempts: 4 }])
  })

  it('clamps attempts up to sends so attempts >= count always holds', () => {
    expect(normalizeClimbingEntries([{ grade: 'V2', attempts: 1, sends: 3 }]))
      .toEqual([{ grade: 'V2', count: 3, attempts: 3 }])
  })

  it('passes attempts through unchanged when already >= sends', () => {
    expect(normalizeClimbingEntries([{ grade: 'V2', attempts: 5, sends: 3 }]))
      .toEqual([{ grade: 'V2', count: 3, attempts: 5 }])
  })

  it('keeps a sends-only grade (attempts left 0) by clamping attempts to sends', () => {
    expect(normalizeClimbingEntries([{ grade: 'V3', attempts: 0, sends: 2 }]))
      .toEqual([{ grade: 'V3', count: 2, attempts: 2 }])
  })
})
