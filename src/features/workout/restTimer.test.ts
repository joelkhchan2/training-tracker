import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { computeRemaining, useRestTimer } from './restTimer'

describe('computeRemaining', () => {
  it('is drift-resistant: derived from endAt - now', () => {
    expect(computeRemaining(10_000, 0)).toBe(10)
    expect(computeRemaining(10_000, 9_400)).toBe(1)   // ceil
    expect(computeRemaining(10_000, 12_000)).toBe(0)  // clamped
    expect(computeRemaining(null, 0)).toBe(0)
  })
})

describe('useRestTimer', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); localStorage.clear(); useRestTimer.getState().skip() })
  afterEach(() => vi.useRealTimers())

  it('start sets endAt + remaining + persists lastDuration', () => {
    useRestTimer.getState().start(120)
    expect(useRestTimer.getState().endAt).toBe(120_000)
    expect(useRestTimer.getState().remaining).toBe(120)
    expect(localStorage.getItem('tt-rest-timer-seconds')).toBe('120')
  })
  it('start with no arg reuses lastDuration', () => {
    useRestTimer.getState().start(90); useRestTimer.getState().skip()
    useRestTimer.getState().start()
    expect(useRestTimer.getState().endAt).toBe(90_000)
  })
  it('addThirty extends endAt; skip clears', () => {
    useRestTimer.getState().start(60)
    useRestTimer.getState().addThirty()
    expect(useRestTimer.getState().endAt).toBe(90_000)
    useRestTimer.getState().skip()
    expect(useRestTimer.getState().endAt).toBeNull()
    expect(useRestTimer.getState().remaining).toBe(0)
  })
  it('addThirty after expiry re-arms the tick interval instead of freezing', () => {
    useRestTimer.getState().start(2)
    vi.advanceTimersByTime(2_250) // past expiry: tick() fires, remaining hits 0, interval cleared
    expect(useRestTimer.getState().remaining).toBe(0)

    useRestTimer.getState().addThirty()
    expect(useRestTimer.getState().remaining).toBeGreaterThan(0)
    expect(useRestTimer.getState().remaining).toBeCloseTo(30, 0)

    const afterAddThirty = useRestTimer.getState().remaining
    vi.advanceTimersByTime(1_000) // interval must be running again for this to decrement
    expect(useRestTimer.getState().remaining).toBeLessThan(afterAddThirty)
  })
})
