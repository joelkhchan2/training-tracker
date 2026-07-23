import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { RestTimerPill } from './RestTimerPill'
import { useRestTimer } from './restTimer'

describe('RestTimerPill', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); useRestTimer.getState().skip() })
  afterEach(() => { useRestTimer.getState().skip(); vi.useRealTimers() }) // stop the interval before restoring real timers

  it('renders nothing when idle', () => {
    const { container } = render(<RestTimerPill />)
    expect(container).toBeEmptyDOMElement()
  })
  it('shows remaining + fires +30s and skip when running', () => {
    useRestTimer.getState().start(120)
    render(<RestTimerPill />)
    // getByText('2:00') would be ambiguous here: the 120s preset button renders the same
    // text as the countdown when remaining === 120, so the countdown needs its own testid.
    expect(screen.getByTestId('rest-timer-remaining')).toHaveTextContent('2:00')
    fireEvent.click(screen.getByRole('button', { name: '+30s' }))
    expect(screen.getByText('2:30')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(useRestTimer.getState().endAt).toBeNull()
  })
  it('starts a custom minutes:seconds duration', () => {
    useRestTimer.getState().start(60)
    render(<RestTimerPill />)
    fireEvent.change(screen.getByLabelText('Custom minutes'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Custom seconds'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    expect(useRestTimer.getState().endAt).toBe(150_000) // 2:30 from setSystemTime(0)
  })
})
