import { describe, expect, it } from 'vitest'
import { toDisplayWeight, fromDisplayWeight, formatWeight, LB_PER_KG } from './weight'

describe('weight — LB_PER_KG', () => {
  it('is the exact international avoirdupois pound factor', () => {
    expect(LB_PER_KG).toBe(0.45359237)
  })
})

describe('toDisplayWeight / fromDisplayWeight', () => {
  it('is identity in lb mode, both directions (no rounding drift)', () => {
    expect(toDisplayWeight(135, 'lb')).toBe(135)
    expect(toDisplayWeight(116.66666, 'lb')).toBe(116.66666)
    expect(fromDisplayWeight(135, 'lb')).toBe(135)
    expect(fromDisplayWeight(116.66666, 'lb')).toBe(116.66666)
  })

  it('converts and round1-quantizes in kg mode, both directions', () => {
    expect(toDisplayWeight(100, 'kg')).toBe(45.4) // round1(45.359237)
    expect(toDisplayWeight(225, 'kg')).toBe(102.1) // round1(102.0582...)
    expect(fromDisplayWeight(60, 'kg')).toBe(132.3) // round1(60 / 0.45359237)
  })

  it('round-trips a kg edit back to (quantized) lb', () => {
    const lb = fromDisplayWeight(60, 'kg') // 132.3
    expect(toDisplayWeight(lb, 'kg')).toBe(60)
  })

  it('treats non-finite input as 0', () => {
    expect(toDisplayWeight(Number.NaN, 'kg')).toBe(0)
    expect(toDisplayWeight(Number.NaN, 'lb')).toBe(0)
    expect(fromDisplayWeight(Number.NaN, 'kg')).toBe(0)
    expect(fromDisplayWeight(Number.NaN, 'lb')).toBe(0)
    expect(toDisplayWeight(Infinity, 'kg')).toBe(0)
    expect(toDisplayWeight(Infinity, 'lb')).toBe(0)
    expect(toDisplayWeight(-Infinity, 'kg')).toBe(0)
    expect(toDisplayWeight(-Infinity, 'lb')).toBe(0)
    expect(fromDisplayWeight(Infinity, 'kg')).toBe(0)
    expect(fromDisplayWeight(Infinity, 'lb')).toBe(0)
    expect(fromDisplayWeight(-Infinity, 'kg')).toBe(0)
    expect(fromDisplayWeight(-Infinity, 'lb')).toBe(0)
  })
})

describe('formatWeight', () => {
  it('returns a bare number in lb mode (no suffix)', () => {
    expect(formatWeight(135, 'lb')).toBe('135')
    expect(formatWeight(0, 'lb')).toBe('0')
  })

  it('appends " kg" only in kg mode, on the converted value', () => {
    expect(formatWeight(100, 'kg')).toBe('45.4 kg')
    expect(formatWeight(25, 'kg')).toBe('11.3 kg') // round1(25 * 0.45359237)
  })
})
