import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimerPopup } from './TimerPopup'
import { useSessionStore } from './sessionStore'
import { startedAtForElapsed } from './timerMath'

const NOW = new Date('2026-07-29T12:00:00.000Z')

beforeEach(() => {
  useSessionStore.getState().reset()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

function startSessionWithElapsedMinutes(minutes: number) {
  useSessionStore.getState().startFromPrescription(
    [{ exerciseName: 'Squat', sets: [{ weight: 100, reps: 5 }] }] as never,
    {
      sessionType: 'A',
      dayName: 'A',
      dayIndex: 0,
      clientId: 'c1',
      startedAt: startedAtForElapsed(NOW.getTime(), minutes * 60),
    },
  )
}

describe('TimerPopup', () => {
  it('shows the current elapsed time', () => {
    startSessionWithElapsedMinutes(10)
    render(<TimerPopup onClose={vi.fn()} />)
    expect(screen.getByText('10:00')).toBeInTheDocument()
  })

  it('"Set" applies the typed minutes as the new elapsed time', () => {
    startSessionWithElapsedMinutes(10)
    render(<TimerPopup onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Set exact minutes'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    expect(useSessionStore.getState().startedAt).toBe(startedAtForElapsed(NOW.getTime(), 3600))
  })

  it('+1 min shifts elapsed up by 60s', () => {
    startSessionWithElapsedMinutes(10)
    render(<TimerPopup onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '+1 min' }))
    expect(useSessionStore.getState().startedAt).toBe(startedAtForElapsed(NOW.getTime(), 660))
  })

  it('−1 min shifts elapsed down by 60s, clamped at 0', () => {
    startSessionWithElapsedMinutes(0.5) // 30s elapsed
    render(<TimerPopup onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '−1 min' }))
    expect(useSessionStore.getState().startedAt).toBe(startedAtForElapsed(NOW.getTime(), 0))
  })

  it('Reset sets elapsed to 0', () => {
    startSessionWithElapsedMinutes(10)
    render(<TimerPopup onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(useSessionStore.getState().startedAt).toBe(startedAtForElapsed(NOW.getTime(), 0))
  })

  it('Done calls onClose', () => {
    startSessionWithElapsedMinutes(10)
    const onClose = vi.fn()
    render(<TimerPopup onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
