import { describe, it, expect } from 'vitest'
import { epley1RM, weightForReps, round1 } from './oneRepMax'

describe('epley1RM', () => {
  it('225x5 ≈ 262.5', () => { expect(round1(epley1RM(225, 5))).toBe(262.5) })
  it('100x5 ≈ 116.7', () => { expect(round1(epley1RM(100, 5))).toBe(116.7) })
  it('returns 0 for 0 reps', () => { expect(epley1RM(225, 0)).toBe(0) })
  it('returns 0 for 0 weight', () => { expect(epley1RM(0, 5)).toBe(0) })
})

describe('weightForReps', () => {
  it('round-trips: weightForReps(epley1RM(225,5),5) ≈ 225', () => {
    expect(Math.round(weightForReps(epley1RM(225, 5), 5))).toBe(225)
  })
  it('returns 0 for 0 reps', () => { expect(weightForReps(150, 0)).toBe(0) })
})

describe('round1', () => {
  it('rounds to one decimal', () => { expect(round1(116.6667)).toBe(116.7) })
})
