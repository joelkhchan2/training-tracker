import { describe, it, expect } from 'vitest'
import { strengthLevel } from './strengthStandards'

describe('strengthLevel', () => {
  it('bench 157 @ 157bw → Intermediate, next Advanced @ 236', () => {
    expect(strengthLevel(157, 157, 'Bench Press')).toEqual({
      level: 'Intermediate', ratio: 1, nextLevel: 'Advanced', nextWeight: 236,
    })
  })
  it('bench 500 @ 157bw → Elite, no next', () => {
    const r = strengthLevel(500, 157, 'Bench Press')!
    expect(r.level).toBe('Elite'); expect(r.nextLevel).toBeNull()
  })
  it('returns null on 0 bodyweight or unknown lift', () => {
    expect(strengthLevel(300, 0, 'Squat')).toBeNull()
    expect(strengthLevel(300, 150, 'Nonexistent')).toBeNull()
  })
  it('below the Beginner threshold reports "Below Beginner", next tier is Beginner', () => {
    // squat e1RM 100 @ bw 200 → ratio 0.5, below Beginner (0.75)
    expect(strengthLevel(100, 200, 'Squat')).toEqual({
      level: 'Below Beginner', ratio: 0.5, nextLevel: 'Beginner', nextWeight: 150,
    })
  })
})
