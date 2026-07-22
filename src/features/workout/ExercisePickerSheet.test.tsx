import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExercisePickerSheet } from './ExercisePickerSheet'

vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../data/exerciseCatalog', () => ({ useExerciseSearch: () => ({ data: [] }) }))

describe('ExercisePickerSheet', () => {
  it('routes a custom pick to onPick and can be closed', () => {
    const onPick = vi.fn(); const onClose = vi.fn()
    render(<ExercisePickerSheet onPick={onPick} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Custom exercise name'), { target: { value: 'Kayak' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))
    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Kayak', kind: 'strength' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
