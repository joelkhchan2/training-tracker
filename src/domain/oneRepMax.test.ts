import { describe, it, expect } from 'vitest'
import { epley1RM, weightForReps, round1, percentageTable } from './oneRepMax'

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

describe('percentageTable', () => {
  it('returns the 8 percentages 95..60 with round1(e1rm*pct/100) loads', () => {
    const t = percentageTable(300)
    expect(t.map(r => r.pct)).toEqual([95, 90, 85, 80, 75, 70, 65, 60])
    expect(t.find(r => r.pct === 95)!.load).toBe(285)
    expect(t.find(r => r.pct === 60)!.load).toBe(180)
  })

  it('rounds each load to one decimal from the unrounded e1RM (pins raw-input behavior)', () => {
    // raw epley for 100x5 = 116.666…; 95% = 110.833… → 110.8
    expect(percentageTable(116.6667).find(r => r.pct === 95)!.load).toBe(110.8)
  })

  it('yields all-zero loads for e1rm 0', () => {
    expect(percentageTable(0).every(r => r.load === 0)).toBe(true)
  })
})
