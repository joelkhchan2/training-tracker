import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ClimbingLogPage } from './ClimbingLogPage'
import { useClimbingDraft } from './climbingDraftStore'
import { useSessionStore } from '../workout/sessionStore'

const { useLogClimbing } = vi.hoisted(() => ({ useLogClimbing: vi.fn() }))
const { useProfile } = vi.hoisted(() => ({ useProfile: vi.fn() }))
const { useActiveWorkout } = vi.hoisted(() => ({ useActiveWorkout: vi.fn() }))
const { saveWorkoutMutateAsync } = vi.hoisted(() => ({ saveWorkoutMutateAsync: vi.fn() }))
const nav = vi.fn()
let locationState: unknown = null

vi.mock('../../data/logClimbing', () => ({ useLogClimbing }))
vi.mock('../../data/profile', () => ({ useProfile }))
vi.mock('../../data/queries', () => ({ useActiveWorkout }))
// Inline "+ Add exercise" saves via useSaveWorkout (react-query); this test harness has no
// QueryClientProvider, so stub it out. buildSavePlan (the climbing cursor-advance plan) stays real.
vi.mock('../../data/mutations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/mutations')>()
  return { ...actual, useSaveWorkout: () => ({ mutateAsync: saveWorkoutMutateAsync, isPending: false }) }
})
// An inline exercise card (ExerciseCard) calls useExerciseHistory (a real useQuery) for its
// "last time" hint; this test harness has no QueryClientProvider, so stub it out.
vi.mock('../../data/exerciseHistory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/exerciseHistory')>()
  return { ...actual, useExerciseHistory: () => ({ data: undefined, isLoading: false }) }
})
// Resolves/mints exercise ids for the inline save path via a real Supabase call — stubbed so
// tests don't need a live backend.
vi.mock('../../data/resolveDraftExercises', () => ({
  resolveExercisesByName: vi.fn(async (items: { name: string }[]) =>
    Object.fromEntries(items.map((it, i) => [it.name, `ex-${i}`])),
  ),
}))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => nav,
  useLocation: () => ({ state: locationState }),
  Navigate: ({ to }: { to: string }) => <div>redirect-to-{to}</div>,
}))

const mutate = vi.fn()

// Two days so buildSavePlan's real advanceCursor moves dayIndex 0 -> 1 within the same
// week/cycle (a single-day program would wrap to a new cycle instead — see task-6-report.md).
const climbingBundle = {
  program: {
    name: 'Mixed',
    discipline: 'mixed',
    days: [
      { name: 'Send', discipline: 'climbing', target: 'V5', exercises: [] },
      { name: 'Rest', discipline: 'strength', exercises: [] },
    ],
  },
  cursor: { dayIndex: 0, week: 1, cycle: 1 },
}

beforeEach(() => {
  // Reset the persisted draft store (a module singleton) so entries/notes/date don't leak
  // between tests. localStorage.clear() drops what persist wrote, reset() clears memory.
  localStorage.clear()
  useClimbingDraft.getState().reset()
  useSessionStore.getState().reset()
  mutate.mockReset()
  saveWorkoutMutateAsync.mockReset()
  saveWorkoutMutateAsync.mockResolvedValue({ sessionId: 's-adhoc', cycleComplete: false, progressionOutcomes: [], trainingMaxUpdates: [] })
  nav.mockReset()
  locationState = null
  useLogClimbing.mockReturnValue({ mutate, isPending: false })
  useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength', 'climbing'] }, isLoading: false })
  useActiveWorkout.mockReturnValue({ data: undefined })
})

describe('ClimbingLogPage', () => {
  it('redirects to Home when climbing is not enabled', () => {
    useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength'] }, isLoading: false })
    render(<ClimbingLogPage />)
    expect(screen.getByText('redirect-to-/')).toBeInTheDocument()
  })

  it('disables Save until a grade has any attempts or sends', () => {
    render(<ClimbingLogPage />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('V3 attempts'), { target: { value: '4' } })
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('steppers increment/decrement attempts and sends, clamped at zero, and stay editable', () => {
    render(<ClimbingLogPage />)
    // Steppers add/subtract without typing.
    fireEvent.click(screen.getByRole('button', { name: 'Increase V3 attempts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase V3 attempts' }))
    expect(screen.getByLabelText('V3 attempts')).toHaveValue('2')
    fireEvent.click(screen.getByRole('button', { name: 'Decrease V3 attempts' }))
    expect(screen.getByLabelText('V3 attempts')).toHaveValue('1')
    // Cannot go below zero.
    fireEvent.click(screen.getByRole('button', { name: 'Decrease V3 sends' }))
    expect(screen.getByLabelText('V3 sends')).toHaveValue('0')
    // Direct typing still works alongside the steppers.
    fireEvent.change(screen.getByLabelText('V3 sends'), { target: { value: '5' } })
    expect(screen.getByLabelText('V3 sends')).toHaveValue('5')
  })

  it('retains an in-progress draft across a remount (exit/reopen)', () => {
    const { unmount } = render(<ClimbingLogPage />)
    fireEvent.change(screen.getByLabelText('V4 attempts'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('V4 sends'), { target: { value: '1' } })

    // Simulate closing the app and coming back: a fresh mount reads the persisted store.
    unmount()
    render(<ClimbingLogPage />)

    expect(screen.getByLabelText('V4 attempts')).toHaveValue('3')
    expect(screen.getByLabelText('V4 sends')).toHaveValue('1')
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('clears the draft after a successful save so the next log starts blank', () => {
    mutate.mockImplementation((_input, opts) => opts.onSuccess({ sessionId: 's1', newMaxGrade: null, previousMaxGrade: null }))
    render(<ClimbingLogPage />)
    fireEvent.change(screen.getByLabelText('V4 sends'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // Re-open: the persisted draft was reset, so the form is empty again.
    render(<ClimbingLogPage />)
    const inputs = screen.getAllByLabelText('V4 sends')
    expect(inputs[inputs.length - 1]).toHaveValue('0')
  })

  it('saves normalized rows: includes projecting (attempts, 0 sends) and clamps sends-only', () => {
    render(<ClimbingLogPage />)
    fireEvent.change(screen.getByLabelText('V6 attempts'), { target: { value: '8' } }) // projecting
    fireEvent.change(screen.getByLabelText('V3 sends'), { target: { value: '2' } })     // sends-only
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mutate).toHaveBeenCalledTimes(1)
    const [payload] = mutate.mock.calls[0]
    expect(payload.sends).toEqual([
      { grade: 'V3', count: 2, attempts: 2 },
      { grade: 'V6', count: 0, attempts: 8 },
    ])
    expect(typeof payload.clientId).toBe('string')
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('celebrates a new max grade, deferring nav until Continue', () => {
    mutate.mockImplementation((_input, opts) => opts.onSuccess({ sessionId: 's1', newMaxGrade: 6, previousMaxGrade: 5 }))
    render(<ClimbingLogPage />)
    fireEvent.change(screen.getByLabelText('V6 sends'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText(/New max grade/)).toBeInTheDocument()
    expect(nav).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(nav).toHaveBeenCalledWith('/history')
  })

  it('navigates to history with no banner when there is no new max grade', () => {
    mutate.mockImplementation((_input, opts) => opts.onSuccess({ sessionId: 's1', newMaxGrade: null, previousMaxGrade: null }))
    render(<ClimbingLogPage />)
    fireEvent.change(screen.getByLabelText('V2 sends'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(nav).toHaveBeenCalledWith('/history')
    expect(screen.queryByText(/New max grade/)).not.toBeInTheDocument()
  })

  it('program-linked: passes cursor params from the bundle snapshot and routes to / on non-PR save', () => {
    locationState = { programLinked: true }
    useActiveWorkout.mockReturnValue({ data: climbingBundle })
    mutate.mockImplementation((_input, opts) => opts.onSuccess({ sessionId: 's', newMaxGrade: null, previousMaxGrade: null }))
    render(<ClimbingLogPage />)
    fireEvent.change(screen.getByLabelText('V4 sends'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [payload] = mutate.mock.calls[0]
    expect(payload.nextCursor).toEqual({ dayIndex: 1, week: 1, cycle: 1 })
    expect(payload.lastAdvanceKey).toBe('1-1-1')
    expect(nav).toHaveBeenCalledWith('/')
  })

  it('program-linked: PR interstitial Continue routes to / (not /history)', () => {
    locationState = { programLinked: true }
    useActiveWorkout.mockReturnValue({ data: climbingBundle })
    mutate.mockImplementation((_input, opts) => opts.onSuccess({ sessionId: 's', newMaxGrade: 6, previousMaxGrade: 5 }))
    render(<ClimbingLogPage />)
    fireEvent.change(screen.getByLabelText('V6 sends'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(nav).toHaveBeenCalledWith('/')
  })

  it('program-linked: Save is disabled until the bundle resolves', () => {
    locationState = { programLinked: true }
    useActiveWorkout.mockReturnValue({ data: undefined })
    render(<ClimbingLogPage />)
    fireEvent.change(screen.getByLabelText('V4 sends'), { target: { value: '1' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('the in-session "+ Log" button offers Cardio but not Strength (use the inline "+ Add exercise" instead) or Climbing (current page)', () => {
    useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength', 'climbing', 'cardio'] }, isLoading: false })
    render(<ClimbingLogPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Log another session' }))
    expect(screen.getByRole('button', { name: 'Cardio' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Strength workout' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Climbing' })).not.toBeInTheDocument()
  })

  it('an exercise added to the shared session store renders as its own card alongside the climbing grades', () => {
    useSessionStore.getState().startAdHoc({ clientId: 'ex-1', startedAt: '2026-01-01T00:00:00Z' })
    useSessionStore.getState().addExercise({ exerciseName: 'Pull-up', kind: 'bodyweight' })
    render(<ClimbingLogPage />)
    expect(screen.getByText('Pull-up')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add exercise' })).toBeInTheDocument()
  })

  it('shows a "Resume workout" prompt instead of the add-exercise UI when a prescribed (non-adhoc) workout is already in progress', () => {
    useSessionStore.getState().startFromPrescription([], { sessionType: 'Day A', dayName: 'Day A', dayIndex: 0, clientId: 'p-1', startedAt: '2026-01-01T00:00:00Z' })
    render(<ClimbingLogPage />)
    expect(screen.getByText(/already in progress/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume workout' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add exercise' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Resume workout' }))
    expect(nav).toHaveBeenCalledWith('/workout')
  })

  it('Save with an added exercise but no climbing grades saves the exercise as an ad-hoc workout and navigates away', async () => {
    useSessionStore.getState().startAdHoc({ clientId: 'ex-1', startedAt: '2026-01-01T00:00:00Z' })
    useSessionStore.getState().addExercise({ exerciseName: 'Pull-up', kind: 'bodyweight' })
    useSessionStore.getState().updateSet(0, 0, { reps: 8 })
    render(<ClimbingLogPage />)
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveWorkoutMutateAsync).toHaveBeenCalledTimes(1))
    const [saveInput] = saveWorkoutMutateAsync.mock.calls[0]
    expect(saveInput.adhoc).toBe(true)
    // updateSet's smart carry-forward propagates reps:8 to the other 2 (still-empty) sets too.
    expect(saveInput.sets).toHaveLength(3)
    expect(saveInput.sets[0]).toEqual(expect.objectContaining({ reps: 8, weight: null }))
    expect(mutate).not.toHaveBeenCalled() // no climbing grades logged — climbing isn't saved
    await waitFor(() => expect(useSessionStore.getState().status).toBe('idle')) // the ad-hoc draft is cleared
    expect(nav).toHaveBeenCalledWith('/history')
  })

  it('program-linked: skips the enabled-disciplines redirect', () => {
    locationState = { programLinked: true }
    useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength'] }, isLoading: false })
    useActiveWorkout.mockReturnValue({ data: climbingBundle })
    render(<ClimbingLogPage />)
    expect(screen.queryByText('redirect-to-/')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('program-linked: downgrades to ad-hoc (no cursor params) when the cursor day discipline drifts', () => {
    locationState = { programLinked: true }
    useActiveWorkout.mockReturnValue({
      data: { program: { name: 'Mixed', discipline: 'mixed', days: [{ name: 'Gym', discipline: 'strength', exercises: [] }] }, cursor: { dayIndex: 0, week: 1, cycle: 1 } },
    })
    mutate.mockImplementation((_input, opts) => opts.onSuccess({ sessionId: 's', newMaxGrade: null, previousMaxGrade: null }))
    render(<ClimbingLogPage />)
    fireEvent.change(screen.getByLabelText('V4 sends'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [payload] = mutate.mock.calls[0]
    expect(payload.nextCursor).toBeUndefined()
    expect(nav).toHaveBeenCalledWith('/')
  })
})
