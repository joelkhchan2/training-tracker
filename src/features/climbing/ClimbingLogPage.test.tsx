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
  })

  it('disables Save until a grade has any attempts or sends', () => {
    render(<ClimbingLogPage />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('V3 attempts'), { target: { value: '4' } })
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
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
})
