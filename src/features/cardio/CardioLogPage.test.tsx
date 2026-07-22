import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CardioLogPage } from './CardioLogPage'

const { useLogCardio } = vi.hoisted(() => ({ useLogCardio: vi.fn() }))
const { useProfile } = vi.hoisted(() => ({ useProfile: vi.fn() }))
const nav = vi.fn()

vi.mock('../../data/logCardio', () => ({ useLogCardio }))
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
  useLogCardio.mockReturnValue({ mutate, isPending: false })
  useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength', 'cardio'] }, isLoading: false })
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
})
