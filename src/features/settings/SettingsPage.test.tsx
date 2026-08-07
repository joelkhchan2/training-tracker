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
const setWeightUnit = vi.fn()
const setWeekStartDay = vi.fn()
const setRestTimerDefaultSeconds = vi.fn()
const setRestTimerHaptics = vi.fn()
const setShowRpe = vi.fn()
const setAutoFillSets = vi.fn()

const { prefsState } = vi.hoisted(() => ({
  prefsState: {
    theme: 'navy', fontFamily: 'system', fontScale: 1,
    weightUnit: 'lb',
    weekStartDay: 'monday', restTimerDefaultSeconds: 120, restTimerHaptics: true, showRpe: true, autoFillSets: true,
  } as {
    theme: string; fontFamily: string; fontScale: number
    weightUnit: string
    weekStartDay: string; restTimerDefaultSeconds: number; restTimerHaptics: boolean; showRpe: boolean; autoFillSets: boolean
  },
}))

vi.mock('../../data/profile', () => ({ useProfile, useUpdateDisciplines }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' }, signOut }) }))
vi.mock('./usePrefs', () => ({
  usePrefs: (
    selector: (
      s: typeof prefsState & {
        setTheme: typeof setTheme; setFontFamily: typeof setFontFamily; setFontScale: typeof setFontScale
        setWeightUnit: typeof setWeightUnit
        setWeekStartDay: typeof setWeekStartDay; setRestTimerDefaultSeconds: typeof setRestTimerDefaultSeconds
        setRestTimerHaptics: typeof setRestTimerHaptics; setShowRpe: typeof setShowRpe
        setAutoFillSets: typeof setAutoFillSets
      },
    ) => unknown,
  ) =>
    selector({
      ...prefsState,
      setTheme, setFontFamily, setFontScale,
      setWeightUnit,
      setWeekStartDay, setRestTimerDefaultSeconds, setRestTimerHaptics, setShowRpe, setAutoFillSets,
    }),
}))

const mutate = vi.fn()

beforeEach(() => {
  mutate.mockReset()
  signOut.mockReset()
  setTheme.mockReset()
  setFontFamily.mockReset()
  setFontScale.mockReset()
  setWeightUnit.mockReset()
  setWeekStartDay.mockReset()
  setRestTimerDefaultSeconds.mockReset()
  setRestTimerHaptics.mockReset()
  setShowRpe.mockReset()
  setAutoFillSets.mockReset()
  prefsState.theme = 'navy'
  prefsState.fontFamily = 'system'
  prefsState.fontScale = 1
  prefsState.weightUnit = 'lb'
  prefsState.weekStartDay = 'monday'
  prefsState.restTimerDefaultSeconds = 120
  prefsState.restTimerHaptics = true
  prefsState.showRpe = true
  prefsState.autoFillSets = true
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

  it('offers the self-hosted Inter font option', () => {
    render(<SettingsPage />)
    const fontGroup = within(screen.getByRole('group', { name: 'Font' }))
    fireEvent.click(fontGroup.getByRole('button', { name: 'Inter' }))
    expect(setFontFamily).toHaveBeenCalledWith('inter')
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

describe('SettingsPage — Logging', () => {
  it('renders the Weight unit control with lb active by default', () => {
    render(<SettingsPage />)
    const group = within(screen.getByRole('group', { name: 'Weight unit' }))
    expect(group.getByRole('button', { name: 'lb' })).toHaveAttribute('aria-pressed', 'true')
    expect(group.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('tapping kg calls setWeightUnit', () => {
    render(<SettingsPage />)
    const group = within(screen.getByRole('group', { name: 'Weight unit' }))
    fireEvent.click(group.getByRole('button', { name: 'kg' }))
    expect(setWeightUnit).toHaveBeenCalledWith('kg')
  })

  it('reflects weightUnit=kg as the pressed option', () => {
    prefsState.weightUnit = 'kg'
    render(<SettingsPage />)
    const group = within(screen.getByRole('group', { name: 'Weight unit' }))
    expect(group.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true')
    expect(group.getByRole('button', { name: 'lb' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders Week start options with the no-effect-yet caption, Monday active by default', () => {
    render(<SettingsPage />)
    const group = within(screen.getByRole('group', { name: 'Week start' }))
    expect(group.getByRole('button', { name: 'monday' })).toHaveAttribute('aria-pressed', 'true')
    expect(group.getByRole('button', { name: 'sunday' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Used for weekly summaries when they ship — no effect yet.')).toBeInTheDocument()
  })

  it('tapping Sunday calls setWeekStartDay', () => {
    render(<SettingsPage />)
    const group = within(screen.getByRole('group', { name: 'Week start' }))
    fireEvent.click(group.getByRole('button', { name: 'sunday' }))
    expect(setWeekStartDay).toHaveBeenCalledWith('sunday')
  })

  it('renders rest-timer presets with the current default marked active', () => {
    render(<SettingsPage />)
    const group = within(screen.getByRole('group', { name: 'Rest timer default' }))
    expect(group.getByRole('button', { name: '2:00' })).toHaveAttribute('aria-pressed', 'true')
    expect(group.getByRole('button', { name: '1:30' })).toHaveAttribute('aria-pressed', 'false')
    expect(group.getByRole('button', { name: '3:00' })).toBeInTheDocument()
    expect(group.getByRole('button', { name: '5:00' })).toBeInTheDocument()
  })

  it('tapping a preset calls setRestTimerDefaultSeconds', () => {
    render(<SettingsPage />)
    const group = within(screen.getByRole('group', { name: 'Rest timer default' }))
    fireEvent.click(group.getByRole('button', { name: '3:00' }))
    expect(setRestTimerDefaultSeconds).toHaveBeenCalledWith(180)
  })

  it('entering a custom minutes:seconds value and pressing Set calls setRestTimerDefaultSeconds with the combined seconds', () => {
    render(<SettingsPage />)
    fireEvent.change(screen.getByLabelText('Custom minutes'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Custom seconds'), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    expect(setRestTimerDefaultSeconds).toHaveBeenCalledWith(195)
  })

  it('does not call setRestTimerDefaultSeconds for a zero-length custom entry', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    expect(setRestTimerDefaultSeconds).not.toHaveBeenCalled()
  })

  it('the haptics checkbox reflects restTimerHaptics and toggling calls setRestTimerHaptics', () => {
    render(<SettingsPage />)
    const checkbox = screen.getByLabelText('Vibrate when rest timer ends')
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(setRestTimerHaptics).toHaveBeenCalledWith(false)
  })

  it('the showRpe checkbox reflects showRpe and toggling calls setShowRpe', () => {
    render(<SettingsPage />)
    const checkbox = screen.getByLabelText('Show RPE when logging sets')
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(setShowRpe).toHaveBeenCalledWith(false)
  })

  it('the autoFillSets checkbox reflects autoFillSets and toggling calls setAutoFillSets', () => {
    render(<SettingsPage />)
    const checkbox = screen.getByLabelText('Auto-fill later sets')
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(setAutoFillSets).toHaveBeenCalledWith(false)
  })

  it('reflects restTimerHaptics=false and showRpe=false as unchecked', () => {
    prefsState.restTimerHaptics = false
    prefsState.showRpe = false
    render(<SettingsPage />)
    expect(screen.getByLabelText('Vibrate when rest timer ends')).not.toBeChecked()
    expect(screen.getByLabelText('Show RPE when logging sets')).not.toBeChecked()
  })
})
