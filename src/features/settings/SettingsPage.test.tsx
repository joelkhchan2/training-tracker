import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SettingsPage } from './SettingsPage'
import { THEMES, SCALES } from './prefs'

const { useProfile, useUpdateDisciplines } = vi.hoisted(() => ({
  useProfile: vi.fn(),
  useUpdateDisciplines: vi.fn(),
}))
const signOut = vi.fn()

const setTheme = vi.fn()
const setFontFamily = vi.fn()
const setFontScale = vi.fn()

const { prefsState } = vi.hoisted(() => ({
  prefsState: { theme: 'navy', fontFamily: 'system', fontScale: 1 } as { theme: string; fontFamily: string; fontScale: number },
}))

vi.mock('../../data/profile', () => ({ useProfile, useUpdateDisciplines }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' }, signOut }) }))
vi.mock('./usePrefs', () => ({
  usePrefs: (selector: (s: typeof prefsState & { setTheme: typeof setTheme; setFontFamily: typeof setFontFamily; setFontScale: typeof setFontScale }) => unknown) =>
    selector({ ...prefsState, setTheme, setFontFamily, setFontScale }),
}))

const mutate = vi.fn()

beforeEach(() => {
  mutate.mockReset()
  signOut.mockReset()
  setTheme.mockReset()
  setFontFamily.mockReset()
  setFontScale.mockReset()
  prefsState.theme = 'navy'
  prefsState.fontFamily = 'system'
  prefsState.fontScale = 1
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

describe('SettingsPage — Appearance', () => {
  it('renders a theme option for every theme plus System', () => {
    render(<SettingsPage />)
    const themeGroup = within(screen.getByRole('group', { name: 'Theme' }))
    expect(themeGroup.getByRole('button', { name: 'System' })).toBeInTheDocument()
    for (const t of THEMES) {
      expect(themeGroup.getByRole('button', { name: t.label })).toBeInTheDocument()
    }
  })

  it('marks the active theme as pressed and others as not pressed', () => {
    render(<SettingsPage />)
    const themeGroup = within(screen.getByRole('group', { name: 'Theme' }))
    expect(themeGroup.getByRole('button', { name: 'Royal Navy' })).toHaveAttribute('aria-pressed', 'true')
    expect(themeGroup.getByRole('button', { name: 'Midnight' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('tapping a different theme option calls setTheme with its id', () => {
    render(<SettingsPage />)
    const themeGroup = within(screen.getByRole('group', { name: 'Theme' }))
    fireEvent.click(themeGroup.getByRole('button', { name: 'Evergreen' }))
    expect(setTheme).toHaveBeenCalledWith('evergreen')
  })

  it('tapping a font option calls setFontFamily with its id', () => {
    render(<SettingsPage />)
    const fontGroup = within(screen.getByRole('group', { name: 'Font' }))
    fireEvent.click(fontGroup.getByRole('button', { name: 'Mono' }))
    expect(setFontFamily).toHaveBeenCalledWith('mono')
  })

  it('tapping a text-size option calls setFontScale with its value', () => {
    render(<SettingsPage />)
    const sizeGroup = within(screen.getByRole('group', { name: 'Text size' }))
    const large = SCALES.find(s => s.id === 'L')!
    fireEvent.click(sizeGroup.getByRole('button', { name: new RegExp(large.label) }))
    expect(setFontScale).toHaveBeenCalledWith(large.value)
  })

  it('renders all theme options in a single flat list with no Seasonal heading', () => {
    render(<SettingsPage />)
    expect(screen.queryByText('Seasonal')).not.toBeInTheDocument()
    const themeGroup = within(screen.getByRole('group', { name: 'Theme' }))
    expect(themeGroup.getByRole('button', { name: 'System' })).toBeInTheDocument()
    for (const t of THEMES) {
      expect(themeGroup.getByRole('button', { name: t.label })).toBeInTheDocument()
    }
    expect(themeGroup.getByRole('button', { name: 'Yuletide' })).toBeInTheDocument()
  })

  it('shows Small/Medium/Large as the primary label for text-size options', () => {
    render(<SettingsPage />)
    const sizeGroup = within(screen.getByRole('group', { name: 'Text size' }))
    for (const s of SCALES) {
      expect(sizeGroup.getByRole('button', { name: s.label })).toBeInTheDocument()
    }
  })
})
