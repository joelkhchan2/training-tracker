import { describe, expect, it } from 'vitest'
import { formatDuration, parseDurationInput } from './duration'
import { inferInputType, shapeSetForSave } from './duration'

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

describe('inferInputType', () => {
  it('infers weighted: weight set, no duration', () => {
    expect(inferInputType({ weight: 135, durationSeconds: null })).toBe('weighted')
  })
  it('infers bodyweight: no weight, no duration', () => {
    expect(inferInputType({ weight: null, durationSeconds: null })).toBe('bodyweight')
  })
  it('infers timed: no weight, duration set', () => {
    expect(inferInputType({ weight: null, durationSeconds: 45 })).toBe('timed')
  })
  it('infers weighted_time: weight set, duration set', () => {
    expect(inferInputType({ weight: 45, durationSeconds: 30 })).toBe('weighted_time')
  })
  it('infers a legacy null/null row as bodyweight (pre-migration rows, unaffected)', () => {
    expect(inferInputType({ weight: null, durationSeconds: null })).toBe('bodyweight')
  })
})

describe('shapeSetForSave', () => {
  it('weighted: shapes weight+reps, nulling duration; defaults an untyped weight to 0', () => {
    expect(shapeSetForSave('weighted', { weight: 135, reps: 5, durationSeconds: null })).toEqual({
      weight: 135, reps: 5, durationSeconds: null,
    })
    expect(shapeSetForSave('weighted', { weight: null, reps: 10, durationSeconds: null })).toEqual({
      weight: 0, reps: 10, durationSeconds: null,
    })
  })
  it('weighted: drops the set (returns null) when reps is untyped', () => {
    expect(shapeSetForSave('weighted', { weight: 135, reps: null, durationSeconds: null })).toBeNull()
  })
  it('bodyweight: shapes reps only, weight forced null', () => {
    expect(shapeSetForSave('bodyweight', { weight: 999, reps: 8, durationSeconds: null })).toEqual({
      weight: null, reps: 8, durationSeconds: null,
    })
  })
  it('bodyweight: drops the set when reps is untyped', () => {
    expect(shapeSetForSave('bodyweight', { weight: null, reps: null, durationSeconds: null })).toBeNull()
  })
  it('timed: shapes duration only, weight and reps forced null', () => {
    expect(shapeSetForSave('timed', { weight: 999, reps: 999, durationSeconds: 45 })).toEqual({
      weight: null, reps: null, durationSeconds: 45,
    })
  })
  it('timed: drops the set when duration is untyped (never fabricates a zero-weight/zero-rep row)', () => {
    expect(shapeSetForSave('timed', { weight: null, reps: null, durationSeconds: null })).toBeNull()
  })
  it('weighted_time: shapes weight+duration, reps forced null; defaults an untyped weight to 0', () => {
    expect(shapeSetForSave('weighted_time', { weight: 45, reps: 999, durationSeconds: 30 })).toEqual({
      weight: 45, reps: null, durationSeconds: 30,
    })
    expect(shapeSetForSave('weighted_time', { weight: null, reps: null, durationSeconds: 30 })).toEqual({
      weight: 0, reps: null, durationSeconds: 30,
    })
  })
  it('weighted_time: drops the set when duration is untyped', () => {
    expect(shapeSetForSave('weighted_time', { weight: 45, reps: null, durationSeconds: null })).toBeNull()
  })
  it('returns null for an unknown/undefined inputType rather than falling through silently', () => {
    expect(
      shapeSetForSave('bogus' as unknown as import('./duration').InputType, {
        weight: 135,
        reps: 5,
        durationSeconds: null,
      }),
    ).toBeNull()
  })
})
