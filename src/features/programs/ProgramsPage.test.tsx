import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ProgramsPage } from './ProgramsPage'
import { PRESETS, pushPullLegs } from '../../domain/presets'
import type { ActiveWorkoutBundle } from '../../data/queries'
import type { LibraryProgram, PublicProgramsBundle } from '../../data/programLibrary'
import { fiveThreeOne } from '../../domain'

const {
  mockNavigate,
  useActiveWorkout,
  useActivateProgram,
  mockMutate,
  usePublicPrograms,
  useDeleteProgram,
  mockDeleteMutate,
  useActivateDbProgram,
  mockActivateDbMutate,
} = vi.hoisted(() => {
  const mockMutate = vi.fn()
  const mockDeleteMutate = vi.fn()
  const mockActivateDbMutate = vi.fn()
  return {
    mockNavigate: vi.fn(),
    useActiveWorkout: vi.fn(),
    useActivateProgram: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
    mockMutate,
    usePublicPrograms: vi.fn(),
    useDeleteProgram: vi.fn(() => ({ mutate: mockDeleteMutate, isPending: false })),
    mockDeleteMutate,
    useActivateDbProgram: vi.fn(() => ({ mutate: mockActivateDbMutate, isPending: false })),
    mockActivateDbMutate,
  }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../lib/useAuth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'user-1' },
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock('../../data/queries', () => ({ useActiveWorkout }))
vi.mock('../../data/activateProgram', () => ({ useActivateProgram, useActivateDbProgram }))
vi.mock('../../data/programLibrary', () => ({ usePublicPrograms }))
vi.mock('../../data/saveProgram', () => ({ useDeleteProgram }))

const ownProgram: LibraryProgram = {
  id: 'own-1',
  name: 'My Custom Push Day',
  description: 'A custom program I authored.',
  discipline: 'strength',
  daysPerWeek: pushPullLegs.days.length,
  isOwn: true,
  program: pushPullLegs,
}

const communityProgram: LibraryProgram = {
  id: 'community-1',
  name: 'Someone Else\'s Program',
  description: 'A public program authored by another user.',
  discipline: 'strength',
  daysPerWeek: pushPullLegs.days.length,
  isOwn: false,
  program: pushPullLegs,
}

const emptyLibrary: PublicProgramsBundle = { own: [], community: [] }

function renderProgramsPage(props: Parameters<typeof ProgramsPage>[0] = {}) {
  return render(
    <MemoryRouter initialEntries={['/programs']}>
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route path="/programs" element={<ProgramsPage {...props} />} />
      </Routes>
    </MemoryRouter>,
  )
}

const bundleWithActiveProgram: ActiveWorkoutBundle = {
  program: fiveThreeOne,
  days: [],
  programExercises: [],
  exercisesById: {},
  trainingMaxes: {},
  cursor: { dayIndex: 0, week: 1, cycle: 1 },
  personalRecords: [],
  workingWeights: {},
  workingWeightValues: {},
}

describe('ProgramsPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockMutate.mockReset()
    mockDeleteMutate.mockReset()
    mockActivateDbMutate.mockReset()
    useActiveWorkout.mockReset()
    useActiveWorkout.mockReturnValue({ data: null, isLoading: false })
    useActivateProgram.mockReset()
    useActivateProgram.mockReturnValue({ mutate: mockMutate, isPending: false })
    useActivateDbProgram.mockReset()
    useActivateDbProgram.mockReturnValue({ mutate: mockActivateDbMutate, isPending: false })
    useDeleteProgram.mockReset()
    useDeleteProgram.mockReturnValue({ mutate: mockDeleteMutate, isPending: false })
    usePublicPrograms.mockReset()
    usePublicPrograms.mockReturnValue({ data: emptyLibrary, isLoading: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists all presets', () => {
    renderProgramsPage()

    for (const preset of PRESETS) {
      expect(screen.getByText(preset.name)).toBeInTheDocument()
    }
  })

  it('shows a preview with the days and exercises of the selected preset', () => {
    renderProgramsPage()

    fireEvent.click(screen.getByText('Push/Pull/Legs'))

    const pushPullLegs = PRESETS.find(p => p.id === 'pushPullLegs')!
    for (const day of pushPullLegs.program.days) {
      expect(screen.getByText(day.name)).toBeInTheDocument()
      for (const ex of day.exercises) {
        expect(screen.getByText(ex.exerciseName)).toBeInTheDocument()
      }
    }
    expect(screen.getByRole('button', { name: 'Use this program' })).toBeInTheDocument()
  })

  it('shows a Current badge on the active program\'s card', () => {
    useActiveWorkout.mockReturnValue({ data: bundleWithActiveProgram, isLoading: false })

    renderProgramsPage()

    const fiveThreeOneCard = screen.getByText('5/3/1').closest('[role="button"]')
    expect(fiveThreeOneCard).not.toBeNull()
    expect(within(fiveThreeOneCard as HTMLElement).getByText('Current')).toBeInTheDocument()

    const strongLiftsCard = screen.getByText('StrongLifts 5x5').closest('[role="button"]')
    expect(within(strongLiftsCard as HTMLElement).queryByText('Current')).not.toBeInTheDocument()
  })

  it('fires onUse with the selected preset when "Use this program" is tapped', () => {
    const onUse = vi.fn()
    renderProgramsPage({ onUse })

    fireEvent.click(screen.getByText('Beginner Linear Progression'))
    fireEvent.click(screen.getByRole('button', { name: 'Use this program' }))

    const beginnerLinear = PRESETS.find(p => p.id === 'beginnerLinear')!
    expect(onUse).toHaveBeenCalledWith(beginnerLinear)
  })

  it('without onUse, "Use this program" on a percentage preset opens the maxes form prefilled from existing maxes', () => {
    useActiveWorkout.mockReturnValue({
      data: { ...bundleWithActiveProgram, trainingMaxes: { squat: 225, benchPress: 185, barbellDeadlift: 315, overheadPress: 115 } },
      isLoading: false,
    })

    renderProgramsPage()

    fireEvent.click(screen.getByText('5/3/1'))
    fireEvent.click(screen.getByRole('button', { name: 'Use this program' }))

    expect(screen.getByRole('dialog', { name: 'Activate program' })).toBeInTheDocument()
    expect(screen.getByLabelText('Squat')).toHaveValue('225')
    expect(screen.getByLabelText('Bench Press')).toHaveValue('185')
    expect(screen.getByLabelText('Deadlift')).toHaveValue('315')
    expect(screen.getByLabelText('Overhead Press')).toHaveValue('115')

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const [payload, options] = mockMutate.mock.calls[0]
    expect(payload).toEqual({
      preset: PRESETS.find(p => p.id === 'fiveThreeOne'),
      trainingMaxes: { squat: 225, benchPress: 185, barbellDeadlift: 315, overheadPress: 115 },
      startingWeights: {},
    })

    act(() => options.onSuccess())
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('without onUse, "Use this program" on a fixed-scheme preset skips straight to a plain confirm', () => {
    renderProgramsPage()

    fireEvent.click(screen.getByText('Push/Pull/Legs'))
    fireEvent.click(screen.getByRole('button', { name: 'Use this program' }))

    expect(screen.getByRole('dialog', { name: 'Activate program' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const [payload] = mockMutate.mock.calls[0]
    expect(payload).toEqual({
      preset: PRESETS.find(p => p.id === 'pushPullLegs'),
      trainingMaxes: {},
      startingWeights: {},
    })
  })

  it('routes "Create program" to /programs/new', () => {
    renderProgramsPage()

    fireEvent.click(screen.getByRole('button', { name: 'Create program' }))

    expect(mockNavigate).toHaveBeenCalledWith('/programs/new')
  })

  it('renders "My programs" and "Shared by the community" sections from usePublicPrograms', () => {
    usePublicPrograms.mockReturnValue({ data: { own: [ownProgram], community: [communityProgram] }, isLoading: false })

    renderProgramsPage()

    expect(screen.getByText('My programs')).toBeInTheDocument()
    expect(screen.getByText('Shared by the community')).toBeInTheDocument()
    expect(screen.getByText(ownProgram.name)).toBeInTheDocument()
    expect(screen.getByText(communityProgram.name)).toBeInTheDocument()

    const communityCard = screen.getByText(communityProgram.name).closest('[role="button"]')
    expect(within(communityCard as HTMLElement).getByText('Shared')).toBeInTheDocument()

    const ownCard = screen.getByText(ownProgram.name).closest('[role="button"]')
    expect(within(ownCard as HTMLElement).queryByText('Shared')).not.toBeInTheDocument()
  })

  it('shows Edit and Delete on "My programs" cards, and Delete (behind a confirm) calls useDeleteProgram', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    usePublicPrograms.mockReturnValue({ data: { own: [ownProgram], community: [] }, isLoading: false })

    renderProgramsPage()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(mockNavigate).toHaveBeenCalledWith(`/programs/${ownProgram.id}/edit`)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(window.confirm).toHaveBeenCalled()
    expect(mockDeleteMutate).toHaveBeenCalledWith({ programId: ownProgram.id })
  })

  it('does not call useDeleteProgram when the delete confirm is dismissed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    usePublicPrograms.mockReturnValue({ data: { own: [ownProgram], community: [] }, isLoading: false })

    renderProgramsPage()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(mockDeleteMutate).not.toHaveBeenCalled()
  })

  it('community cards have no Edit/Delete actions', () => {
    usePublicPrograms.mockReturnValue({ data: { own: [], community: [communityProgram] }, isLoading: false })

    renderProgramsPage()

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('selecting a preset still opens the preset preview -> ActivateSheet path, not the DB activation', () => {
    usePublicPrograms.mockReturnValue({ data: { own: [ownProgram], community: [] }, isLoading: false })

    renderProgramsPage()

    fireEvent.click(screen.getByText('Push/Pull/Legs'))
    fireEvent.click(screen.getByRole('button', { name: 'Use this program' }))

    expect(screen.getByRole('dialog', { name: 'Activate program' })).toBeInTheDocument()
    expect(mockActivateDbMutate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(mockMutate).toHaveBeenCalledTimes(1)
    expect(mockActivateDbMutate).not.toHaveBeenCalled()
  })

  it('selecting an own DB program previews it and routes "Use this program" to useActivateDbProgram, not ActivateSheet', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    usePublicPrograms.mockReturnValue({ data: { own: [ownProgram], community: [] }, isLoading: false })

    renderProgramsPage()

    fireEvent.click(screen.getByText(ownProgram.name))

    for (const day of ownProgram.program.days) {
      expect(screen.getByText(day.name)).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: 'Use this program' }))

    expect(window.confirm).toHaveBeenCalled()
    expect(mockActivateDbMutate).toHaveBeenCalledWith(
      { programId: ownProgram.id },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
    expect(screen.queryByRole('dialog', { name: 'Activate program' })).not.toBeInTheDocument()

    const [, options] = mockActivateDbMutate.mock.calls[0]
    act(() => options.onSuccess())
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('selecting a community DB program also routes "Use this program" to useActivateDbProgram, not ActivateSheet', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    usePublicPrograms.mockReturnValue({ data: { own: [], community: [communityProgram] }, isLoading: false })

    renderProgramsPage()

    fireEvent.click(screen.getByText(communityProgram.name))
    fireEvent.click(screen.getByRole('button', { name: 'Use this program' }))

    expect(mockActivateDbMutate).toHaveBeenCalledWith(
      { programId: communityProgram.id },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
    expect(screen.queryByRole('dialog', { name: 'Activate program' })).not.toBeInTheDocument()
  })

  it('shows Edit in the preview only when the DB program is owned', () => {
    usePublicPrograms.mockReturnValue({ data: { own: [ownProgram], community: [communityProgram] }, isLoading: false })

    renderProgramsPage()

    fireEvent.click(screen.getByText(ownProgram.name))
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    fireEvent.click(screen.getByText(communityProgram.name))
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })
})
