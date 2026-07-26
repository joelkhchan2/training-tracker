export type ConcreteThemeId =
  | 'midnight' | 'navy' | 'gold' | 'evergreen' | 'ember' | 'amoled' | 'contrast' | 'daylight' | 'yuletide'
export type ThemeId = ConcreteThemeId | 'system'
export type FontId = 'system' | 'rounded' | 'mono'
export type ScaleId = 'S' | 'M' | 'L'

export interface Prefs {
  theme: ThemeId
  fontFamily: FontId
  fontScale: number
}

export const PREFS_KEY = 'tt-prefs'
export const DEFAULT_PREFS: Prefs = { theme: 'system', fontFamily: 'system', fontScale: 1 }

export const THEMES: { id: ConcreteThemeId; label: string; group: 'core' | 'seasonal'; mode: 'dark' | 'light'; bg: string }[] = [
  { id: 'midnight', label: 'Midnight', group: 'core', mode: 'dark', bg: '#0a0a0b' },
  { id: 'navy', label: 'Royal Navy', group: 'core', mode: 'dark', bg: '#0b1220' },
  { id: 'gold', label: 'Old Gold', group: 'core', mode: 'dark', bg: '#0c1526' },
  { id: 'evergreen', label: 'Evergreen', group: 'core', mode: 'dark', bg: '#0a1410' },
  { id: 'ember', label: 'Ember', group: 'core', mode: 'dark', bg: '#120a08' },
  { id: 'amoled', label: 'AMOLED Black', group: 'core', mode: 'dark', bg: '#000000' },
  { id: 'contrast', label: 'High Contrast', group: 'core', mode: 'dark', bg: '#000000' },
  { id: 'daylight', label: 'Daylight', group: 'core', mode: 'light', bg: '#f7f7f5' },
  { id: 'yuletide', label: 'Yuletide', group: 'seasonal', mode: 'dark', bg: '#0b1410' },
]

// System resolves to these based on OS preference.
const SYSTEM_DARK: ConcreteThemeId = 'midnight'
const SYSTEM_LIGHT: ConcreteThemeId = 'daylight'

const SYSTEM_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'
const ROUNDED_STACK = 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", system-ui, sans-serif'
const MONO_STACK = 'ui-monospace, "SF Mono", "JetBrains Mono", "Roboto Mono", Menlo, Consolas, monospace'

export const FONTS: { id: FontId; label: string; stack: string }[] = [
  { id: 'system', label: 'System', stack: SYSTEM_STACK },
  { id: 'rounded', label: 'Rounded', stack: ROUNDED_STACK },
  { id: 'mono', label: 'Mono', stack: MONO_STACK },
]

export const SCALES: { id: ScaleId; label: string; value: number }[] = [
  { id: 'S', label: 'Small', value: 0.9 },
  { id: 'M', label: 'Medium', value: 1 },
  { id: 'L', label: 'Large', value: 1.2 },
]

export function resolveTheme(theme: ThemeId, systemPrefersDark: boolean): ConcreteThemeId {
  if (theme === 'system') return systemPrefersDark ? SYSTEM_DARK : SYSTEM_LIGHT
  return THEMES.some(t => t.id === theme) ? theme : SYSTEM_DARK
}

export function fontStack(id: FontId): string {
  return (FONTS.find(f => f.id === id) ?? FONTS[0]).stack
}

export function readPrefs(storage: Pick<Storage, 'getItem'> = localStorage): Prefs {
  try {
    const raw = storage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const p = JSON.parse(raw) as Partial<Prefs>
    return {
      theme: p.theme ?? DEFAULT_PREFS.theme,
      fontFamily: p.fontFamily ?? DEFAULT_PREFS.fontFamily,
      fontScale: typeof p.fontScale === 'number' ? p.fontScale : DEFAULT_PREFS.fontScale,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writePrefs(prefs: Prefs, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore quota / unavailable storage
  }
}

export function applyPrefs(
  root: { dataset: { theme?: string }; style: { setProperty(k: string, v: string): void } },
  setMetaThemeColor: (hex: string) => void,
  prefs: Prefs,
  systemPrefersDark: boolean,
): void {
  const id = resolveTheme(prefs.theme, systemPrefersDark)
  root.dataset.theme = id
  root.style.setProperty('--font-scale', String(prefs.fontScale))
  root.style.setProperty('--font-sans', fontStack(prefs.fontFamily))
  const bg = (THEMES.find(t => t.id === id) ?? THEMES[0]).bg
  setMetaThemeColor(bg)
}
