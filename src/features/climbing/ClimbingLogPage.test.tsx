import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ClimbingLogPage } from './ClimbingLogPage'

const { useLogClimbing } = vi.hoisted(() => ({ useLogClimbing: vi.fn() }))
const { useProfile } = vi.hoisted(() => ({ useProfile: vi.fn() }))
const { useActiveWorkout } = vi.hoisted(() => ({ useActiveWorkout: vi.fn() }))
const nav = vi.fn()
let locationState: unknown = null

vi.mock('../../data/logClimbing', () => ({ useLogClimbing }))
vi.mock('../../data/profile', () => ({ useProfile }))
vi.mock('../../data/queries', () => ({ useActiveWorkout }))
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
  mutate.mockReset()
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
