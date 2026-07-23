import { render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { SessionTimer } from './SessionTimer'

afterEach(() => vi.useRealTimers())

describe('SessionTimer', () => {
  it('renders elapsed since startedAt and ticks', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T00:02:00Z')) // 2 min after startedAt
    render(<SessionTimer startedAt="2026-07-23T00:00:00Z" />)
    expect(screen.getByText('2:00')).toBeInTheDocument()
    // Advancing the fake clock by 1000ms already moves Date.now() forward to
    // 00:02:01 to match; a redundant vi.setSystemTime() call here interacts
    // badly with vitest's fake-timer tick semantics (the pending interval
    // ends up reading Date.now() at the tick's end rather than its scheduled
    // instant), so we rely on advanceTimersByTime alone.
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('2:01')).toBeInTheDocument()
  })
})
