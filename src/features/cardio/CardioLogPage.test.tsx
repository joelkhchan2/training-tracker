import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CardioLogPage } from './CardioLogPage'

const { useLogCardio } = vi.hoisted(() => ({ useLogCardio: vi.fn() }))
const { useProfile } = vi.hoisted(() => ({ useProfile: vi.fn() }))
const { useActiveWorkout } = vi.hoisted(() => ({ useActiveWorkout: vi.fn() }))
const nav = vi.fn()
let locationState: unknown = null

vi.mock('../../data/logCardio', () => ({ useLogCardio }))
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
const cardioBundle = {
  program: {
    name: 'Mixed',
    discipline: 'mixed',
    days: [
      { name: 'Run', discipline: 'cardio', target: '5k easy', exercises: [] },
      { name: 'Rest', discipline: 'strength', exercises: [] },
    ],
  },
  cursor: { dayIndex: 0, week: 1, cycle: 1 },
}

beforeEach(() => {
  mutate.mockReset()
  nav.mockReset()
  locationState = null
  useLogCardio.mockReturnValue({ mutate, isPending: false })
  useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength', 'cardio'] }, isLoading: false })
  useActiveWorkout.mockReturnValue({ data: undefined })
})

describe('CardioLogPage', () => {
  it('redirects to Home when cardio is not enabled', () => {
    useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength'] }, isLoading: false })
    render(<CardioLogPage />)
    expect(screen.getByText('redirect-to-/')).toBeInTheDocument()
    expect(screen.queryByLabelText('Activity')).not.toBeInTheDocument()
  })

  it('shows a pace preview once duration and distance are set', () => {
    render(<CardioLogPage />)
    // Defaults: activity Run, duration 30. Set distance to 5 → 30min/5km = 6:00 /km.
    fireEvent.change(screen.getByLabelText('Distance (km, optional)'), { target: { value: '5' } })
    expect(screen.getByText('Pace: 6:00 /km')).toBeInTheDocument()
  })

  it('reveals a custom activity field when Other is chosen', () => {
    render(<CardioLogPage />)
    expect(screen.queryByLabelText('Activity name')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'Other' } })
    expect(screen.getByLabelText('Activity name')).toBeInTheDocument()
  })

  it('saves a valid entry via the RPC hook with the expected payload', () => {
    render(<CardioLogPage />)
    fireEvent.change(screen.getByLabelText('Distance (km, optional)'), { target: { value: '5.2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mutate).toHaveBeenCalledTimes(1)
    const [payload] = mutate.mock.calls[0]
    expect(payload).toMatchObject({ activity: 'Run', durationMinutes: 30, distanceKm: 5.2, notes: null })
    expect(typeof payload.clientId).toBe('string')
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('reuses the same clientId across repeated saves (idempotent retry)', () => {
    render(<CardioLogPage />)
    fireEvent.change(screen.getByLabelText('Distance (km, optional)'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mutate).toHaveBeenCalledTimes(2)
    expect(mutate.mock.calls[0][0].clientId).toBe(mutate.mock.calls[1][0].clientId)
  })

  it('blocks save and shows an error when Other is selected but no name is typed', () => {
    render(<CardioLogPage />)
    fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'Other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('blocks save and shows an error when duration is set to 0', () => {
    render(<CardioLogPage />)
    fireEvent.change(screen.getByLabelText('Duration (min)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('sends distanceKm: null when the distance is left at its default of 0', () => {
    render(<CardioLogPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mutate).toHaveBeenCalledTimes(1)
    const [payload] = mutate.mock.calls[0]
    expect(payload).toMatchObject({ distanceKm: null })
  })

  it('program-linked: passes cursor params and routes to / on save', () => {
    locationState = { programLinked: true }
    useActiveWorkout.mockReturnValue({ data: cardioBundle })
    mutate.mockImplementation((_input, opts) => opts.onSuccess('sess-1'))
    render(<CardioLogPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [payload] = mutate.mock.calls[0]
    expect(payload.nextCursor).toEqual({ dayIndex: 1, week: 1, cycle: 1 })
    expect(payload.lastAdvanceKey).toBe('1-1-1')
    expect(nav).toHaveBeenCalledWith('/')
  })

  it('program-linked: Save is disabled until the bundle resolves', () => {
    locationState = { programLinked: true }
    useActiveWorkout.mockReturnValue({ data: undefined })
    render(<CardioLogPage />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('ad-hoc: passes no cursor params and routes to /history', () => {
    mutate.mockImplementation((_input, opts) => opts.onSuccess('sess-2'))
    render(<CardioLogPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [payload] = mutate.mock.calls[0]
    expect(payload.nextCursor).toBeUndefined()
    expect(nav).toHaveBeenCalledWith('/history')
  })
})
