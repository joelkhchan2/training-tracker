import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SettingsPage } from './SettingsPage'

const { useProfile, useUpdateDisciplines } = vi.hoisted(() => ({
  useProfile: vi.fn(),
  useUpdateDisciplines: vi.fn(),
}))
const signOut = vi.fn()

vi.mock('../../data/profile', () => ({ useProfile, useUpdateDisciplines }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' }, signOut }) }))

const mutate = vi.fn()

beforeEach(() => {
  mutate.mockReset()
  signOut.mockReset()
  useUpdateDisciplines.mockReturnValue({ mutate, isPending: false })
  useProfile.mockReturnValue({ data: { enabled_disciplines: ['strength', 'climbing'] }, isLoading: false })
})

describe('SettingsPage', () => {
  it('reflects the profile\'s enabled disciplines as checked toggles', () => {
    render(<SettingsPage />)
    expect(screen.getByLabelText('Strength')).toBeChecked()
    expect(screen.getByLabelText('Climbing')).toBeChecked()
    expect(screen.getByLabelText('Cardio')).not.toBeChecked()
  })

  it('enabling Cardio writes the extended discipline list', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByLabelText('Cardio'))
    expect(mutate).toHaveBeenCalledWith({ userId: 'user-1', disciplines: ['strength', 'climbing', 'cardio'] })
  })

  it('disabling an enabled discipline removes it from the list', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByLabelText('Climbing'))
    expect(mutate).toHaveBeenCalledWith({ userId: 'user-1', disciplines: ['strength'] })
  })

  it('signs out when Sign out is pressed', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalled()
  })

  it('disables discipline checkboxes while a write is in flight', () => {
    useUpdateDisciplines.mockReturnValue({ mutate, isPending: true })
    render(<SettingsPage />)
    expect(screen.getByLabelText('Cardio')).toBeDisabled()
  })
})
