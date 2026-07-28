import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExercisePickerSheet } from './ExercisePickerSheet'
import type { ExerciseListItem } from '../../data/exerciseCatalog'

const { useCommonExercises } = vi.hoisted(() => ({
  useCommonExercises: vi.fn((): { data: ExerciseListItem[] } => ({ data: [] })),
}))

vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../data/exerciseCatalog', () => ({ useExerciseSearch: () => ({ data: [] }) }))
// ExercisePicker now calls these two hooks itself; this test harness has no
// QueryClientProvider, so stub them out too.
vi.mock('../../data/favoriteExercises', () => ({
  useFavoriteExercises: () => ({ items: [], ids: new Set() }),
  useToggleFavorite: () => ({ mutate: vi.fn() }),
}))
vi.mock('../../data/recentExercises', () => ({ useRecentExercises: () => ({ data: [] }) }))
vi.mock('../../data/commonExercises', () => ({ useCommonExercises }))

describe('ExercisePickerSheet', () => {
  it('routes a custom pick to onPick and can be closed', () => {
    const onPick = vi.fn(); const onClose = vi.fn()
    render(<ExercisePickerSheet onPick={onPick} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Custom exercise' }))
    fireEvent.change(screen.getByLabelText('Custom exercise name'), { target: { value: 'Kayak' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))
    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Kayak', kind: 'strength', exerciseType: null })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('passes useCommonExercises data to the picker as Suggested, labeled "Common"', () => {
    useCommonExercises.mockReturnValue({
      data: [{ id: 'ex-fp', name: 'Face Pulls', exerciseType: 'weighted', primaryMuscles: null, equipment: null }],
    })
    render(<ExercisePickerSheet onPick={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Common')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Face Pulls' })).toBeInTheDocument()
  })
})
