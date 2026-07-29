import { describe, expect, it } from 'vitest'
import { startedAtForElapsed, shiftedStartedAt } from './timerMath'

const NOW = new Date('2026-07-29T12:00:00.000Z').getTime()

describe('startedAtForElapsed', () => {
  it('returns the ISO startedAt that is `seconds` before nowMs', () => {
    expect(startedAtForElapsed(NOW, 3600)).toBe(new Date(NOW - 3600_000).toISOString())
  })

  it('clamps a negative seconds to 0 elapsed (startedAt === now)', () => {
    expect(startedAtForElapsed(NOW, -30)).toBe(new Date(NOW).toISOString())
  })
})

describe('shiftedStartedAt', () => {
  it('increases elapsed by +60s from a known startedAt', () => {
    const startedAt = startedAtForElapsed(NOW, 600) // 10 min elapsed
    expect(shiftedStartedAt(startedAt, NOW, 60)).toBe(startedAtForElapsed(NOW, 660))
  })

  it('decreases elapsed by 60s', () => {
    const startedAt = startedAtForElapsed(NOW, 600)
    expect(shiftedStartedAt(startedAt, NOW, -60)).toBe(startedAtForElapsed(NOW, 540))
  })

  it('clamps elapsed to 0 rather than going negative', () => {
    const startedAt = startedAtForElapsed(NOW, 30) // 30s elapsed
    expect(shiftedStartedAt(startedAt, NOW, -60)).toBe(startedAtForElapsed(NOW, 0)) // would be -30s
  })
})
