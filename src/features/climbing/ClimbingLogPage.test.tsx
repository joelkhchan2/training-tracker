import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ClimbingLogPage } from './ClimbingLogPage'

const { useLogClimbing } = vi.hoisted(() => ({ useLogClimbing: vi.fn() }))
const { useProfile } = vi.hoisted(() => ({ useProfile: vi.fn() }))
const nav = vi.fn()

vi.mock('../../data/logClimbing', () => ({ useLogClimbing }))
vi.mock('../../data/profile', () => ({ useProfile }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => nav,
  Navigate: ({ to }: { to: string }) => <div>redirect-to-{to}</div>,
}))

const mutate = vi.fn()

beforeEach(() => {
  mutate.mockReset()
  nav.mockReset()
  useLogClimbing.mockReturnValue({ mutate, isPending: false })
  useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength', 'climbing'] }, isLoading: false })
})

describe('ClimbingLogPage', () => {
  it('redirects to Home when climbing is not enabled', () => {
    useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength'] }, isLoading: false })
    render(<ClimbingLogPage />)
    expect(screen.getByText('redirect-to-/')).toBeInTheDocument()
    expect(screen.queryByLabelText('V0')).not.toBeInTheDocument()
  })

  it('disables Save when all grade counts are 0, and enables it once a grade is incremented', () => {
    render(<ClimbingLogPage />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Increase V3' }))
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('saves only the grades with count > 0, mapped to { grade, count }', () => {
    render(<ClimbingLogPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase V0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase V0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase V4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mutate).toHaveBeenCalledTimes(1)
    const [payload] = mutate.mock.calls[0]
    expect(payload.sends).toEqual([
      { grade: 'V0', count: 2 },
      { grade: 'V4', count: 1 },
    ])
    expect(typeof payload.clientId).toBe('string')
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(payload.notes).toBeNull()
  })

  it('shows a celebration banner on a new max grade and defers navigation until Continue is clicked', () => {
    mutate.mockImplementation((_input, opts) => {
      opts.onSuccess({ sessionId: 's1', newMaxGrade: 6, previousMaxGrade: 5 })
    })
    render(<ClimbingLogPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase V6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText(/New max grade/)).toBeInTheDocument()
    expect(screen.getByText(/V6/)).toBeInTheDocument()
    expect(nav).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(nav).toHaveBeenCalledWith('/history')
  })

  it('navigates straight to history with no banner when there is no new max grade', () => {
    mutate.mockImplementation((_input, opts) => {
      opts.onSuccess({ sessionId: 's1', newMaxGrade: null, previousMaxGrade: null })
    })
    render(<ClimbingLogPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase V2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(nav).toHaveBeenCalledWith('/history')
    expect(screen.queryByText(/New max grade/)).not.toBeInTheDocument()
  })
})
