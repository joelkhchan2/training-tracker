import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { HistoryPage } from './HistoryPage'

const { useSessionHistory } = vi.hoisted(() => ({
  useSessionHistory: vi.fn(),
}))

const navigate = vi.fn()

vi.mock('../../data/sessionHistory', () => ({ useSessionHistory }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))

beforeEach(() => {
  navigate.mockReset()
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

  it('rounds a long-decimal distance to at most 2 places', () => {
    useSessionHistory.mockReturnValue({
      isLoading: false,
      data: [{ kind: 'cardio', id: 's1', date: '2026-07-21', activity: 'Run', durationMinutes: 32, distanceKm: 5.234567, pace: '6:09' }],
    })
    render(<HistoryPage />)
    expect(screen.getByText(/5\.23 km/)).toBeInTheDocument()
  })

  it('navigates to the session detail route when a row is clicked', () => {
    useSessionHistory.mockReturnValue({
      isLoading: false,
      data: [{ kind: 'cardio', id: 's1', date: '2026-07-21', activity: 'Run', durationMinutes: 32, distanceKm: 5.2, pace: '6:09' }],
    })
    render(<HistoryPage />)
    fireEvent.click(screen.getByText('Run'))
    expect(navigate).toHaveBeenCalledWith('/history/s1')
  })

  it('does not render a Delete button in the list anymore', () => {
    useSessionHistory.mockReturnValue({
      isLoading: false,
      data: [
        { kind: 'cardio', id: 's1', date: '2026-07-21', activity: 'Run', durationMinutes: 32, distanceKm: 5.2, pace: '6:09' },
        { kind: 'strength', id: 's2', date: '2026-07-20', label: 'Gym A', setCount: 12 },
      ],
    })
    render(<HistoryPage />)
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('renders a projecting-only climbing session without ×0', () => {
    useSessionHistory.mockReturnValue({
      data: [{ kind: 'climbing', id: 's1', date: '2026-07-27', breakdown: '', totalSends: 0, totalAttempts: 8 }],
      isLoading: false,
    })
    render(<HistoryPage />)
    expect(screen.getByText(/8 attempts · 0 sends/)).toBeInTheDocument()
    expect(screen.queryByText(/×0/)).not.toBeInTheDocument()
  })

  it('renders a sent climbing session with breakdown + tried when attempts exceed sends', () => {
    useSessionHistory.mockReturnValue({
      data: [{ kind: 'climbing', id: 's2', date: '2026-07-27', breakdown: 'V4×1', totalSends: 1, totalAttempts: 4 }],
      isLoading: false,
    })
    render(<HistoryPage />)
    expect(screen.getByText(/V4×1 · 1 send · 4 tried/)).toBeInTheDocument()
  })
})
