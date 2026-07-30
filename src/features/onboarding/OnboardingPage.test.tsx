import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingPage } from './OnboardingPage'
import { usePrefs } from '../settings/usePrefs'
import { readPrefs, DEFAULT_PREFS } from '../settings/prefs'

const nav = vi.fn()
const { from } = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('../../data/supabase', () => ({ getSupabase: () => ({ from }) }))

function trackUpdate() {
  const calls: { payload: unknown }[] = []
  from.mockImplementation(() => ({
    update: (payload: unknown) => {
      calls.push({ payload })
      return { eq: () => Promise.resolve({ error: null }) }
    },
  }))
  return calls
}

beforeEach(() => {
  nav.mockReset()
  localStorage.clear()
  usePrefs.setState(readPrefs())
})

describe('OnboardingPage', () => {
  it('finishing with kg selected writes ui_prefs.weightUnit as kg and updates the local store', async () => {
    const calls = trackUpdate()
    render(<OnboardingPage />)

    fireEvent.change(screen.getByLabelText('Units'), { target: { value: 'kg' } })
    fireEvent.click(screen.getByText('Finish'))

    await waitFor(() => expect(calls).toHaveLength(1))
    const payload = calls[0].payload as { units: string; ui_prefs: { weightUnit: string } }
    expect(payload.units).toBe('kg')
    expect(payload.ui_prefs.weightUnit).toBe('kg')
    expect(usePrefs.getState().weightUnit).toBe('kg')
    expect(nav).toHaveBeenCalledWith('/', { replace: true })
  })

  it('finishing with the default lbs writes ui_prefs matching DEFAULT_PREFS in every other field', async () => {
    const calls = trackUpdate()
    render(<OnboardingPage />)

    fireEvent.click(screen.getByText('Finish'))

    await waitFor(() => expect(calls).toHaveLength(1))
    const payload = calls[0].payload as { ui_prefs: typeof DEFAULT_PREFS }
    expect(payload.ui_prefs).toEqual(DEFAULT_PREFS)
  })
})
