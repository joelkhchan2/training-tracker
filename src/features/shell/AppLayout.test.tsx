import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AppLayout } from './AppLayout'
import { useSessionStore } from '../workout/sessionStore'

const { useProfile } = vi.hoisted(() => ({ useProfile: vi.fn() }))
const nav = vi.fn()

vi.mock('../../data/profile', () => ({ useProfile }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => nav,
  Outlet: () => <div>outlet-content</div>,
  NavLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

beforeEach(() => {
  nav.mockReset()
  useSessionStore.getState().reset()
  useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength'] } })
})

describe('AppLayout', () => {
  it('renders the routed page (Outlet) and the tab bar', () => {
    render(<AppLayout />)
    expect(screen.getByText('outlet-content')).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('opening the "+ Log" chooser offers Strength but hides Cardio when cardio is disabled', () => {
    render(<AppLayout />)
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    expect(screen.getByRole('button', { name: 'Strength workout' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cardio' })).not.toBeInTheDocument()
  })

  it('shows Cardio in the chooser when cardio is enabled, and routes to /cardio/new', () => {
    useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength', 'cardio'] } })
    render(<AppLayout />)
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cardio' }))
    expect(nav).toHaveBeenCalledWith('/cardio/new')
  })

  it('Strength starts a blank ad-hoc session and opens the workout screen', () => {
    render(<AppLayout />)
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    fireEvent.click(screen.getByRole('button', { name: 'Strength workout' }))

    expect(nav).toHaveBeenCalledWith('/workout')
    const s = useSessionStore.getState()
    expect(s.status).toBe('active')
    expect(s.adhoc).toBe(true)
    expect(s.exercises).toEqual([])
    expect(s.clientId).toBeTruthy()
  })

  it('Strength routes to Home (not a wipe) when a workout is already in progress', () => {
    // An in-progress session with entered data must not be silently discarded.
    useSessionStore.getState().startAdHoc({ clientId: 'existing', startedAt: '2026-01-01T00:00:00Z' })
    useSessionStore.getState().addExercise({ exerciseName: 'Squat', kind: 'strength' })

    render(<AppLayout />)
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    fireEvent.click(screen.getByRole('button', { name: 'Strength workout' }))

    expect(nav).toHaveBeenCalledWith('/')
    // The existing session is untouched.
    expect(useSessionStore.getState().clientId).toBe('existing')
    expect(useSessionStore.getState().exercises).toHaveLength(1)
  })
})
