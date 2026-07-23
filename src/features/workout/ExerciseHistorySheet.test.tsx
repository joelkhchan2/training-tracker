import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExerciseHistorySheet } from './ExerciseHistorySheet'

const { useExerciseHistory } = vi.hoisted(() => ({ useExerciseHistory: vi.fn() }))

vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../data/exerciseHistory', () => ({ useExerciseHistory }))

const sessions = [
  { sessionId: 's2', date: '2026-07-20', sets: [{ weight: 155, reps: 3, isWarmup: false }], e1rm: 165, volume: 465 },
  { sessionId: 's1', date: '2026-07-13', sets: [{ weight: 125, reps: 5, isWarmup: false }], e1rm: 145, volume: 625 },
]

describe('ExerciseHistorySheet', () => {
  it('renders each session date + e1RM and a Sparkline for 2+ points', () => {
    useExerciseHistory.mockReturnValue({ data: sessions, isLoading: false })
    const { container } = render(<ExerciseHistorySheet exerciseId="ex-1" exerciseName="Squat" onClose={vi.fn()} />)

    expect(screen.getByText('Squat')).toBeInTheDocument()
    expect(screen.getByText('2026-07-20')).toBeInTheDocument()
    expect(screen.getByText('2026-07-13')).toBeInTheDocument()
    expect(screen.getByText(/e1RM 165/)).toBeInTheDocument()
    expect(screen.getByText(/e1RM 145/)).toBeInTheDocument()
    expect(container.querySelector('polyline')).toBeInTheDocument()
  })

  it('shows "No history yet" when there are no sessions', () => {
    useExerciseHistory.mockReturnValue({ data: [], isLoading: false })
    render(<ExerciseHistorySheet exerciseId="ex-1" exerciseName="Squat" onClose={vi.fn()} />)
    expect(screen.getByText(/No history yet/)).toBeInTheDocument()
  })

  it('calls onClose from the Close button', () => {
    useExerciseHistory.mockReturnValue({ data: [], isLoading: false })
    const onClose = vi.fn()
    render(<ExerciseHistorySheet exerciseId="ex-1" exerciseName="Squat" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders a bodyweight session as "BW×N" with a rep-count meta, not "e1RM 0 · 0 vol"', () => {
    useExerciseHistory.mockReturnValue({
      data: [
        {
          sessionId: 's1',
          date: '2026-07-20',
          e1rm: 0,
          volume: 0,
          sets: [
            { weight: null, reps: 8, isWarmup: false },
            { weight: null, reps: 6, isWarmup: false },
          ],
        },
      ],
      isLoading: false,
    })
    render(<ExerciseHistorySheet exerciseId="ex-1" exerciseName="Pull-ups" onClose={vi.fn()} />)
    expect(screen.getByText('BW×8, BW×6')).toBeInTheDocument()
    expect(screen.getByText('14 reps')).toBeInTheDocument()
    expect(screen.queryByText(/e1RM 0/)).not.toBeInTheDocument()
  })
})
