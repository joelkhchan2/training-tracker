import { describe, it, expect } from 'vitest'
import { dailyStreak } from './streaks'

describe('dailyStreak', () => {
  // Wednesday 2026-06-03; done Mon(06-01) & Tue(06-02), not Wed, not Sun(05-31)
  it('today missing does not break; prior miss does; counts back', () => {
    const r = dailyStreak(['2026-06-01', '2026-06-02'], '2026-06-03')
    expect(r.currentStreak).toBe(2)
  })
  it('counts Monday..today for thisWeekDays', () => {
    const r = dailyStreak(['2026-06-01', '2026-06-02'], '2026-06-03') // Wed → Mon,Tue,Wed window
    expect(r.thisWeekDays).toBe(2)
  })
  it('streak includes today when today is done', () => {
    expect(dailyStreak(['2026-06-03', '2026-06-02'], '2026-06-03').currentStreak).toBe(2)
  })
  it('empty input → zeros', () => {
    expect(dailyStreak([], '2026-06-03')).toEqual({ currentStreak: 0, thisWeekDays: 0 })
  })
})
