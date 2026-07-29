import { create } from 'zustand'
import { applyPrefs, readPrefs, writePrefs, type FontId, type Prefs, type ThemeId, type WeekStartDay } from './prefs'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true
}

function ensureThemeColorMeta(): (hex: string) => void {
  return (hex: string) => {
    if (typeof document === 'undefined') return
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = hex
  }
}

function apply(prefs: Prefs) {
  if (typeof document === 'undefined') return
  applyPrefs(document.documentElement, ensureThemeColorMeta(), prefs, systemPrefersDark())
}

interface PrefsState extends Prefs {
  setTheme: (theme: ThemeId) => void
  setFontFamily: (fontFamily: FontId) => void
  setFontScale: (fontScale: number) => void
  setWeekStartDay: (weekStartDay: WeekStartDay) => void
  setRestTimerDefaultSeconds: (restTimerDefaultSeconds: number) => void
  setRestTimerHaptics: (restTimerHaptics: boolean) => void
  setShowRpe: (showRpe: boolean) => void
}

export const usePrefs = create<PrefsState>((set, get) => {
  // Spreads full current state + patch, NOT a hand-enumerated field list — this is the
  // Phase 1 fix. The old `{ theme: get().theme, fontFamily: get().fontFamily, fontScale:
  // get().fontScale, ...patch }` silently dropped any field added to Prefs that wasn't
  // named here (it would revert to `undefined` on the next unrelated setter call). Spreading
  // `get()` keeps every field — old and new — correct with zero further changes as Prefs grows.
  //
  // Destructure the setter functions out of `get()` first rather than `{ ...get(), ...patch }`
  // directly: `get()` returns the full PrefsState (Prefs fields + setter functions), and
  // spreading it straight into a `Prefs`-typed `next` would carry the setter functions along
  // as extra (structurally harmless but semantically wrong) properties. Destructuring leaves
  // `prefsOnly` as a real Prefs-shaped value at runtime, not just at the type level.
  const persistApply = (patch: Partial<Prefs>) => {
    const {
      setTheme,
      setFontFamily,
      setFontScale,
      setWeekStartDay,
      setRestTimerDefaultSeconds,
      setRestTimerHaptics,
      setShowRpe,
      ...prefsOnly
    } = get()
    const next: Prefs = { ...prefsOnly, ...patch }
    apply(next)
    writePrefs(next)
    set(patch)
  }
  return {
    ...readPrefs(),
    setTheme: (theme) => persistApply({ theme }),
    setFontFamily: (fontFamily) => persistApply({ fontFamily }),
    setFontScale: (fontScale) => persistApply({ fontScale }),
    setWeekStartDay: (weekStartDay) => persistApply({ weekStartDay }),
    setRestTimerDefaultSeconds: (restTimerDefaultSeconds) => persistApply({ restTimerDefaultSeconds }),
    setRestTimerHaptics: (restTimerHaptics) => persistApply({ restTimerHaptics }),
    setShowRpe: (showRpe) => persistApply({ showRpe }),
  }
})

let listening = false
/** Apply current prefs and register a live listener so a "System" choice tracks OS changes. Call
 *  once at app start. The index.html boot script already applied the initial DOM state; this keeps
 *  the meta theme-color + font vars in sync and wires the matchMedia listener. */
export function initPrefs(): void {
  // Pass the full PrefsState through (it structurally satisfies Prefs) rather than
  // hand-picking theme/fontFamily/fontScale — same required-field ripple as persistApply:
  // that hand-picked literal stopped type-checking once Prefs gained 4 more required
  // fields. apply()/applyPrefs() only ever read theme/fontFamily/fontScale, so this is a
  // type-level fix only, not a behavior change.
  apply(usePrefs.getState())
  if (listening || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  listening = true
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const s = usePrefs.getState()
    if (s.theme === 'system') apply(s)
  })
}
