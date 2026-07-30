import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

/** Like `trackUpdates`, but the first `failCount` `.update(...).eq(...)` calls against `profiles`
 *  resolve with an error before subsequent calls succeed — lets tests exercise the write-through's
 *  one-time retry without a bespoke mock per test. */
function trackFlakyUpdates(failCount: number) {
  const calls: { id: string; payload: unknown }[] = []
  let resolvedCount = 0
  from.mockImplementation((table: string) => {
    let pendingPayload: unknown
    const builder = {
      update: (payload: unknown) => { pendingPayload = payload; return builder },
      eq: (_col: string, id: string) => {
        if (table === 'profiles') calls.push({ id, payload: pendingPayload })
        return builder
      },
      then: (resolve: (v: { error: Error | null }) => unknown) => {
        resolvedCount += 1
        const error = resolvedCount <= failCount ? new Error('transient write failure') : null
        return Promise.resolve({ error }).then(resolve)
      },
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

describe('usePrefsSync — pre-migration: ui_prefs column absent', () => {
  it('stays fully inert (no seed-up, no write-through) until the column exists, then recovers on refetch', async () => {
    // Local prefs are the user's real, already-customized state — must survive untouched.
    usePrefs.setState({ ...DEFAULT_PREFS, weightUnit: 'kg' })
    const updateCalls = trackUpdates()
    // Pre-migration 0016: select('*') on a backend without the column omits the key entirely
    // (not null — absent). Constructed deliberately without a `ui_prefs` property.
    useProfileMock.mockReturnValue(profileResult({
      units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { rerender, unmount } = renderHook(() => usePrefsSync())
    await act(async () => { await Promise.resolve() })

    // No seed-up: if the hook had wrongly taken the seed-up branch, weightUnit would be
    // overwritten to 'lb' via unitsToWeightUnit(profile.units) and an update would fire.
    expect(usePrefs.getState().weightUnit).toBe('kg')
    expect(updateCalls).toHaveLength(0)

    // Not marked hydrated => write-through must not be armed either.
    vi.useFakeTimers()
    act(() => { usePrefs.getState().setFontFamily('mono') })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(updateCalls).toHaveLength(0)
    vi.useRealTimers()

    // Recovery: migration lands, a later refetch's row now includes the column (null = never
    // synced from any device) — hydrate should now run its seed-up branch.
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: null, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))
    rerender()

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    expect(updateCalls[0].id).toBe('user-1')

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

describe('usePrefsSync — sign-out reset', () => {
  it('resets to DEFAULT_PREFS on plain sign-out (userId -> null), not just on account switch', async () => {
    usePrefs.setState({ ...DEFAULT_PREFS, theme: 'navy', fontFamily: 'mono' })
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS, theme: 'navy', fontFamily: 'mono' }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { rerender, unmount } = renderHook(() => usePrefsSync())
    await waitFor(() => expect(usePrefs.getState().theme).toBe('navy'))

    // Sign out: userId goes from 'user-1' to undefined.
    useAuthMock.mockReturnValue({ user: null })
    useProfileMock.mockReturnValue(profileResult(undefined))
    rerender()

    await waitFor(() => expect(usePrefs.getState().theme).toBe(DEFAULT_PREFS.theme))
    expect(usePrefs.getState().fontFamily).toBe(DEFAULT_PREFS.fontFamily)

    unmount()
  })
})

describe('usePrefsSync — reset repaints the DOM (regression: bare setState skips apply())', () => {
  beforeEach(() => {
    // Deterministic "system" resolution: prefers-light -> 'daylight'. Without this stub jsdom has
    // no matchMedia and systemPrefersDark() falls back to dark, which would also work but this
    // makes the expected resolved theme explicit rather than incidental.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sign-out reset re-applies the DOM, not just the store (previous user\'s theme must not linger on screen)', async () => {
    const updateCalls = trackUpdates()
    usePrefs.setState({ ...DEFAULT_PREFS, theme: 'navy', fontFamily: 'mono' })
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS, theme: 'navy', fontFamily: 'mono' }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { rerender, unmount } = renderHook(() => usePrefsSync())
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('navy'))
    updateCalls.length = 0 // clear the seed/hydrate bookkeeping noise; only the reset's writes matter below

    // Sign out: userId goes from 'user-1' to undefined.
    useAuthMock.mockReturnValue({ user: null })
    useProfileMock.mockReturnValue(profileResult(undefined))
    rerender()

    await waitFor(() => expect(usePrefs.getState().theme).toBe(DEFAULT_PREFS.theme))
    // The bug: `usePrefs.setState(DEFAULT_PREFS)` alone updates the store but never calls
    // apply()/initPrefs(), so the DOM would still show 'navy' here. The fix's initPrefs() call
    // must repaint it to the resolved default ('system' + prefers-light -> 'daylight').
    expect(document.documentElement.dataset.theme).toBe('daylight')
    // The reset itself must not write to the server (no cross-user write).
    expect(updateCalls).toHaveLength(0)

    unmount()
  })

  it('user-switch reset re-applies the DOM before the new user\'s seed-up runs', async () => {
    const updateCalls = trackUpdates()
    usePrefs.setState({ ...DEFAULT_PREFS, theme: 'navy', fontFamily: 'mono' })
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS, theme: 'navy', fontFamily: 'mono' }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { rerender, unmount } = renderHook(() => usePrefsSync())
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('navy'))

    // Switch to user-2: onboarded, never synced (ui_prefs null) — reset must repaint to the
    // default DOM state before user-2's own hydrate/seed-up takes over.
    useAuthMock.mockReturnValue({ user: { id: 'user-2' } })
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: null, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))
    rerender()

    await waitFor(() => expect(updateCalls.some(c => c.id === 'user-2')).toBe(true))
    // user-2's seeded-up payload is DEFAULT_PREFS-derived, never navy/mono — confirms the reset
    // (including its DOM repaint) ran and stuck before the new user's data landed.
    expect(document.documentElement.dataset.theme).toBe('daylight')

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

  it('a single change fires exactly one debounced update after the window', async () => {
    const updateCalls = trackUpdates()
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { unmount } = renderHook(() => usePrefsSync())
    await waitFor(() => expect(usePrefs.getState().theme).toBe(DEFAULT_PREFS.theme))

    vi.useFakeTimers()
    act(() => { usePrefs.getState().setTheme('gold') })
    act(() => { vi.advanceTimersByTime(500) })

    expect(updateCalls).toHaveLength(1)
    expect((updateCalls[0].payload as { ui_prefs: Prefs }).ui_prefs.theme).toBe('gold')

    vi.useRealTimers()
    unmount()
  })

  it('unmounting before the debounce window elapses clears the pending timer, so no late update fires', async () => {
    const updateCalls = trackUpdates()
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { unmount } = renderHook(() => usePrefsSync())
    await waitFor(() => expect(usePrefs.getState().theme).toBe(DEFAULT_PREFS.theme))

    vi.useFakeTimers()
    act(() => { usePrefs.getState().setTheme('gold') }) // starts a pending debounce timer
    expect(updateCalls).toHaveLength(0) // still inside the debounce window

    unmount() // effect cleanup must clear the pending timer, not just unsubscribe

    act(() => { vi.advanceTimersByTime(1000) }) // well past the 500ms window
    expect(updateCalls).toHaveLength(0) // the cancelled write never fires

    vi.useRealTimers()
  })
})

describe('usePrefsSync — write-through retry', () => {
  it('a transient write failure triggers exactly one retry that then succeeds', async () => {
    const updateCalls = trackFlakyUpdates(1) // first .update() call fails, the retry succeeds
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { unmount } = renderHook(() => usePrefsSync())
    await waitFor(() => expect(usePrefs.getState().theme).toBe(DEFAULT_PREFS.theme))

    vi.useFakeTimers()
    act(() => { usePrefs.getState().setTheme('gold') })
    await vi.advanceTimersByTimeAsync(500) // debounce fires; this write fails
    expect(updateCalls).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1000) // the one retry fires ~1s later, and succeeds
    expect(updateCalls).toHaveLength(2)
    expect((updateCalls[1].payload as { ui_prefs: Prefs }).ui_prefs.theme).toBe('gold')

    // No further retries follow a success.
    await vi.advanceTimersByTimeAsync(5000)
    expect(updateCalls).toHaveLength(2)

    vi.useRealTimers()
    unmount()
  })

  it('a write that fails on both the original attempt and the retry logs once and stops (no retry loop)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const updateCalls = trackFlakyUpdates(2) // original attempt AND the retry both fail
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { unmount } = renderHook(() => usePrefsSync())
    await waitFor(() => expect(usePrefs.getState().theme).toBe(DEFAULT_PREFS.theme))

    vi.useFakeTimers()
    act(() => { usePrefs.getState().setTheme('gold') })
    await vi.advanceTimersByTimeAsync(500)
    expect(updateCalls).toHaveLength(1)
    expect(consoleErrorSpy).not.toHaveBeenCalled() // first failure is silent — the retry hasn't run yet

    await vi.advanceTimersByTimeAsync(1000)
    expect(updateCalls).toHaveLength(2)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith('usePrefsSync: write-through failed', expect.any(Error))

    await vi.advanceTimersByTimeAsync(5000) // stays failed — must not keep retrying forever
    expect(updateCalls).toHaveLength(2)

    vi.useRealTimers()
    consoleErrorSpy.mockRestore()
    unmount()
  })

  it('does not retry against a stale user after the user changes before the retry fires', async () => {
    const updateCalls = trackFlakyUpdates(1)
    useProfileMock.mockReturnValue(profileResult({
      ui_prefs: { ...DEFAULT_PREFS }, units: 'lbs', onboarding_complete: true,
    } as ProfileRow))

    const { rerender, unmount } = renderHook(() => usePrefsSync())
    await waitFor(() => expect(usePrefs.getState().theme).toBe(DEFAULT_PREFS.theme))

    vi.useFakeTimers()
    act(() => { usePrefs.getState().setTheme('gold') })
    await vi.advanceTimersByTimeAsync(500) // debounce fires; this write fails; retry now pending
    expect(updateCalls).toHaveLength(1)

    // user-1 signs out before the retry timer fires — the write-through effect tears down.
    useAuthMock.mockReturnValue({ user: null })
    useProfileMock.mockReturnValue(profileResult(undefined))
    rerender()

    await vi.advanceTimersByTimeAsync(5000) // well past the retry delay
    expect(updateCalls).toHaveLength(1) // the pending retry must not have fired post-teardown

    vi.useRealTimers()
    unmount()
  })
})
