import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { HistoryPage } from './HistoryPage'

const { useSessionHistory, useDeleteSession } = vi.hoisted(() => ({
  useSessionHistory: vi.fn(),
  useDeleteSession: vi.fn(),
}))

vi.mock('../../data/sessionHistory', () => ({ useSessionHistory, useDeleteSession }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))

const deleteMutate = vi.fn()

beforeEach(() => {
  deleteMutate.mockReset()
  useDeleteSession.mockReturnValue({ mutate: deleteMutate })
  useSessionHistory.mockReturnValue({ data: [], isLoading: false })
})

describe('HistoryPage', () => {
  it('shows an empty state when there are no sessions', () => {
    render(<HistoryPage />)
    expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument()
  })

  it('renders cardio and strength rows', () => {
    useSessionHistory.mockReturnValue({
      isLoading: false,
      data: [
        { kind: 'cardio', id: 's1', date: '2026-07-21', activity: 'Run', durationMinutes: 32, distanceKm: 5.2, pace: '6:09' },
        { kind: 'strength', id: 's2', date: '2026-07-20', label: 'Gym A', setCount: 12 },
      ],
    })
    render(<HistoryPage />)
    expect(screen.getByText('Run')).toBeInTheDocument()
    expect(screen.getByText(/6:09 \/km/)).toBeInTheDocument()
    expect(screen.getByText('Gym A')).toBeInTheDocument()
    expect(screen.getByText(/12 sets/)).toBeInTheDocument()
  })

  it('deletes a cardio session after confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    useSessionHistory.mockReturnValue({
      isLoading: false,
      data: [{ kind: 'cardio', id: 's1', date: '2026-07-21', activity: 'Run', durationMinutes: 32, distanceKm: 5.2, pace: '6:09' }],
    })
    render(<HistoryPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Run' }))
    expect(deleteMutate).toHaveBeenCalledWith('s1')
  })
})
