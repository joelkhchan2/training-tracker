import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProgramsPage } from './ProgramsPage'
import { PRESETS } from '../../domain/presets'
import type { ActiveWorkoutBundle } from '../../data/queries'
import { fiveThreeOne } from '../../domain'

const { mockNavigate, useActiveWorkout, useActivateProgram, mockMutate } = vi.hoisted(() => {
  const mockMutate = vi.fn()
  return {
    mockNavigate: vi.fn(),
    useActiveWorkout: vi.fn(),
    useActivateProgram: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
    mockMutate,
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
vi.mock('../../data/activateProgram', () => ({ useActivateProgram }))

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
    useActiveWorkout.mockReset()
    useActiveWorkout.mockReturnValue({ data: null, isLoading: false })
    useActivateProgram.mockReset()
    useActivateProgram.mockReturnValue({ mutate: mockMutate, isPending: false })
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
    })

    act(() => options.onSuccess())
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('without onUse, "Use this program" on a fixed-scheme preset skips straight to a plain confirm', () => {
    renderProgramsPage()

    fireEvent.click(screen.getByText('StrongLifts 5x5'))
    fireEvent.click(screen.getByRole('button', { name: 'Use this program' }))

    expect(screen.getByRole('dialog', { name: 'Activate program' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const [payload] = mockMutate.mock.calls[0]
    expect(payload).toEqual({
      preset: PRESETS.find(p => p.id === 'strongLifts5x5'),
      trainingMaxes: {},
    })
  })
})
