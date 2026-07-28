import { render, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SubstituteSheet } from './SubstituteSheet'
import type { ExercisePickerProps } from '../programs/ExercisePicker'

const { useAlternateExercises } = vi.hoisted(() => ({ useAlternateExercises: vi.fn() }))
const { mockExercisePickerProps } = vi.hoisted(() => ({ mockExercisePickerProps: vi.fn() }))

vi.mock('../../data/alternateExercises', () => ({ useAlternateExercises }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../programs/ExercisePicker', () => ({
  ExercisePicker: (props: ExercisePickerProps) => {
    mockExercisePickerProps(props)
    return <div data-testid="exercise-picker-stub" />
  },
}))

describe('SubstituteSheet', () => {
  it('maps useAlternateExercises data to ExerciseListItem and passes it as suggested, labeled "Suggested alternates"', () => {
    useAlternateExercises.mockReturnValue({
      data: [
        { id: 'dl', name: 'Barbell Deadlift', exerciseType: 'weighted', primaryMuscles: 'back, hamstrings', equipment: 'barbell', sharedCount: 4 },
        { id: 'bw', name: 'Pull-up', exerciseType: 'bodyweight', primaryMuscles: null, equipment: null, sharedCount: 2 },
      ],
      isLoading: false,
    })
    render(<SubstituteSheet currentExerciseId="sq" currentName="Barbell Squat" onPick={vi.fn()} onClose={vi.fn()} />)

    expect(mockExercisePickerProps).toHaveBeenCalledWith(expect.objectContaining({
      suggested: [
        { id: 'dl', name: 'Barbell Deadlift', exerciseType: 'weighted', primaryMuscles: 'back, hamstrings', equipment: 'barbell' },
        { id: 'bw', name: 'Pull-up', exerciseType: 'bodyweight', primaryMuscles: null, equipment: null },
      ],
      suggestedLabel: 'Suggested alternates',
    }))
  })

  it('no longer renders its own "Suggested alternates" heading or fallback copy directly', () => {
    useAlternateExercises.mockReturnValue({ data: [], isLoading: false })
    render(<SubstituteSheet currentExerciseId={null} currentName="Zercher Squat" onPick={vi.fn()} onClose={vi.fn()} />)

    expect(screen.queryByText('Suggested alternates')).not.toBeInTheDocument()
    expect(screen.queryByText('No suggestions — search below.')).not.toBeInTheDocument()
    expect(screen.getByTestId('exercise-picker-stub')).toBeInTheDocument()
  })

  it('passes onPick through to the embedded ExercisePicker unchanged', () => {
    useAlternateExercises.mockReturnValue({ data: [], isLoading: false })
    const onPick = vi.fn()
    render(<SubstituteSheet currentExerciseId={null} currentName="Zercher Squat" onPick={onPick} onClose={vi.fn()} />)

    expect(mockExercisePickerProps).toHaveBeenCalledWith(expect.objectContaining({ onPick }))
  })

  it('calls onClose when Cancel is tapped', () => {
    useAlternateExercises.mockReturnValue({ data: [], isLoading: false })
    const onClose = vi.fn()
    render(<SubstituteSheet currentExerciseId={null} currentName="Zercher Squat" onPick={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
