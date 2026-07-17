import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { HomePage } from './HomePage'
import type { ActiveWorkoutBundle } from '../../data/queries'
import { fiveThreeOne } from '../../domain'
import { useSessionStore } from '../workout/sessionStore'

const { mockNavigate, useActiveWorkout } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  useActiveWorkout: vi.fn(),
}))

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

const seededBundle: ActiveWorkoutBundle = {
  program: fiveThreeOne,
  days: [],
  programExercises: [],
  exercisesById: {},
  trainingMaxes: { squat: 275, benchPress: 175, barbellDeadlift: 315, overheadPress: 115 },
  cursor: { dayIndex: 0, week: 2, cycle: 6 },
  personalRecords: [],
  workingWeights: {},
  workingWeightValues: {},
}

describe('HomePage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    useActiveWorkout.mockReset()
    useSessionStore.getState().reset()
  })

  it('shows the label, main lifts, and a Start button for a seeded active program', () => {
    useActiveWorkout.mockReturnValue({ data: seededBundle, isLoading: false })

    render(<HomePage />)

    expect(screen.getByText('Cycle 6 · Week 2 · Gym A')).toBeInTheDocument()
    expect(screen.getByText('Squat')).toBeInTheDocument()
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeInTheDocument()
  })

  it('navigates to /programs when "Change program" is tapped on the active state', () => {
    useActiveWorkout.mockReturnValue({ data: seededBundle, isLoading: false })

    render(<HomePage />)

    fireEvent.click(screen.getByRole('button', { name: 'Change program' }))

    expect(mockNavigate).toHaveBeenCalledWith('/programs')
  })

  it('shows an empty state and no Start button when there is no active program', () => {
    useActiveWorkout.mockReturnValue({ data: null, isLoading: false })

    render(<HomePage />)

    expect(screen.getByText('No active program yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start workout' })).not.toBeInTheDocument()
  })

  it('navigates to /programs when "Choose a program" is tapped on the empty state', () => {
    useActiveWorkout.mockReturnValue({ data: null, isLoading: false })

    render(<HomePage />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose a program' }))

    expect(mockNavigate).toHaveBeenCalledWith('/programs')
  })
})
