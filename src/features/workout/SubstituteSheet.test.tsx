import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SubstituteSheet } from './SubstituteSheet'

const { useAlternateExercises } = vi.hoisted(() => ({ useAlternateExercises: vi.fn() }))
vi.mock('../../data/alternateExercises', () => ({ useAlternateExercises }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../data/exerciseCatalog', () => ({ useExerciseSearch: () => ({ data: [] }) }))
// ExercisePicker now calls these two hooks itself; this test harness has no
// QueryClientProvider, so stub them out too.
vi.mock('../../data/favoriteExercises', () => ({
  useFavoriteExercises: () => ({ items: [], ids: new Set() }),
  useToggleFavorite: () => ({ mutate: vi.fn() }),
}))
vi.mock('../../data/recentExercises', () => ({ useRecentExercises: () => ({ data: [] }) }))

describe('SubstituteSheet', () => {
  it('renders suggested alternates and routes a tap to onPick', () => {
    useAlternateExercises.mockReturnValue({
      data: [
        { id: 'dl', name: 'Barbell Deadlift', exerciseType: 'weighted', sharedCount: 4 },
        { id: 'bw', name: 'Pull-up', exerciseType: 'bodyweight', sharedCount: 2 },
      ],
      isLoading: false,
    })
    const onPick = vi.fn(); const onClose = vi.fn()
    render(<SubstituteSheet currentExerciseId="sq" currentName="Barbell Squat" onPick={onPick} onClose={onClose} />)

    expect(screen.getByText('Suggested alternates')).toBeInTheDocument()
    expect(screen.getByText('Barbell Deadlift')).toBeInTheDocument()
    expect(screen.getByText('4 shared')).toBeInTheDocument()
    expect(screen.getByText('Pull-up')).toBeInTheDocument()
    expect(screen.getByText('2 shared')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Barbell Deadlift/ }))
    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Barbell Deadlift', kind: 'strength', exerciseId: 'dl' })

    fireEvent.click(screen.getByRole('button', { name: /Pull-up/ }))
    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Pull-up', kind: 'bodyweight', exerciseId: 'bw' })
  })

  it('shows a fallback note and still renders search when there are no alternates', () => {
    useAlternateExercises.mockReturnValue({ data: [], isLoading: false })
    render(<SubstituteSheet currentExerciseId={null} currentName="Zercher Squat" onPick={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('No suggestions — search below.')).toBeInTheDocument()
    expect(screen.getByLabelText('Search exercises')).toBeInTheDocument()
  })

  it('calls onClose when Cancel is tapped', () => {
    useAlternateExercises.mockReturnValue({ data: [], isLoading: false })
    const onClose = vi.fn()
    render(<SubstituteSheet currentExerciseId={null} currentName="Zercher Squat" onPick={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
