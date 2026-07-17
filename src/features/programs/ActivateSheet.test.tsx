import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ActivateSheet } from './ActivateSheet'
import { PRESETS } from '../../domain/presets'
import type { PresetMeta } from '../../domain/presets'

const { mockNavigate, useActivateProgram, mockMutate } = vi.hoisted(() => {
  const mockMutate = vi.fn()
  return {
    mockNavigate: vi.fn(),
    useActivateProgram: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
    mockMutate,
  }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../data/activateProgram', () => ({ useActivateProgram }))

const fiveThreeOnePreset = PRESETS.find(p => p.id === 'fiveThreeOne')!
// Fixed-scheme, no-maxes, no-starting-weights preset — used to exercise the plain-confirm path.
const pushPullLegsPreset = PRESETS.find(p => p.id === 'pushPullLegs')!

// A hand-built fixture, distinct from the real linear-progression presets (strongLifts5x5,
// startingStrength, basicBeginner, greyskullLP), so the starting-weights step's behavior is
// pinned independently of any one preset's exact lift list.
const lpPreset: PresetMeta = {
  id: 'lp-fixture',
  name: 'LP Fixture',
  description: 'Fixture preset for the starting-weights step.',
  discipline: 'strength',
  daysPerWeek: 1,
  requiresTrainingMaxes: false,
  tmKeys: [],
  requiresStartingWeights: true,
  startingWeightLifts: [
    { exerciseName: 'Squat', label: 'Squat' },
    { exerciseName: 'Bench Press', label: 'Bench Press' },
  ],
  program: {
    name: 'LP Fixture',
    discipline: 'strength',
    days: [
      {
        name: 'Day A',
        exercises: [
          { exerciseName: 'Squat', order: 0, scheme: { type: 'linear', sets: [{ reps: 5 }], progression: { increment: 5, deloadPercent: 0.1, failsBeforeDeload: 3 } } },
          { exerciseName: 'Bench Press', order: 1, scheme: { type: 'linear', sets: [{ reps: 5 }], progression: { increment: 2.5, deloadPercent: 0.1, failsBeforeDeload: 3 } } },
        ],
      },
    ],
  },
}

function renderSheet(props: Partial<Parameters<typeof ActivateSheet>[0]> = {}) {
  const onClose = props.onClose ?? vi.fn()
  return render(
    <MemoryRouter initialEntries={['/programs']}>
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route
          path="/programs"
          element={<ActivateSheet preset={fiveThreeOnePreset} onClose={onClose} {...props} />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockNavigate.mockReset()
  mockMutate.mockReset()
  useActivateProgram.mockReset()
  useActivateProgram.mockReturnValue({ mutate: mockMutate, isPending: false })
})

describe('ActivateSheet', () => {
  it('shows a maxes field per tmKey, prefilled from existing training maxes, for a percentage preset', () => {
    renderSheet({
      preset: fiveThreeOnePreset,
      existingTrainingMaxes: { squat: 225, benchPress: 185, barbellDeadlift: 315, overheadPress: 115 },
    })

    expect(screen.getByLabelText('Squat')).toHaveValue('225')
    expect(screen.getByLabelText('Bench Press')).toHaveValue('185')
    expect(screen.getByLabelText('Deadlift')).toHaveValue('315')
    expect(screen.getByLabelText('Overhead Press')).toHaveValue('115')
  })

  it('calls the activate mutation with the entered maxes and navigates home on success', () => {
    renderSheet({ preset: fiveThreeOnePreset, existingTrainingMaxes: {} })

    fireEvent.change(screen.getByLabelText('Squat'), { target: { value: '225' } })
    fireEvent.change(screen.getByLabelText('Bench Press'), { target: { value: '185' } })
    fireEvent.change(screen.getByLabelText('Deadlift'), { target: { value: '315' } })
    fireEvent.change(screen.getByLabelText('Overhead Press'), { target: { value: '115' } })

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const [payload, options] = mockMutate.mock.calls[0]
    expect(payload).toEqual({
      preset: fiveThreeOnePreset,
      trainingMaxes: { squat: 225, benchPress: 185, barbellDeadlift: 315, overheadPress: 115 },
      startingWeights: {},
    })

    act(() => options.onSuccess())
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('disables Activate until every training max is greater than zero', () => {
    renderSheet({ preset: fiveThreeOnePreset, existingTrainingMaxes: {} })

    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Squat'), { target: { value: '225' } })
    fireEvent.change(screen.getByLabelText('Bench Press'), { target: { value: '185' } })
    fireEvent.change(screen.getByLabelText('Deadlift'), { target: { value: '315' } })
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Overhead Press'), { target: { value: '115' } })
    expect(screen.getByRole('button', { name: 'Activate' })).not.toBeDisabled()
  })

  it('skips the maxes form for a fixed-scheme preset and activates with no training maxes', () => {
    renderSheet({ preset: pushPullLegsPreset })

    expect(screen.getByText(`Activate ${pushPullLegsPreset.name}?`)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const [payload] = mockMutate.mock.calls[0]
    expect(payload).toEqual({ preset: pushPullLegsPreset, trainingMaxes: {}, startingWeights: {} })
  })

  it('shows a starting-weight field per startingWeightLifts entry for a linear-progression preset, and none for a non-LP preset', () => {
    renderSheet({ preset: lpPreset })

    expect(screen.getByText('Squat')).toBeInTheDocument()
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    expect(screen.getByLabelText('Squat')).toHaveValue('0')
    expect(screen.getByLabelText('Bench Press')).toHaveValue('0')
  })

  it('does not show the starting-weights form for a non-LP preset', () => {
    renderSheet({ preset: pushPullLegsPreset })
    expect(screen.queryByText('Squat')).not.toBeInTheDocument()
    expect(screen.queryByText('Bench Press')).not.toBeInTheDocument()
  })

  it('calls the activate mutation with the entered starting weights for an LP preset', () => {
    renderSheet({ preset: lpPreset })

    fireEvent.change(screen.getByLabelText('Squat'), { target: { value: '135' } })
    fireEvent.change(screen.getByLabelText('Bench Press'), { target: { value: '95' } })

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const [payload] = mockMutate.mock.calls[0]
    expect(payload).toEqual({
      preset: lpPreset,
      trainingMaxes: {},
      startingWeights: { Squat: 135, 'Bench Press': 95 },
    })
  })

  it('disables Activate until every starting weight is greater than zero, for an LP preset', () => {
    renderSheet({ preset: lpPreset })

    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Squat'), { target: { value: '135' } })
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Bench Press'), { target: { value: '95' } })
    expect(screen.getByRole('button', { name: 'Activate' })).not.toBeDisabled()
  })

  it('shows an error and keeps the entered maxes when the mutation fails', () => {
    renderSheet({ preset: fiveThreeOnePreset, existingTrainingMaxes: {} })

    fireEvent.change(screen.getByLabelText('Squat'), { target: { value: '225' } })
    fireEvent.change(screen.getByLabelText('Bench Press'), { target: { value: '185' } })
    fireEvent.change(screen.getByLabelText('Deadlift'), { target: { value: '315' } })
    fireEvent.change(screen.getByLabelText('Overhead Press'), { target: { value: '115' } })

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))

    const [, options] = mockMutate.mock.calls[0]
    act(() => options.onError(new Error('network down')))

    expect(screen.getByRole('alert')).toHaveTextContent('network down')
    expect(screen.getByLabelText('Squat')).toHaveValue('225')
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
