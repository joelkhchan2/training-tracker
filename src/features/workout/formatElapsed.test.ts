import { describe, expect, it } from 'vitest'
import { formatElapsed } from './formatElapsed'

describe('formatElapsed', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(90)).toBe('1:30')
    expect(formatElapsed(3661)).toBe('1:01:01')
  })
})
