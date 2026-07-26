import { create } from 'zustand'
import { applyPrefs, readPrefs, writePrefs, type FontId, type Prefs, type ThemeId } from './prefs'

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
}

export const usePrefs = create<PrefsState>((set, get) => {
  const persistApply = (patch: Partial<Prefs>) => {
    const next: Prefs = { theme: get().theme, fontFamily: get().fontFamily, fontScale: get().fontScale, ...patch }
    apply(next)
    writePrefs(next)
    set(patch)
  }
  return {
    ...readPrefs(),
    setTheme: (theme) => persistApply({ theme }),
    setFontFamily: (fontFamily) => persistApply({ fontFamily }),
    setFontScale: (fontScale) => persistApply({ fontScale }),
  }
})

let listening = false
/** Apply current prefs and register a live listener so a "System" choice tracks OS changes. Call
 *  once at app start. The index.html boot script already applied the initial DOM state; this keeps
 *  the meta theme-color + font vars in sync and wires the matchMedia listener. */
export function initPrefs(): void {
  const { theme, fontFamily, fontScale } = usePrefs.getState()
  apply({ theme, fontFamily, fontScale })
  if (listening || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  listening = true
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const s = usePrefs.getState()
    if (s.theme === 'system') apply({ theme: s.theme, fontFamily: s.fontFamily, fontScale: s.fontScale })
  })
}
