import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { HomePage } from './HomePage'
import { formatSetsHint } from './formatSetsHint'
import type { ActiveWorkoutBundle } from '../../data/queries'
import { fiveThreeOne } from '../../domain'
import { getPrescription } from '../../domain/programEngine'
import { useSessionStore } from '../workout/sessionStore'

const { mockNavigate, useActiveWorkout, fetchLastSetsByExercise } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  useActiveWorkout: vi.fn(),
  fetchLastSetsByExercise: vi.fn(),
}))

const { advanceMutate, setDayMutate } = vi.hoisted(() => ({ advanceMutate: vi.fn(), setDayMutate: vi.fn() }))
vi.mock('../../data/cursorActions', () => ({
  useAdvanceCursor: () => ({ mutate: advanceMutate, isPending: false }),
  useSetCursorDay: () => ({ mutate: setDayMutate, isPending: false }),
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

describe('formatSetsHint', () => {
  it('renders a straight rep scheme as count×reps', () => {
    expect(formatSetsHint([{ reps: 5 }, { reps: 5 }, { reps: 5 }], 'lb')).toBe('3×5')
  })

  it('groups a timed scheme by duration and formats via formatDuration', () => {
    expect(formatSetsHint([
      { durationSeconds: 8 }, { durationSeconds: 8 }, { durationSeconds: 8 }, { durationSeconds: 8 },
    ], 'lb')).toBe('4×0:08')
  })

  it('does not crash on a mixed reps + duration list (defensive; should not occur in practice)', () => {
    expect(() => formatSetsHint([{ reps: 5 }, { durationSeconds: 8 }], 'lb')).not.toThrow()
  })

  it('formats prescribed weights through the unit (kg suffix per weight)', () => {
    expect(formatSetsHint([{ reps: 5, weight: 135 }, { reps: 5, weight: 135 }], 'kg')).toBe('2×5 @ 61.2 kg')
    expect(formatSetsHint([{ reps: 5, weight: 135 }, { reps: 5, weight: 135 }], 'lb')).toBe('2×5 @ 135')
  })
})

describe('HomePage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    useActiveWorkout.mockReset()
    fetchLastSetsByExercise.mockReset()
    advanceMutate.mockReset(); setDayMutate.mockReset()
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

    // Once the async work settles, the session has started and the page navigates to /workout.
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workout'))
  })

  const activeSessionState = {
    status: 'active' as const,
    dayName: 'Gym A',
    exercises: [
      {
        id: 'e1',
        exerciseId: null,
        exerciseName: 'Squat',
        kind: 'strength' as const,
        inputType: 'weighted' as const,
        sets: [{ weight: 225, reps: 5, done: true, durationSeconds: null }],
      },
    ],
  }

  it('shows a Resume card for an in-progress session and resumes without re-seeding', () => {
    useActiveWorkout.mockReturnValue({ data: seededBundle, isLoading: false })
    useSessionStore.setState(activeSessionState)
    const spy = vi.spyOn(useSessionStore.getState(), 'startFromPrescription')

    render(<HomePage />)
    spy.mockClear() // ignore any cross-test async; assert only what this interaction does

    expect(screen.getByText('Workout in progress')).toBeInTheDocument()
    // The bare "Start workout" is replaced so a re-seed can't silently wipe the session.
    expect(screen.queryByRole('button', { name: 'Start workout' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Resume workout' }))
    expect(mockNavigate).toHaveBeenCalledWith('/workout')
    expect(spy).not.toHaveBeenCalled() // resume must NOT re-seed
  })

  it('requires confirmation before discarding an in-progress session to start new', async () => {
    useActiveWorkout.mockReturnValue({ data: seededBundle, isLoading: false })
    useSessionStore.setState(activeSessionState)
    const spy = vi.spyOn(useSessionStore.getState(), 'startFromPrescription')

    render(<HomePage />)
    spy.mockClear() // ignore any cross-test async; assert only what this interaction does

    fireEvent.click(screen.getByRole('button', { name: 'Start new workout' }))
    expect(spy).not.toHaveBeenCalled() // first tap only reveals the confirm

    fireEvent.click(screen.getByRole('button', { name: 'Discard & start new' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workout'))
  })

  it('renders a Start climbing button and the target for a climbing day, launching program-linked', () => {
    const climbingBundle = {
      ...seededBundle,
      program: { name: 'Mixed', discipline: 'mixed', days: [{ name: 'Send', discipline: 'climbing', target: 'project V5', exercises: [] }] },
      cursor: { dayIndex: 0, week: 1, cycle: 1 },
    } as unknown as ActiveWorkoutBundle
    useActiveWorkout.mockReturnValue({ data: climbingBundle, isLoading: false })

    render(<HomePage />)

    expect(screen.getByText('project V5')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start climbing' }))
    expect(mockNavigate).toHaveBeenCalledWith('/climbing/new', { state: { programLinked: true } })
  })

  it('renders a Start cardio button for a cardio day, launching program-linked', () => {
    const cardioBundle = {
      ...seededBundle,
      program: { name: 'Mixed', discipline: 'mixed', days: [{ name: 'Run', discipline: 'cardio', target: '5k easy', exercises: [] }] },
      cursor: { dayIndex: 0, week: 1, cycle: 1 },
    } as unknown as ActiveWorkoutBundle
    useActiveWorkout.mockReturnValue({ data: cardioBundle, isLoading: false })

    render(<HomePage />)

    fireEvent.click(screen.getByRole('button', { name: 'Start cardio' }))
    expect(mockNavigate).toHaveBeenCalledWith('/cardio/new', { state: { programLinked: true } })
  })

  it('Skip day advances the cursor via useAdvanceCursor', () => {
    const twoDay = {
      ...seededBundle,
      program: { name: 'Mixed', discipline: 'mixed', days: [
        { name: 'Gym A', discipline: 'strength', exercises: [] },
        { name: 'Send', discipline: 'climbing', exercises: [] },
      ] },
      cursor: { dayIndex: 0, week: 1, cycle: 1 },
    } as unknown as ActiveWorkoutBundle
    useActiveWorkout.mockReturnValue({ data: twoDay, isLoading: false })
    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip day' }))
    expect(advanceMutate).toHaveBeenCalledWith({ program: twoDay.program, cursor: twoDay.cursor })
  })

  it('picking a day sets the cursor dayIndex while preserving week/cycle', () => {
    const twoDay = {
      ...seededBundle,
      program: { name: 'Mixed', discipline: 'mixed', days: [
        { name: 'Gym A', discipline: 'strength', exercises: [] },
        { name: 'Send', discipline: 'climbing', exercises: [] },
      ] },
      cursor: { dayIndex: 0, week: 2, cycle: 3 },
    } as unknown as ActiveWorkoutBundle
    useActiveWorkout.mockReturnValue({ data: twoDay, isLoading: false })
    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Do a different day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(setDayMutate).toHaveBeenCalledWith({ cursor: twoDay.cursor, dayIndex: 1 })
  })
})
