import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExerciseCard } from './ExerciseCard'
import type { ExerciseHistorySession } from '../../data/exerciseHistory'

const { useExerciseHistory } = vi.hoisted(() => ({
  useExerciseHistory: vi.fn<(exerciseId: string | null, userId: string | undefined) => { data: ExerciseHistorySession[] | undefined; isLoading: boolean }>(
    () => ({ data: undefined, isLoading: false }),
  ),
}))

vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../data/exerciseHistory', () => ({ useExerciseHistory }))

const ex = { id: 'x1', exerciseId: null, exerciseName: 'Squat', kind: 'strength' as const, sets: [{ weight: 100, reps: 5, done: false }] }

describe('ExerciseCard', () => {
  it('fires onRemove and onReplace from the controls', () => {
    const onRemove = vi.fn(); const onReplace = vi.fn()
    render(<ExerciseCard exIdx={0} exercise={ex} exerciseId={null} onRemove={onRemove} onReplace={onReplace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Squat' }))
    expect(onRemove).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Replace Squat' }))
    expect(onReplace).toHaveBeenCalled()
  })
  it('hides the weight field for a bodyweight exercise', () => {
    render(<ExerciseCard exIdx={0} exercise={{ ...ex, kind: 'bodyweight' }} exerciseId={null} onRemove={vi.fn()} onReplace={vi.fn()} />)
    expect(screen.queryByLabelText('Weight')).not.toBeInTheDocument()
  })
  it('excludes a done warmup set from the running volume hint', () => {
    const warmupEx = {
      id: 'x',
      exerciseId: null,
      exerciseName: 'Squat',
      kind: 'strength' as const,
      sets: [
        { weight: 100, reps: 5, done: true, isWarmup: true },
        { weight: 100, reps: 5, done: true },
      ],
    }
    render(<ExerciseCard exIdx={0} exercise={warmupEx} exerciseId={null} onRemove={vi.fn()} onReplace={vi.fn()} />)
    expect(screen.getByText('500 vol')).toBeInTheDocument() // only the non-warmup set counts
  })

  describe('history hint + sheet', () => {
    it('shows no "last:" hint and no 🕐 button when exerciseId is null', () => {
      render(<ExerciseCard exIdx={0} exercise={ex} exerciseId={null} onRemove={vi.fn()} onReplace={vi.fn()} />)
      expect(screen.queryByText(/^last:/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /History for/ })).not.toBeInTheDocument()
    })

    it('shows a "last:" hint from history[0] and opens the sheet from the 🕐 button', () => {
      useExerciseHistory.mockReturnValue({
        data: [
          {
            sessionId: 's1',
            date: '2026-07-20',
            e1rm: 165,
            volume: 465,
            sets: [
              { weight: 155, reps: 3, isWarmup: false },
              { weight: 45, reps: 8, isWarmup: true },
            ],
          },
        ],
        isLoading: false,
      })

      render(<ExerciseCard exIdx={0} exercise={ex} exerciseId="ex-1" onRemove={vi.fn()} onReplace={vi.fn()} />)

      expect(screen.getByText('last: 155×3 · 2026-07-20')).toBeInTheDocument()

      const historyButton = screen.getByRole('button', { name: 'History for Squat' })
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
      fireEvent.click(historyButton)
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    })
  })
})
