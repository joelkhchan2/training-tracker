import { describe, expect, it } from 'vitest'
import { formatPace } from './cardio'

describe('formatPace', () => {
  it('formats minutes+km as m:ss per km, rounded to whole seconds', () => {
    expect(formatPace(32, 5.2)).toBe('6:09') // 1920s / 5.2km = 369.2 → 369s → 6:09
  })

  it('zero-pads the seconds', () => {
    expect(formatPace(4, 5)).toBe('0:48') // 240s / 5km = 48s → 0:48
  })

  it('handles clean whole-minute paces', () => {
    expect(formatPace(10, 5)).toBe('2:00') // 600s / 5km = 120s → 2:00
  })

  it('returns null when distance is zero', () => {
    expect(formatPace(30, 0)).toBeNull()
  })

  it('returns null when distance is null/undefined', () => {
    expect(formatPace(30, null)).toBeNull()
    expect(formatPace(30, undefined)).toBeNull()
  })

  it('returns null when duration is null/undefined', () => {
    expect(formatPace(null, 5)).toBeNull()
    expect(formatPace(undefined, 5)).toBeNull()
  })
})
