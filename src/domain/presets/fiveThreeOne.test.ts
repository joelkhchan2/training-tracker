import { describe, it, expect } from 'vitest'
import { fiveThreeOne } from './fiveThreeOne'

describe('fiveThreeOne preset', () => {
  it('has 2 days and a cycle_tm_bump progression', () => {
    expect(fiveThreeOne.days.map(d => d.name)).toEqual(['Gym A', 'Gym B'])
    expect(fiveThreeOne.progressionRule?.type).toBe('cycle_tm_bump')
  })
  it('main lifts use 4-week percentage schemes', () => {
    const squat = fiveThreeOne.days[0].exercises[0]
    expect(squat.scheme.type).toBe('percentage')
    if (squat.scheme.type === 'percentage') expect(squat.scheme.weeks.length).toBe(4)
  })
})
