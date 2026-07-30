import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrefs } from './usePrefs'
import { readPrefs, DEFAULT_PREFS, type Prefs } from './prefs'
import { usePrefsSync } from './usePrefsSync'
import type { ProfileRow } from '../../data/types'

const { useAuthMock, useProfileMock, from } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useProfileMock: vi.fn(),
  from: vi.fn(),
}))

vi.mock('../../lib/useAuth', () => ({ useAuth: useAuthMock }))
vi.mock('../../data/profile', () => ({ useProfile: useProfileMock }))
vi.mock('../../data/supabase', () => ({ getSupabase: () => ({ from }) }))

/** Records every `.update(payload).eq('id', id)` call against `profiles`. */
function trackUpdates() {
  const calls: { id: string; payload: unknown }[] = []
  from.mockImplementation((table: string) => {
    let pendingPayload: unknown
    const builder = {
      update: (payload: unknown) => { pendingPayload = payload; return builder },
      eq: (_col: string, id: string) => {
        if (table === 'profiles') calls.push({ id, payload: pendingPayload })
        return builder
      },
      then: (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
    }
    return builder
  })
  return calls
}

/** Shapes a `useProfile`-style react-query result. Callers only ever need `data` plus the
 *  loading/error flags this hook actually branches on. */
function profileResult(data: Partial<ProfileRow> | undefined, overrides: Record<string, unknown> = {}) {
  return { data, isLoading: !data, isError: false, error: null, ...overrides }
}

beforeEach(() => {
  localStorage.clear()
  usePrefs.setState(readPrefs())
  useAuthMock.mockReturnValue({ user: { id: 'user-1' } })
  useProfileMock.mockReturnValue(profileResult(undefined))
})

describe('usePrefsSync — hydrate: server-wins', () => {
  it('applies a non-null server ui_prefs to the store and localStorage once onboarding is complete', async () => {
    const updateCalls = trackUpdates()
    const serverPrefs: Prefs = { ...DEFAULT_PREFS, theme: 'navy', weightUnit: 'kg' }
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: serverPrefs, units: 'kg', onboarding_complete: true,
    } as ProfileRow))

    const { unmount } = renderHook(() => usePrefsSync())

    await waitFor(() => expect(usePrefs.getState().theme).toBe('navy'))
    expect(usePrefs.getState().weightUnit).toBe('kg')
    expect(JSON.parse(localStorage.getItem('tt-prefs')!).theme).toBe('navy')
    expect(updateCalls).toHaveLength(0)

    unmount()
  })
})

describe('usePrefsSync — hydrate: seed-up', () => {
  it('null ui_prefs + units:"kg" seeds the server with local prefs, weightUnit overridden to kg', async () => {
    localStorage.setItem('tt-prefs', JSON.stringify({ ...DEFAULT_PREFS, theme: 'gold' }))
    usePrefs.setState(readPrefs())
    const updateCalls = trackUpdates()
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: null, units: 'kg', onboarding_complete: true,
    } as ProfileRow))

    const { unmount } = renderHook(() => usePrefsSync())

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    expect(updateCalls[0].id).toBe('user-1')
    expect((updateCalls[0].payload as { ui_prefs: Prefs }).ui_prefs).toEqual({
      ...DEFAULT_PREFS, theme: 'gold', weightUnit: 'kg',
    })
    expect(usePrefs.getState().weightUnit).toBe('kg')

    unmount()
  })

  it('null ui_prefs with the DB default units:"lbs" seeds weightUnit as lb (the common case: a user who never touched Settings before this feature existed)', async () => {
    const updateCalls = trackUpdates()
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: null, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { unmount } = renderHook(() => usePrefsSync())

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    expect((updateCalls[0].payload as { ui_prefs: Prefs }).ui_prefs).toEqual(DEFAULT_PREFS)

    unmount()
  })
})

describe('usePrefsSync — gate: not yet onboarded / no row yet', () => {
  it('does not hydrate or write while onboarding_complete is false, even with a non-null ui_prefs', async () => {
    const updateCalls = trackUpdates()
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS, theme: 'navy' }, units: 'lbs', onboarding_complete: false,
    } as ProfileRow))

    const { unmount } = renderHook(() => usePrefsSync())
    await act(async () => { await Promise.resolve() })

    expect(usePrefs.getState().theme).toBe(DEFAULT_PREFS.theme)
    expect(updateCalls).toHaveLength(0)

    unmount()
  })

  it('does not hydrate while the profile query has no data yet (row not created / query loading)', async () => {
    const updateCalls = trackUpdates()
    useProfileMock.mockReturnValue(profileResult(undefined, { isLoading: true }))

    const { unmount } = renderHook(() => usePrefsSync())
    await act(async () => { await Promise.resolve() })

    expect(usePrefs.getState().theme).toBe(DEFAULT_PREFS.theme)
    expect(updateCalls).toHaveLength(0)

    unmount()
  })
})

describe('usePrefsSync — profile query error', () => {
  it('stays un-hydrated on a useProfile error, then hydrates once a refetch succeeds', async () => {
    const updateCalls = trackUpdates()
    useProfileMock.mockReturnValue(profileResult(undefined, { isError: true, error: new Error('network down') }))

    const { rerender, unmount } = renderHook(() => usePrefsSync())
    await act(async () => { await Promise.resolve() })
    expect(usePrefs.getState().theme).toBe(DEFAULT_PREFS.theme) // untouched, no crash

    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS, theme: 'ember' }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))
    rerender()

    await waitFor(() => expect(usePrefs.getState().theme).toBe('ember'))
    expect(updateCalls).toHaveLength(0)

    unmount()
  })
})

describe('usePrefsSync — user switch reset (shared-device account switch)', () => {
  it('resets to DEFAULT_PREFS on switching to a different, already-onboarded user, then seeds THAT user\'s defaults (units-adjusted), never the prior user\'s prefs', async () => {
    // user-1 is customized locally and hydrates server-wins to that customization.
    usePrefs.setState({ ...DEFAULT_PREFS, theme: 'navy', fontFamily: 'mono' })
    const updateCalls = trackUpdates()
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS, theme: 'navy', fontFamily: 'mono' }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { rerender, unmount } = renderHook(() => usePrefsSync())
    await waitFor(() => expect(usePrefs.getState().theme).toBe('navy'))

    // Switch to user-2: onboarded, units:'kg', but never synced (ui_prefs still null server-side).
    useAuthMock.mockReturnValue({ user: { id: 'user-2' } })
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: null, units: 'kg', onboarding_complete: true,
    } as ProfileRow))
    rerender()

    await waitFor(() => expect(updateCalls.some(c => c.id === 'user-2')).toBe(true))

    // The local store must have been reset to DEFAULT_PREFS *before* user-2's seed-up ran, so the
    // uploaded seed is DEFAULTS (units-adjusted to kg) — never user-1's navy/mono customization.
    const user2Update = updateCalls.find(c => c.id === 'user-2')!
    expect((user2Update.payload as { ui_prefs: Prefs }).ui_prefs).toEqual({ ...DEFAULT_PREFS, weightUnit: 'kg' })
    expect(usePrefs.getState().theme).toBe(DEFAULT_PREFS.theme)
    expect(usePrefs.getState().weightUnit).toBe('kg')

    unmount()
  })
})

describe('usePrefsSync — token refresh does not re-hydrate', () => {
  it('a new `user` object with the same id (e.g. TOKEN_REFRESHED) does not reset or re-hydrate', async () => {
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS, theme: 'navy' }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { rerender, unmount } = renderHook(() => usePrefsSync())
    await waitFor(() => expect(usePrefs.getState().theme).toBe('navy'))

    // A local change, then a "token refresh": a brand-new `user` object, but the SAME id.
    usePrefs.getState().setTheme('gold')
    useAuthMock.mockReturnValue({ user: { id: 'user-1' } }) // new object reference, same id
    rerender()
    await act(async () => { await Promise.resolve() })

    // If the effect were keyed on the `user` object, this rerender would look like a user switch
    // (reset to defaults) or re-run hydrate (server-wins back to 'navy') — neither may happen.
    expect(usePrefs.getState().theme).toBe('gold')

    unmount()
  })
})

describe('usePrefsSync — write-through', () => {
  it('debounces rapid changes into a single update after hydrate, coalescing the payload', async () => {
    const updateCalls = trackUpdates()
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { unmount } = renderHook(() => usePrefsSync())
    await waitFor(() => expect(usePrefs.getState().theme).toBe(DEFAULT_PREFS.theme))
    expect(updateCalls).toHaveLength(0) // server-wins hydrate itself never writes

    vi.useFakeTimers()
    act(() => {
      usePrefs.getState().setTheme('gold')
      usePrefs.getState().setFontFamily('mono')
    })
    expect(updateCalls).toHaveLength(0) // still inside the debounce window
    act(() => { vi.advanceTimersByTime(500) })

    expect(updateCalls).toHaveLength(1) // two changes coalesced into one write
    const payload = updateCalls[0].payload as { ui_prefs: Prefs }
    expect(payload.ui_prefs.theme).toBe('gold')
    expect(payload.ui_prefs.fontFamily).toBe('mono')

    vi.useRealTimers()
    unmount()
  })

  it('does not write a change made before hydrate resolves, even after the debounce window elapses', async () => {
    const updateCalls = trackUpdates()
    useProfileMock.mockReturnValue(profileResult(undefined, { isLoading: true }))

    const { rerender, unmount } = renderHook(() => usePrefsSync())

    vi.useFakeTimers()
    act(() => { usePrefs.getState().setTheme('gold') }) // pre-hydrate change (userId exists, so
    act(() => { vi.advanceTimersByTime(1000) })          // write-through IS subscribed — must still gate)
    expect(updateCalls).toHaveLength(0)

    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS, theme: 'gold' }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))
    rerender()
    await act(async () => { await Promise.resolve() })

    expect(updateCalls).toHaveLength(0) // server-wins hydrate doesn't write; the dropped change isn't replayed

    vi.useRealTimers()
    unmount()
  })
})
