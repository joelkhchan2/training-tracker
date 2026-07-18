import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { BuilderPage } from './BuilderPage'
import type { PickedExercise } from './ExercisePicker'
import type { ProgramDraft } from '../../domain/programDraft'

const { mockNavigate, useSaveProgram, useUpdateProgram, mockSaveMutate, mockUpdateMutate } = vi.hoisted(() => {
  const mockSaveMutate = vi.fn()
  const mockUpdateMutate = vi.fn()
  return {
    mockNavigate: vi.fn(),
    mockSaveMutate,
    mockUpdateMutate,
    useSaveProgram: vi.fn(() => ({ mutate: mockSaveMutate, isPending: false })),
    useUpdateProgram: vi.fn(() => ({ mutate: mockUpdateMutate, isPending: false })),
  }
})

const { getSupabase, __setSupabase } = vi.hoisted(() => {
  let current: unknown
  return {
    getSupabase: () => current,
    __setSupabase: (client: unknown) => {
      current = client
    },
  }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../data/saveProgram', () => ({ useSaveProgram, useUpdateProgram }))
vi.mock('../../data/supabase', () => ({ getSupabase }))

// The real ExercisePicker searches a live catalog; the builder only cares that
// it eventually calls `onPick({ exerciseName, kind })`, so it's replaced here
// with two buttons that pick a fixed strength and bodyweight exercise.
vi.mock('./ExercisePicker', () => ({
  ExercisePicker: ({ onPick }: { onPick: (picked: PickedExercise) => void }) => (
    <div>
      <button type="button" onClick={() => onPick({ exerciseName: 'Bench Press', kind: 'strength' })}>
        Pick Bench Press
      </button>
      <button type="button" onClick={() => onPick({ exerciseName: 'Push-up', kind: 'bodyweight' })}>
        Pick Push-up
      </button>
    </div>
  ),
}))

// A minimal chainable fake mirroring the subset of the supabase-js query builder
// `fetchProgramRowsForEdit` touches (select/eq/in/order + `.single()` + the
// thenable terminal), matching the pattern used in programLibrary.test.ts.
function fakeTable(rows: unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    single: () => Promise.resolve({ data: (rows[0] as unknown) ?? null, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  }
  return builder
}

function makeSupabase(tables: Record<string, unknown[]>) {
  return { from: (table: string) => fakeTable(tables[table] ?? []) }
}

function renderNew() {
  return render(
    <MemoryRouter initialEntries={['/programs/new']}>
      <Routes>
        <Route path="/programs" element={<p>Programs Library</p>} />
        <Route path="/programs/new" element={<BuilderPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderEdit(programId: string) {
  return render(
    <MemoryRouter initialEntries={[`/programs/${programId}/edit`]}>
      <Routes>
        <Route path="/programs" element={<p>Programs Library</p>} />
        <Route path="/programs/:id/edit" element={<BuilderPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const EDIT_PROGRAM = {
  id: 'prog-1',
  user_id: 'user-1',
  name: 'My Program',
  description: 'A great program',
  discipline: 'strength',
  progression_rule: null,
  is_public: true,
  created_at: '2026-01-01T00:00:00Z',
}
const EDIT_DAYS = [{ id: 'day-1', program_id: 'prog-1', name: 'Day A', order_index: 0 }]
const EDIT_EXERCISES = [
  {
    id: 'pe-1',
    program_day_id: 'day-1',
    exercise_id: 'ex-bench',
    role_key: null,
    order_index: 0,
    scheme: { type: 'fixed', sets: [{ reps: 5, weight: 135 }, { reps: 5, weight: 135 }] },
    exercise_name: 'Bench Press',
    exercise_type: 'weighted',
  },
  {
    id: 'pe-2',
    program_day_id: 'day-1',
    exercise_id: 'ex-pushup',
    role_key: null,
    order_index: 1,
    scheme: { type: 'fixed', sets: [{ reps: 12 }] },
    exercise_name: 'Push-up',
    exercise_type: 'bodyweight',
  },
]

beforeEach(() => {
  mockNavigate.mockReset()
  mockSaveMutate.mockReset()
  mockUpdateMutate.mockReset()
  useSaveProgram.mockReset()
  useSaveProgram.mockReturnValue({ mutate: mockSaveMutate, isPending: false })
  useUpdateProgram.mockReset()
  useUpdateProgram.mockReturnValue({ mutate: mockUpdateMutate, isPending: false })
  __setSupabase(makeSupabase({ programs: [EDIT_PROGRAM], program_days: EDIT_DAYS, program_exercises: EDIT_EXERCISES }))
})

describe('BuilderPage — /programs/new', () => {
  it('adding a day and picking exercises grows the form, showing weight only for strength exercises', () => {
    renderNew()

    fireEvent.click(screen.getByRole('button', { name: 'Add day' }))
    const day = screen.getByTestId('day-0')

    fireEvent.click(within(day).getByRole('button', { name: 'Add exercise' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick Bench Press' }))

    const benchExercise = screen.getByTestId('exercise-0-0')
    expect(within(benchExercise).getByText('Bench Press')).toBeInTheDocument()
    expect(within(benchExercise).getByLabelText('Reps')).toBeInTheDocument()
    expect(within(benchExercise).getByLabelText('Weight')).toBeInTheDocument()

    fireEvent.click(within(day).getByRole('button', { name: 'Add exercise' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick Push-up' }))

    const pushupExercise = screen.getByTestId('exercise-0-1')
    expect(within(pushupExercise).getByText('Push-up')).toBeInTheDocument()
    expect(within(pushupExercise).getByLabelText('Reps')).toBeInTheDocument()
    expect(within(pushupExercise).queryByLabelText('Weight')).not.toBeInTheDocument()
  })

  it('adds and removes sets within an exercise', () => {
    renderNew()

    fireEvent.click(screen.getByRole('button', { name: 'Add day' }))
    const day = screen.getByTestId('day-0')
    fireEvent.click(within(day).getByRole('button', { name: 'Add exercise' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick Bench Press' }))

    const exercise = screen.getByTestId('exercise-0-0')
    expect(within(exercise).getAllByLabelText('Reps')).toHaveLength(1)

    fireEvent.click(within(exercise).getByRole('button', { name: 'Add set' }))
    expect(within(exercise).getAllByLabelText('Reps')).toHaveLength(2)

    fireEvent.click(within(exercise).getByRole('button', { name: 'Remove set 2' }))
    expect(within(exercise).getAllByLabelText('Reps')).toHaveLength(1)
  })

  it('blocks Save and shows inline messages for an invalid draft, without calling the mutation', () => {
    renderNew()

    fireEvent.click(screen.getByRole('button', { name: 'Save program' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Program name is required.')
    expect(screen.getByRole('alert')).toHaveTextContent('Program must have at least one day.')
    expect(mockSaveMutate).not.toHaveBeenCalled()
  })

  it('calls useSaveProgram with the built draft (incl. isPublic) for a valid draft, and navigates to /programs on success', () => {
    renderNew()

    fireEvent.change(screen.getByLabelText('Program name'), { target: { value: 'My New Program' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Custom plan' } })
    fireEvent.click(screen.getByLabelText('Public program'))

    fireEvent.click(screen.getByRole('button', { name: 'Add day' }))
    const day = screen.getByTestId('day-0')
    fireEvent.change(within(day).getByLabelText('Day name'), { target: { value: 'Upper Body' } })

    fireEvent.click(within(day).getByRole('button', { name: 'Add exercise' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick Bench Press' }))

    const exercise = screen.getByTestId('exercise-0-0')
    fireEvent.change(within(exercise).getByLabelText('Reps'), { target: { value: '8' } })
    fireEvent.change(within(exercise).getByLabelText('Weight'), { target: { value: '145' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save program' }))

    expect(mockSaveMutate).toHaveBeenCalledTimes(1)
    const [payload, options] = mockSaveMutate.mock.calls[0]
    const expectedDraft: ProgramDraft = {
      name: 'My New Program',
      description: 'Custom plan',
      isPublic: true,
      days: [
        {
          name: 'Upper Body',
          exercises: [{ exerciseName: 'Bench Press', kind: 'strength', sets: [{ reps: 8, weight: 145 }] }],
        },
      ],
    }
    expect(payload).toEqual({ draft: expectedDraft })

    act(() => options.onSuccess())
    expect(mockNavigate).toHaveBeenCalledWith('/programs')
  })

  it('preserves the entered draft and shows an error when the save mutation fails', () => {
    renderNew()

    fireEvent.change(screen.getByLabelText('Program name'), { target: { value: 'My New Program' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add day' }))
    const day = screen.getByTestId('day-0')
    fireEvent.click(within(day).getByRole('button', { name: 'Add exercise' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick Bench Press' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save program' }))

    const [, options] = mockSaveMutate.mock.calls[0]
    act(() => options.onError(new Error('network down')))

    expect(screen.getByRole('alert')).toHaveTextContent('network down')
    expect(screen.getByLabelText('Program name')).toHaveValue('My New Program')
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

describe('BuilderPage — /programs/:id/edit', () => {
  it('seeds the form from the fetched program tree with correct kinds, sets, and weights', async () => {
    renderEdit('prog-1')

    await waitFor(() => expect(screen.getByLabelText('Program name')).toHaveValue('My Program'))
    expect(screen.getByLabelText('Description')).toHaveValue('A great program')
    expect(screen.getByLabelText('Public program')).toBeChecked()
    expect(screen.getByLabelText('Day name')).toHaveValue('Day A')

    const benchExercise = screen.getByTestId('exercise-0-0')
    expect(within(benchExercise).getByText('Bench Press')).toBeInTheDocument()
    expect(within(benchExercise).getAllByLabelText('Reps')).toHaveLength(2)
    expect(within(benchExercise).getAllByLabelText('Weight').map(el => (el as HTMLInputElement).value)).toEqual(['135', '135'])

    const pushupExercise = screen.getByTestId('exercise-0-1')
    expect(within(pushupExercise).getByText('Push-up')).toBeInTheDocument()
    expect(within(pushupExercise).getByLabelText('Reps')).toHaveValue('12')
    expect(within(pushupExercise).queryByLabelText('Weight')).not.toBeInTheDocument()
  })

  it('calls useUpdateProgram with { programId, draft } on Save', async () => {
    renderEdit('prog-1')

    await waitFor(() => expect(screen.getByLabelText('Program name')).toHaveValue('My Program'))

    fireEvent.click(screen.getByRole('button', { name: 'Save program' }))

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1)
    const [payload, options] = mockUpdateMutate.mock.calls[0]
    expect(payload.programId).toBe('prog-1')
    expect(payload.draft.name).toBe('My Program')
    expect(payload.draft.days).toHaveLength(1)
    expect(payload.draft.days[0].exercises).toHaveLength(2)

    act(() => options.onSuccess())
    expect(mockNavigate).toHaveBeenCalledWith('/programs')
  })

  it('preserves the seeded draft and shows an error when the update mutation fails', async () => {
    renderEdit('prog-1')

    await waitFor(() => expect(screen.getByLabelText('Program name')).toHaveValue('My Program'))

    fireEvent.click(screen.getByRole('button', { name: 'Save program' }))

    const [, options] = mockUpdateMutate.mock.calls[0]
    act(() => options.onError(new Error('update failed')))

    expect(screen.getByRole('alert')).toHaveTextContent('update failed')
    expect(screen.getByLabelText('Program name')).toHaveValue('My Program')
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
