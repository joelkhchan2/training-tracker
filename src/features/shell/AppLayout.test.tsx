import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AppLayout } from './AppLayout'

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

  it('routes Strength to Home (which owns session seeding)', () => {
    render(<AppLayout />)
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    fireEvent.click(screen.getByRole('button', { name: 'Strength workout' }))
    expect(nav).toHaveBeenCalledWith('/')
  })
})
