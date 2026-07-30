import { useEffect, useRef } from 'react'
import { useAuth } from '../../lib/useAuth'
import { useProfile } from '../../data/profile'
import { getSupabase } from '../../data/supabase'
import { initPrefs, usePrefs } from './usePrefs'
import { coercePrefs, unitsToWeightUnit, writePrefs, DEFAULT_PREFS, type Prefs } from './prefs'

/** Extracts the plain `Prefs` fields out of the zustand store's full state (which also carries the
 *  setter actions) — same rest-destructure-to-omit idiom as usePrefs.ts's `persistApply` (the
 *  eslint config's `ignoreRestSiblings: true` covers this pattern; no eslint-disable needed). */
function extractPrefs(state: ReturnType<typeof usePrefs.getState>): Prefs {
  const {
    setTheme, setFontFamily, setFontScale, setWeightUnit,
    setWeekStartDay, setRestTimerDefaultSeconds, setRestTimerHaptics, setShowRpe,
    ...prefsOnly
  } = state
  return prefsOnly
}

/** Hydrates `usePrefs` from the signed-in user's `profiles` row on session-ready, then keeps the
 *  server in sync with local changes (write-through — added in a later task on this same hook).
 *  Sources the row from the existing `useProfile(userId)` react-query hook rather than a bespoke
 *  fetch: react-query owns the row's create/refetch lifecycle (so hydrate can't race the row's
 *  creation), and gating on `onboarding_complete` keeps this hook inert until `OnboardingPage`'s own
 *  `ui_prefs` write has landed (so it can't race that write either). Mount exactly once, for the
 *  app's lifetime, inside `AppQueryProvider` — see `App.tsx`'s `PrefsSyncMount`. `usePrefs` itself
 *  stays server-agnostic; all Supabase I/O lives here. */
export function usePrefsSync(): void {
  const { user } = useAuth()
  const userId = user?.id
  const { data: profile } = useProfile(userId)

  // Tracks which userId has completed hydrate — gates write-through (next task) so a change can
  // never write to the server before/without this user's hydrate having run, and lets a new user
  // re-hydrate instead of inheriting a previous user's completed-hydrate state.
  const hydratedUserIdRef = useRef<string | undefined>(undefined)
  const prevUserIdRef = useRef<string | undefined>(undefined)
  const hasRunOnceRef = useRef(false)

  // Reset-on-switch/sign-out. Keyed on the `userId` primitive, not the `user` object — Supabase
  // fires TOKEN_REFRESHED roughly hourly with a NEW session/user object for the SAME id, and a
  // dependency on the object would tear this down and reset a live user's prefs for no reason.
  useEffect(() => {
    const prev = prevUserIdRef.current
    const isRealTransition = hasRunOnceRef.current && prev !== userId
    hasRunOnceRef.current = true
    if (isRealTransition) {
      hydratedUserIdRef.current = undefined
      // Reset to defaults on sign-out (userId undefined) or switching to a *different* real user —
      // but NOT on the very first sign-in (prev undefined -> an id), which must seed up the user's
      // genuine local prefs rather than stomp them with defaults.
      if (prev !== undefined) {
        usePrefs.setState(DEFAULT_PREFS)
        writePrefs(DEFAULT_PREFS)
      }
    }
    prevUserIdRef.current = userId
  }, [userId])

  // Hydrate. Gated on: signed in, profile data present, onboarding complete, not yet hydrated for
  // this userId. Before onboarding_complete (signed out, row not yet created, or mid-onboarding)
  // this is a no-op and localStorage prefs stand, exactly as today.
  useEffect(() => {
    if (!userId || !profile || !profile.onboarding_complete) return
    if (hydratedUserIdRef.current === userId) return

    if (profile.ui_prefs != null) {
      // Server-wins: a previously-synced device already has a canonical blob.
      const validated = coercePrefs(profile.ui_prefs)
      usePrefs.setState(validated)
      writePrefs(validated)
      initPrefs() // re-applies theme/font/scale to the DOM — bare setState doesn't
      // Mark hydrated LAST: the setState above already notified write-through's subscriber (next
      // task) synchronously, and it must see hydratedUserIdRef still unset for *this*
      // self-triggered notification so it doesn't immediately echo the just-hydrated value back.
      hydratedUserIdRef.current = userId
    } else {
      // First sync for this user: seed the server from local, reconciling the dead `units`
      // onboarding column into weightUnit (profiles.units is NOT NULL DEFAULT 'lbs', so this is
      // always a real string for any row that has actually been onboarded).
      const local = extractPrefs(usePrefs.getState())
      const seed: Prefs = { ...local, weightUnit: unitsToWeightUnit(profile.units) }
      usePrefs.setState(seed)
      writePrefs(seed)
      initPrefs()
      hydratedUserIdRef.current = userId
      getSupabase().from('profiles').update({ ui_prefs: seed }).eq('id', userId)
        .then(({ error }) => {
          if (error) console.error('usePrefsSync: seed write failed', error)
        })
    }
  }, [userId, profile])
}
