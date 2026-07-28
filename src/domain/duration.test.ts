import { describe, expect, it } from 'vitest'
import { formatDuration, parseDurationInput } from './duration'

describe('formatDuration', () => {
  it('renders 0 as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00')
  })
  it('renders sub-minute seconds zero-padded', () => {
    expect(formatDuration(45)).toBe('0:45')
  })
  it('renders minutes:seconds', () => {
    expect(formatDuration(90)).toBe('1:30')
  })
  it('does not pad minutes but always pads seconds to 2 digits', () => {
    expect(formatDuration(725)).toBe('12:05')
  })
})

describe('parseDurationInput', () => {
  it('parses mm:ss', () => {
    expect(parseDurationInput('1:30')).toBe(90)
  })
  it('parses a bare number (no colon) as total seconds', () => {
    expect(parseDurationInput('90')).toBe(90)
  })
  it('parses a zero-padded seconds part', () => {
    expect(parseDurationInput('0:05')).toBe(5)
  })
  it('returns null for an empty string', () => {
    expect(parseDurationInput('')).toBeNull()
  })
  it('returns null when the seconds part is out of range (0-59)', () => {
    expect(parseDurationInput('1:75')).toBeNull()
  })
  it('returns null for a non-numeric string', () => {
    expect(parseDurationInput('abc')).toBeNull()
  })
})
