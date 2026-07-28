import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ExercisePicker } from './ExercisePicker'
import type { ExerciseListItem } from '../../data/exerciseCatalog'

const { useExerciseSearch } = vi.hoisted(() => ({ useExerciseSearch: vi.fn() }))
const { useFavoriteExercises, useToggleFavorite, mockToggleMutate } = vi.hoisted(() => {
  const mockToggleMutate = vi.fn()
  return { useFavoriteExercises: vi.fn(), useToggleFavorite: vi.fn(() => ({ mutate: mockToggleMutate })), mockToggleMutate }
})
const { useRecentExercises } = vi.hoisted(() => ({ useRecentExercises: vi.fn() }))

vi.mock('../../data/exerciseCatalog', () => ({ useExerciseSearch }))
vi.mock('../../data/favoriteExercises', () => ({ useFavoriteExercises, useToggleFavorite }))
vi.mock('../../data/recentExercises', () => ({ useRecentExercises }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))

const squat: ExerciseListItem = { id: 'ex-squat', name: 'Squat', exerciseType: 'weighted', primaryMuscles: null, equipment: null }
const pullup: ExerciseListItem = { id: 'ex-pullup', name: 'Pull-up', exerciseType: 'bodyweight', primaryMuscles: null, equipment: null }
const squatWithSubtitle: ExerciseListItem = { id: 'ex-squat', name: 'Squat', exerciseType: 'weighted', primaryMuscles: 'quadriceps, glutes', equipment: 'barbell' }

/** Wires the mocked hook to only return `results` once the picker has searched
 *  the exact `term` — i.e. it exercises the picker's search-on-submit wiring
 *  (the real hook only fires on the committed term, never per keystroke). */
function stubSearch(term: string, results: ExerciseListItem[]) {
  useExerciseSearch.mockImplementation((t: string) => ({ data: t === term ? results : [] }))
}

beforeEach(() => {
  useExerciseSearch.mockReset()
  useExerciseSearch.mockReturnValue({ data: [] })
  useFavoriteExercises.mockReset()
  useFavoriteExercises.mockReturnValue({ items: [], ids: new Set() })
  useRecentExercises.mockReset()
  useRecentExercises.mockReturnValue({ data: [] })
  mockToggleMutate.mockReset()
})

function search(term: string) {
  fireEvent.change(screen.getByLabelText('Search exercises'), { target: { value: term } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}

describe('ExercisePicker', () => {
  it('shows matching catalog results after searching a term', () => {
    stubSearch('squ', [squat])
    render(<ExercisePicker onPick={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Squat' })).not.toBeInTheDocument()

    search('squ')

    expect(screen.getByRole('button', { name: 'Squat' })).toBeInTheDocument()
  })

  it('calls onPick with the exercise name, kind "strength", and the result id as exerciseId for a non-bodyweight catalog row', () => {
    stubSearch('squ', [squat])
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} />)

    search('squ')
    fireEvent.click(screen.getByRole('button', { name: 'Squat' }))

    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Squat', kind: 'strength', exerciseId: 'ex-squat' })
  })

  it('calls onPick with kind "bodyweight" and the result id as exerciseId for a bodyweight catalog row', () => {
    stubSearch('pul', [pullup])
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} />)

    search('pul')
    fireEvent.click(screen.getByRole('button', { name: 'Pull-up' }))

    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Pull-up', kind: 'bodyweight', exerciseId: 'ex-pullup' })
  })

  it('hides the custom-exercise form until "+ Custom exercise" is tapped', () => {
    render(<ExercisePicker onPick={vi.fn()} />)

    expect(screen.queryByLabelText('Custom exercise name')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Custom exercise' }))

    expect(screen.getByLabelText('Custom exercise name')).toBeInTheDocument()
  })

  it('add-custom affordance calls onPick with the typed name and selected kind, without touching the catalog', () => {
    // No supabase mock is wired up at all here — if the picker created a catalog
    // row itself (rather than staying resolution-free) this test would blow up
    // trying to reach a real/undefined Supabase client.
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} />)

    fireEvent.click(screen.getByRole('button', { name: '+ Custom exercise' }))
    fireEvent.change(screen.getByLabelText('Custom exercise name'), { target: { value: 'Zercher Squat' } })
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'bodyweight' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))

    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Zercher Squat', kind: 'bodyweight' })
  })

  it('defaults the add-custom kind to strength', () => {
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} />)

    fireEvent.click(screen.getByRole('button', { name: '+ Custom exercise' }))
    fireEvent.change(screen.getByLabelText('Custom exercise name'), { target: { value: 'Sled Push' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))

    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Sled Push', kind: 'strength' })
  })

  it('does not call onPick for add-custom when the name is blank', () => {
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} />)

    fireEvent.click(screen.getByRole('button', { name: '+ Custom exercise' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }))

    expect(onPick).not.toHaveBeenCalled()
  })

  it('renders Suggested, then Favorites, then Recent, in that order, when the term is empty', () => {
    useFavoriteExercises.mockReturnValue({ items: [squat], ids: new Set(['ex-squat']) })
    useRecentExercises.mockReturnValue({ data: [pullup] })
    render(<ExercisePicker onPick={vi.fn()} suggested={[pullup]} suggestedLabel="Common" />)

    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Common', 'Favorites', 'Recent'])
  })

  it('omits a section entirely when it has zero items (no heading, no placeholder)', () => {
    useFavoriteExercises.mockReturnValue({ items: [squat], ids: new Set(['ex-squat']) })
    // suggested not passed, Recent stays empty
    render(<ExercisePicker onPick={vi.fn()} />)

    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Favorites'])
  })

  it('shows just search + custom (no headings) when suggested/Favorites/Recent are all empty', () => {
    render(<ExercisePicker onPick={vi.fn()} />)

    expect(screen.queryAllByRole('heading')).toHaveLength(0)
    expect(screen.getByLabelText('Search exercises')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Custom exercise' })).toBeInTheDocument()
  })

  it('every row shows its formatted subtitle and a star toggle', () => {
    useFavoriteExercises.mockReturnValue({ items: [squatWithSubtitle], ids: new Set(['ex-squat']) })
    render(<ExercisePicker onPick={vi.fn()} />)

    expect(screen.getByText('quadriceps · barbell')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unfavorite Squat' })).toBeInTheDocument()
  })

  it('tapping a favorited row\'s star calls mutate({ item, isFavorited: true }) and does not call onPick', () => {
    useFavoriteExercises.mockReturnValue({ items: [squatWithSubtitle], ids: new Set(['ex-squat']) })
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} />)

    fireEvent.click(screen.getByRole('button', { name: 'Unfavorite Squat' }))

    expect(mockToggleMutate).toHaveBeenCalledWith({ item: squatWithSubtitle, isFavorited: true })
    expect(onPick).not.toHaveBeenCalled()
  })

  it('tapping an unfavorited row\'s star calls mutate({ item, isFavorited: false })', () => {
    useRecentExercises.mockReturnValue({ data: [pullup] })
    render(<ExercisePicker onPick={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Favorite Pull-up' }))

    expect(mockToggleMutate).toHaveBeenCalledWith({ item: pullup, isFavorited: false })
  })

  it('tapping the row itself (not the star) still calls onPick with the existing shape', () => {
    useFavoriteExercises.mockReturnValue({ items: [squatWithSubtitle], ids: new Set(['ex-squat']) })
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} />)

    fireEvent.click(screen.getByRole('button', { name: /^Squat/ }))

    expect(onPick).toHaveBeenCalledWith({ exerciseName: 'Squat', kind: 'strength', exerciseId: 'ex-squat' })
  })
})
