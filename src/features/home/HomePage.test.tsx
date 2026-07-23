import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { HomePage } from './HomePage'
import type { ActiveWorkoutBundle } from '../../data/queries'
import { fiveThreeOne } from '../../domain'
import { getPrescription } from '../../domain/programEngine'
import { useSessionStore } from '../workout/sessionStore'

const { mockNavigate, useActiveWorkout, fetchLastSetsByExercise } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  useActiveWorkout: vi.fn(),
  fetchLastSetsByExercise: vi.fn(),
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

// Real `applyAutofill`/`buildTodayExerciseIdMap` (pure) — only the network call is mocked.
vi.mock('../../data/exerciseHistory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/exerciseHistory')>()
  return { ...actual, fetchLastSetsByExercise }
})

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
    fetchLastSetsByExercise.mockReset()
    useSessionStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('fills a no-weight accessory from last time, leaves the program lift untouched, and disables Start while the fetch is pending', async () => {
    // Gym A's "Pull-ups" accessory is prescribed with no weight; give it an id via
    // today's day so the autofill lookup has something to resolve.
    const bundleWithAccessory = {
      ...seededBundle,
      days: [{ id: 'day-a' }],
      programExercises: [{ program_day_id: 'day-a', exercise_id: 'ex-pullups' }],
      exercisesById: { 'ex-pullups': { name: 'Pull-ups' } },
    } as unknown as ActiveWorkoutBundle
    useActiveWorkout.mockReturnValue({ data: bundleWithAccessory, isLoading: false })

    let resolveFetch!: (value: Record<string, { weight: number | null; reps: number | null }[]>) => void
    fetchLastSetsByExercise.mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve }),
    )

    const spy = vi.spyOn(useSessionStore.getState(), 'startFromPrescription')

    render(<HomePage />)

    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }))

    // Disabled + relabeled while the fetch is in flight.
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeDisabled()

    resolveFetch({ 'ex-pullups': [{ weight: 50, reps: 5 }, { weight: 50, reps: 5 }, { weight: 50, reps: 5 }] })

    await waitFor(() => expect(spy).toHaveBeenCalled())

    expect(fetchLastSetsByExercise).toHaveBeenCalledWith(['ex-pullups'], 'user-1')

    const [startedPrescription] = spy.mock.calls[0]
    const pullUps = startedPrescription.find((ex) => ex.exerciseName === 'Pull-ups')
    expect(pullUps?.sets.map((s) => s.weight)).toEqual([50, 50, 50])

    const withoutAutofill = getPrescription(
      fiveThreeOne,
      seededBundle.cursor,
      seededBundle.trainingMaxes,
      seededBundle.workingWeightValues,
    )
    const expectedSquat = withoutAutofill.find((ex) => ex.exerciseName === 'Squat')
    const startedSquat = startedPrescription.find((ex) => ex.exerciseName === 'Squat')
    expect(startedSquat?.sets.map((s) => s.weight)).toEqual(expectedSquat?.sets.map((s) => s.weight))

    // Button is re-enabled once the async work settles.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start workout' })).not.toBeDisabled())
  })
})
