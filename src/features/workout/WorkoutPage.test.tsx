import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { WorkoutPage } from './WorkoutPage'
import { useSessionStore } from './sessionStore'
import { resolveExercisesByName } from '../../data/resolveDraftExercises'
import type { PrescribedExercise } from '../../domain/types'
import type { LinearProgressionConfig } from '../../domain/types'
import type { ActiveWorkoutBundle } from '../../data/queries'

const { mockNavigate, useActiveWorkout, useSaveWorkout, mockMutate } = vi.hoisted(() => {
  const mockMutate = vi.fn()
  return {
    mockNavigate: vi.fn(),
    useActiveWorkout: vi.fn(),
    useSaveWorkout: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
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
vi.mock('../../data/mutations', () => ({ useSaveWorkout }))
vi.mock('../../data/resolveDraftExercises', () => ({
  resolveExercisesByName: vi.fn(async () => ({ 'Face Pulls': 'ex-facepulls' })),
}))

const prescription: PrescribedExercise[] = [
  {
    exerciseName: 'Squat',
    tmKey: 'squat',
    sets: [
      { weight: 135, reps: 5 },
      { weight: 155, reps: 5, isFsl: true },
      { weight: 175, reps: 3 },
    ],
  },
  {
    exerciseName: 'Push-up',
    sets: [
      { reps: 10 },
      { reps: 10 },
    ],
  },
]

const meta = {
  sessionType: '5/3/1',
  dayName: 'Squat Day',
  dayIndex: 0,
  clientId: 'client-123',
  startedAt: '2026-07-12T00:00:00.000Z',
}

const bundle: ActiveWorkoutBundle = {
  program: { name: 'Test Program', discipline: 'strength', days: [] },
  days: [],
  programExercises: [
    {
      id: 'pe-1',
      program_day_id: 'day-1',
      exercise_id: 'ex-squat',
      role_key: null,
      order_index: 0,
      scheme: { type: 'fixed', sets: [{ reps: 5 }] },
      exercise_name: null,
      exercise_type: null,
    },
    {
      id: 'pe-2',
      program_day_id: 'day-1',
      exercise_id: 'ex-pushup',
      role_key: null,
      order_index: 1,
      scheme: { type: 'fixed', sets: [{ reps: 10 }] },
      exercise_name: null,
      exercise_type: null,
    },
  ],
  exercisesById: {
    'ex-squat': {
      id: 'ex-squat',
      user_id: null,
      name: 'Squat',
      primary_muscles: null,
      equipment: null,
      movement_pattern: null,
      exercise_type: 'weighted',
      popularity: null,
      is_active: true,
      created_at: '',
      canonical_id: null,
    },
    'ex-pushup': {
      id: 'ex-pushup',
      user_id: null,
      name: 'Push-up',
      primary_muscles: null,
      equipment: null,
      movement_pattern: null,
      exercise_type: 'bodyweight',
      popularity: null,
      is_active: true,
      created_at: '',
      canonical_id: null,
    },
  },
  trainingMaxes: {},
  cursor: { dayIndex: 0, week: 2, cycle: 1 },
  personalRecords: [
    {
      id: 'pr-1',
      user_id: 'user-1',
      exercise_id: 'ex-squat',
      pr_type: 'e1rm',
      value: 250,
      reps: null,
      weight: null,
      date_achieved: '2026-01-01',
      previous_value: null,
      session_id: null,
    },
  ],
  workingWeights: {},
  workingWeightValues: {},
}

function renderAtWorkout() {
  return render(
    <MemoryRouter initialEntries={['/workout']}>
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route path="/workout" element={<WorkoutPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useSessionStore.getState().reset()
  mockNavigate.mockReset()
  mockMutate.mockReset()
  useActiveWorkout.mockReset()
  useActiveWorkout.mockReturnValue({ data: bundle, isLoading: false })
  useSaveWorkout.mockReset()
  useSaveWorkout.mockReturnValue({ mutate: mockMutate, isPending: false })
  vi.mocked(resolveExercisesByName).mockClear()
  vi.mocked(resolveExercisesByName).mockImplementation(async () => ({ 'Face Pulls': 'ex-facepulls' }))
})

describe('WorkoutPage', () => {
  it('renders an ExerciseCard per exercise and a SetRow per set with prefilled values', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    renderAtWorkout()

    expect(screen.getByRole('heading', { name: 'Squat Day' })).toBeInTheDocument()
    expect(screen.getByText('Squat')).toBeInTheDocument()
    expect(screen.getByText('Push-up')).toBeInTheDocument()

    const squatCard = screen.getByTestId('exercise-card-0')
    expect(within(squatCard).getAllByTestId(/^set-row-0-/)).toHaveLength(3)

    const firstSet = screen.getByTestId('set-row-0-0')
    expect(within(firstSet).getByLabelText('Weight')).toHaveValue('135')
    expect(within(firstSet).getByLabelText('Reps')).toHaveValue('5')

    // FSL tag on the second squat set only
    const secondSet = screen.getByTestId('set-row-0-1')
    expect(within(secondSet).getByText('FSL')).toBeInTheDocument()
    expect(within(firstSet).queryByText('FSL')).not.toBeInTheDocument()

    const pushupCard = screen.getByTestId('exercise-card-1')
    expect(within(pushupCard).getAllByTestId(/^set-row-1-/)).toHaveLength(2)
  })

  it('editing the weight field updates the session store and the displayed value', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    renderAtWorkout()

    const firstSet = screen.getByTestId('set-row-0-0')
    const weightInput = within(firstSet).getByLabelText('Weight')
    fireEvent.change(weightInput, { target: { value: '140' } })

    expect(weightInput).toHaveValue('140')
    expect(useSessionStore.getState().exercises[0].sets[0].weight).toBe(140)
  })

  it('toggling done marks the set as done in the store and visually', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    renderAtWorkout()

    const firstSet = screen.getByTestId('set-row-0-0')
    const doneToggle = within(firstSet).getByLabelText('Set 1 done')
    expect(doneToggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(doneToggle)

    expect(doneToggle).toHaveAttribute('aria-pressed', 'true')
    expect(useSessionStore.getState().exercises[0].sets[0].done).toBe(true)
  })

  it('"+ Add set" appends a new row to the target exercise only', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    renderAtWorkout()

    const squatCard = screen.getByTestId('exercise-card-0')
    fireEvent.click(within(squatCard).getByRole('button', { name: '+ Add set' }))

    expect(screen.getByTestId('set-row-0-3')).toBeInTheDocument()
    expect(useSessionStore.getState().exercises[0].sets).toHaveLength(4)
    expect(useSessionStore.getState().exercises[1].sets).toHaveLength(2)
  })

  it('redirects Home when there is no active session (deep link without starting)', () => {
    // store is idle after reset — no startFromPrescription call
    renderAtWorkout()

    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.queryByText('Squat')).not.toBeInTheDocument()
  })

  it('Finish workout calls the save mutation with a correctly-shaped payload', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    renderAtWorkout()

    // Bump the first squat set's weight high enough to clear the mocked
    // existing e1RM PR (250) once saved.
    const firstSet = screen.getByTestId('set-row-0-0')
    fireEvent.change(within(firstSet).getByLabelText('Weight'), { target: { value: '300' } })

    fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }))

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const [payload] = mockMutate.mock.calls[0]

    expect(payload.clientId).toBe('client-123')
    expect(payload.program).toBe(bundle.program)
    expect(payload.cursor).toBe(bundle.cursor)
    expect(payload.session).toMatchObject({
      discipline: 'strength',
      session_type: 'Squat Day',
      status: 'completed',
      program_variant: 'Test Program',
      program_week: 2,
    })
    expect(payload.session.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // The three squat sets carry their logged weight; the two weightless-but-repped
    // push-up sets are still included (bodyweight accessories), persisted with weight 0 and
    // resolved to the real push-up exercise_id from the bundle (never null — see the
    // no-null-exercise_id guard in handleFinish).
    expect(payload.sets).toEqual([
      { exercise_id: 'ex-squat', set_number: 1, weight: 300, reps: 5, rpe: null, is_warmup: false, order_index: 0, prescription_index: 0 },
      { exercise_id: 'ex-squat', set_number: 2, weight: 155, reps: 5, rpe: null, is_warmup: false, order_index: 1, prescription_index: 1 },
      { exercise_id: 'ex-squat', set_number: 3, weight: 175, reps: 3, rpe: null, is_warmup: false, order_index: 2, prescription_index: 2 },
      { exercise_id: 'ex-pushup', set_number: 1, weight: 0, reps: 10, rpe: null, is_warmup: false, order_index: 3, prescription_index: 0 },
      { exercise_id: 'ex-pushup', set_number: 2, weight: 0, reps: 10, rpe: null, is_warmup: false, order_index: 4, prescription_index: 1 },
    ])
    // progressionSets excludes nothing here (neither exercise is adhoc) — it should equal sets.
    expect(payload.progressionSets).toEqual(payload.sets)
  })

  it('shows the SummarySheet with tonnage and a detected PR on save success', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    renderAtWorkout()

    const firstSet = screen.getByTestId('set-row-0-0')
    fireEvent.change(within(firstSet).getByLabelText('Weight'), { target: { value: '300' } })

    fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }))

    const [, options] = mockMutate.mock.calls[0]
    act(() =>
      options.onSuccess({
        sessionId: 'session-1',
        cycleComplete: false,
        nextCursor: bundle.cursor,
        progressionOutcomes: [],
      }),
    )

    expect(screen.getByRole('dialog', { name: 'Workout summary' })).toBeInTheDocument()
    // tonnage = 300*5 + 155*5 + 175*3 = 2800
    expect(screen.getByText('2,800')).toBeInTheDocument()
    expect(screen.getByText(/Squat — new e1RM 350 \(was 250\)/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(useSessionStore.getState().status).toBe('idle')
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('shows an error and keeps the session intact when the save mutation fails', () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    renderAtWorkout()

    fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }))

    const [, options] = mockMutate.mock.calls[0]
    act(() => options.onError(new Error('network down')))

    expect(screen.getByRole('alert')).toHaveTextContent('network down')
    expect(useSessionStore.getState().status).toBe('active')
    expect(useSessionStore.getState().clientId).toBe('client-123')
    expect(useSessionStore.getState().exercises[0].sets).toHaveLength(3)
    expect(screen.queryByRole('dialog', { name: 'Workout summary' })).not.toBeInTheDocument()
  })
})

/** Seeds an adhoc "Face Pulls" exercise (as `addExercise` would from the exercise picker) with
 *  one logged set, appended after the given prescription's exercises. */
function addAdhocFacePulls() {
  useSessionStore.getState().addExercise({ exerciseName: 'Face Pulls', kind: 'bodyweight' })
  const adhocIdx = useSessionStore.getState().exercises.length - 1
  useSessionStore.getState().updateSet(adhocIdx, 0, { reps: 12, weight: 20 })
}

describe('WorkoutPage — save-path resolution of added exercises', () => {
  it('resolves an added exercise to a minted id and excludes it from progressionSets', async () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    addAdhocFacePulls()
    renderAtWorkout()

    fireEvent.click(screen.getByRole('button', { name: /Finish workout/i }))
    await waitFor(() => expect(mockMutate).toHaveBeenCalled())

    expect(resolveExercisesByName).toHaveBeenCalledWith([{ name: 'Face Pulls', kind: 'bodyweight' }], 'user-1')

    const [payload] = mockMutate.mock.calls[0]
    const faceIds = payload.sets.filter((s: { exercise_id: string | null }) => s.exercise_id === 'ex-facepulls')
    expect(faceIds.length).toBeGreaterThan(0) // adhoc saved with the minted id (not null)
    expect(payload.progressionSets.some((s: { exercise_id: string | null }) => s.exercise_id === 'ex-facepulls')).toBe(false) // excluded from progression matching
    expect(payload.sets.every((s: { exercise_id: string | null }) => s.exercise_id != null)).toBe(true) // no null ids
  })

  it('drops sets whose exercise cannot be resolved rather than saving a null id', async () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    addAdhocFacePulls()
    vi.mocked(resolveExercisesByName).mockResolvedValueOnce({})
    renderAtWorkout()

    fireEvent.click(screen.getByRole('button', { name: /Finish workout/i }))
    await waitFor(() => expect(mockMutate).toHaveBeenCalled())

    const [payload] = mockMutate.mock.calls[0]
    expect(payload.sets.every((s: { exercise_id: string | null }) => s.exercise_id != null)).toBe(true)
    // The unresolved Face Pulls set is dropped entirely, not saved with a null/placeholder id.
    expect(payload.sets.some((s: { exercise_id: string | null }) => s.exercise_id === 'ex-facepulls')).toBe(false)
    expect(payload.sets).toHaveLength(5) // 3 squat + 2 push-up; the face-pulls set is gone
  })

  it('disables Finish while resolving and does not double-submit on a second click', async () => {
    useSessionStore.getState().startFromPrescription(prescription, meta)
    addAdhocFacePulls()
    let release!: (v: Record<string, string>) => void
    vi.mocked(resolveExercisesByName).mockReturnValueOnce(new Promise((r) => { release = r }))
    renderAtWorkout()

    const btn = screen.getByRole('button', { name: /Finish workout/i })
    fireEvent.click(btn)

    expect(btn).toBeDisabled() // isResolving guard
    fireEvent.click(btn) // second tap while resolving
    expect(resolveExercisesByName).toHaveBeenCalledTimes(1) // no double resolve/mint

    release({ 'Face Pulls': 'ex-facepulls' })
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
  })
})

const LINEAR_CONFIG: LinearProgressionConfig = { increment: 5, failsBeforeDeload: 3, deloadPercent: 0.1 }

const linearScheme = {
  type: 'linear' as const,
  sets: [{ reps: 5 }, { reps: 5 }, { reps: 5, amrap: true, targetReps: 5 }],
  progression: LINEAR_CONFIG,
}

// The prescription a wired-up useTodaysPrescription would hand off for this day: the
// AMRAP set carries isAmrap/targetReps, and every set's weight is the working weight.
const linearPrescription: PrescribedExercise[] = [
  {
    exerciseName: 'Squat',
    tmKey: 'squat',
    sets: [
      { weight: 100, reps: 5 },
      { weight: 100, reps: 5 },
      { weight: 100, reps: 5, isAmrap: true, targetReps: 5 },
    ],
  },
]

const linearMeta = {
  sessionType: 'Squat Day',
  dayName: 'Squat Day',
  dayIndex: 0,
  clientId: 'client-lp',
  startedAt: '2026-07-12T00:00:00.000Z',
}

const linearBundle: ActiveWorkoutBundle = {
  program: {
    name: 'Linear Program',
    discipline: 'strength',
    days: [{ name: 'Squat Day', exercises: [{ exerciseName: 'Squat', tmKey: 'squat', order: 0, scheme: linearScheme }] }],
  },
  days: [{ id: 'day-1', program_id: 'prog-1', name: 'Squat Day', order_index: 0 }],
  programExercises: [
    { id: 'pe-1', program_day_id: 'day-1', exercise_id: 'ex-squat', role_key: 'squat', order_index: 0, scheme: linearScheme, exercise_name: null, exercise_type: null },
  ],
  exercisesById: {
    'ex-squat': {
      id: 'ex-squat',
      user_id: null,
      name: 'Squat',
      primary_muscles: null,
      equipment: null,
      movement_pattern: null,
      exercise_type: 'weighted',
      popularity: null,
      is_active: true,
      created_at: '',
      canonical_id: null,
    },
  },
  trainingMaxes: {},
  cursor: { dayIndex: 0, week: 1, cycle: 1 },
  personalRecords: [],
  workingWeights: { squat: { weight: 100, fails: 0 } },
  workingWeightValues: { squat: 100 },
}

describe('WorkoutPage — AMRAP display and linear-progression wiring', () => {
  it('renders the AMRAP label with its target on the AMRAP set, at the resolved working weight', () => {
    useSessionStore.getState().startFromPrescription(linearPrescription, linearMeta)
    useActiveWorkout.mockReturnValue({ data: linearBundle, isLoading: false })
    renderAtWorkout()

    const firstSet = screen.getByTestId('set-row-0-0')
    expect(within(firstSet).getByLabelText('Weight')).toHaveValue('100')
    expect(within(firstSet).queryByText(/AMRAP/)).not.toBeInTheDocument()

    const amrapSet = screen.getByTestId('set-row-0-2')
    expect(within(amrapSet).getByLabelText('Weight')).toHaveValue('100')
    expect(within(amrapSet).getByText('AMRAP · target 5')).toBeInTheDocument()
  })

  it('Finish workout on a linear-progression day sends programId/progressionExercises/workingWeights, and the summary renders the returned outcome', () => {
    useSessionStore.getState().startFromPrescription(linearPrescription, linearMeta)
    useActiveWorkout.mockReturnValue({ data: linearBundle, isLoading: false })
    renderAtWorkout()

    fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }))

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const [payload, options] = mockMutate.mock.calls[0]

    expect(payload.programId).toBe('prog-1')
    expect(payload.progressionExercises).toEqual([
      { exerciseId: 'ex-squat', exerciseName: 'Squat', tmKey: 'squat', scheme: linearScheme },
    ])
    expect(payload.workingWeights).toEqual({ squat: { weight: 100, fails: 0 } })

    act(() =>
      options.onSuccess({
        sessionId: 'session-lp',
        cycleComplete: false,
        nextCursor: linearBundle.cursor,
        progressionOutcomes: [{ exerciseName: 'Squat', action: 'increase', nextWeight: 105 }],
      }),
    )

    expect(screen.getByText('Squat 100 → 105 (+5)')).toBeInTheDocument()
  })
})
