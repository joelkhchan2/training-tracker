import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ExercisePicker } from './ExercisePicker'

const { useExerciseSearch } = vi.hoisted(() => ({ useExerciseSearch: vi.fn() }))

vi.mock('../../data/exerciseCatalog', () => ({ useExerciseSearch }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))

interface FakeResult { id: string; name: string; exercise_type: string | null }

/** Wires the mocked hook to only return `results` once the picker has searched
 *  the exact `term` — i.e. it exercises the picker's search-on-submit wiring
 *  (the real hook only fires on the committed term, never per keystroke). */
function stubSearch(term: string, results: FakeResult[]) {
  useExerciseSearch.mockImplementation((t: string) => ({ data: t === term ? results : [] }))
}

beforeEach(() => {
  useExerciseSearch.mockReset()
  useExerciseSearch.mockReturnValue({ data: [] })
})

function search(term: string) {
  fireEvent.change(screen.getByLabelText('Search exercises'), { target: { value: term } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}

describe('ExercisePicker', () => {
  it('shows matching catalog results after searching a term', () => {
    stubSearch('squ', [{ id: 'ex-squat', name: 'Squat', exercise_type: 'weighted' }])
    render(<ExercisePicker onPick={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Squat' })).not.toBeInTheDocument()

    search('squ')

    expect(screen.getByRole('button', { name: 'Squat' })).toBeInTheDocument()
  })

  it('calls onPick with the exercise name and kind "strength" for a non-bodyweight catalog row', () => {
    stubSearch('squ', [{ id: 'ex-squat', name: 'Squat', exercise_type: 'weighted' }])
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} />)

    search('squ')
    fireEvent.click(screen.getByRole('button', { name: 'Squat' }))

    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Squat', kind: 'strength' })
  })

  it('calls onPick with kind "bodyweight" for a bodyweight catalog row', () => {
    stubSearch('pul', [{ id: 'ex-pullup', name: 'Pull-up', exercise_type: 'bodyweight' }])
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} />)

    search('pul')
    fireEvent.click(screen.getByRole('button', { name: 'Pull-up' }))

    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Pull-up', kind: 'bodyweight' })
  })

  it('add-custom affordance calls onPick with the typed name and selected kind, without touching the catalog', () => {
    // No supabase mock is wired up at all here — if the picker created a catalog
    // row itself (rather than staying resolution-free) this test would blow up
    // trying to reach a real/undefined Supabase client.
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} />)

    fireEvent.change(screen.getByLabelText('Custom exercise name'), { target: { value: 'Zercher Squat' } })
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'bodyweight' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))

    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Zercher Squat', kind: 'bodyweight' })
  })

  it('defaults the add-custom kind to strength', () => {
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} />)

    fireEvent.change(screen.getByLabelText('Custom exercise name'), { target: { value: 'Sled Push' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))

    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Sled Push', kind: 'strength' })
  })

  it('does not call onPick for add-custom when the name is blank', () => {
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))

    expect(onPick).not.toHaveBeenCalled()
  })
})
