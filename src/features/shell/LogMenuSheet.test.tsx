import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LogMenuSheet } from './LogMenuSheet'
import { useSessionStore } from '../workout/sessionStore'

const { useProfile } = vi.hoisted(() => ({ useProfile: vi.fn() }))
const nav = vi.fn()

vi.mock('../../data/profile', () => ({ useProfile }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))

beforeEach(() => {
  nav.mockReset()
  useSessionStore.getState().reset()
  useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength', 'climbing', 'cardio'] } })
})

describe('LogMenuSheet', () => {
  it('renders nothing when closed', () => {
    render(<LogMenuSheet open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lists all enabled disciplines when none is excluded', () => {
    render(<LogMenuSheet open onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Strength workout' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cardio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Climbing' })).toBeInTheDocument()
  })

  it('omits the excluded discipline', () => {
    render(<LogMenuSheet open onClose={vi.fn()} exclude="climbing" />)
    expect(screen.queryByRole('button', { name: 'Climbing' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cardio' })).toBeInTheDocument()
  })

  it('hides a disabled discipline regardless of exclude', () => {
    useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength'] } })
    render(<LogMenuSheet open onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Cardio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Climbing' })).not.toBeInTheDocument()
  })

  it('picking Cardio closes the sheet and navigates to /cardio/new', () => {
    const onClose = vi.fn()
    render(<LogMenuSheet open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cardio' }))
    expect(onClose).toHaveBeenCalled()
    expect(nav).toHaveBeenCalledWith('/cardio/new')
  })

  it('picking Strength with no active session starts a blank ad-hoc session and navigates to /workout', () => {
    render(<LogMenuSheet open onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Strength workout' }))
    expect(nav).toHaveBeenCalledWith('/workout')
    const s = useSessionStore.getState()
    expect(s.status).toBe('active')
    expect(s.adhoc).toBe(true)
  })

  it('picking Strength with an active in-progress session routes Home instead of wiping it', () => {
    useSessionStore.getState().startAdHoc({ clientId: 'existing', startedAt: '2026-01-01T00:00:00Z' })
    useSessionStore.getState().addExercise({ exerciseName: 'Squat', kind: 'strength' })
    render(<LogMenuSheet open onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Strength workout' }))
    expect(nav).toHaveBeenCalledWith('/')
    expect(useSessionStore.getState().clientId).toBe('existing')
    expect(useSessionStore.getState().exercises).toHaveLength(1)
  })

  it('clicking the backdrop closes without navigating', () => {
    const onClose = vi.fn()
    const { container } = render(<LogMenuSheet open onClose={onClose} />)
    fireEvent.click(container.firstChild as Element)
    expect(onClose).toHaveBeenCalled()
    expect(nav).not.toHaveBeenCalled()
  })
})
