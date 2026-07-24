import { describe, expect, it } from 'vitest'
import { parseVGrade, formatVGrade } from './climbing'

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
