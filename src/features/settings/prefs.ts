import type { WeightUnit } from '../../domain/weight'
import type { Units } from '../../domain/types'

export type ConcreteThemeId =
  | 'midnight' | 'navy' | 'gold' | 'evergreen' | 'ember' | 'amoled' | 'contrast' | 'monochrome' | 'daylight' | 'arctic' | 'yuletide'
export type ThemeId = ConcreteThemeId | 'system'
export type FontId = 'system' | 'rounded' | 'mono' | 'inter'
export type ScaleId = 'S' | 'M' | 'L'

export type WeekStartDay = 'monday' | 'sunday'

export interface Prefs {
  theme: ThemeId
  fontFamily: FontId
  fontScale: number
  weightUnit: WeightUnit
  weekStartDay: WeekStartDay
  restTimerDefaultSeconds: number
  restTimerHaptics: boolean
  showRpe: boolean
  /** When true (default), editing a set's weight/reps/duration carries the value forward to
   *  later not-yet-done sets that share the same prescribed target. Turn off to edit each set
   *  independently — see sessionStore's `updateSet`. */
  autoFillSets: boolean
}

export const PREFS_KEY = 'tt-prefs'
export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  fontFamily: 'system',
  fontScale: 1,
  weightUnit: 'lb',
  weekStartDay: 'monday',
  restTimerDefaultSeconds: 120,
  restTimerHaptics: true,
  showRpe: true,
  autoFillSets: true,
}

export const THEMES: { id: ConcreteThemeId; label: string; group: 'core' | 'seasonal'; mode: 'dark' | 'light'; bg: string; surface: string; accent: string }[] = [
  { id: 'midnight', label: 'Midnight', group: 'core', mode: 'dark', bg: '#0a0a0b', surface: '#17171a', accent: '#c3f53c' },
  { id: 'navy', label: 'Royal Navy', group: 'core', mode: 'dark', bg: '#0b1220', surface: '#141d30', accent: '#4d8dff' },
  { id: 'gold', label: 'Old Gold', group: 'core', mode: 'dark', bg: '#0c1526', surface: '#152036', accent: '#e8b23a' },
  { id: 'evergreen', label: 'Evergreen', group: 'core', mode: 'dark', bg: '#0a1410', surface: '#132018', accent: '#3ddc84' },
  { id: 'ember', label: 'Ember', group: 'core', mode: 'dark', bg: '#120a08', surface: '#20130f', accent: '#ff6a1a' },
  { id: 'amoled', label: 'AMOLED Black', group: 'core', mode: 'dark', bg: '#000000', surface: '#0d0d0f', accent: '#00e5a8' },
  { id: 'contrast', label: 'High Contrast', group: 'core', mode: 'dark', bg: '#000000', surface: '#0a0a0a', accent: '#ffe600' },
  { id: 'monochrome', label: 'Monochrome', group: 'core', mode: 'dark', bg: '#0a0a0a', surface: '#161618', accent: '#d4d4d8' },
  { id: 'daylight', label: 'Daylight', group: 'core', mode: 'light', bg: '#f7f7f5', surface: '#ffffff', accent: '#2f6b2f' },
  { id: 'arctic', label: 'Arctic', group: 'core', mode: 'light', bg: '#eef3f8', surface: '#ffffff', accent: '#2f7dd1' },
  { id: 'yuletide', label: 'Yuletide', group: 'seasonal', mode: 'dark', bg: '#0b1410', surface: '#14211a', accent: '#c1121f' },
]

// System resolves to these based on OS preference.
const SYSTEM_DARK: ConcreteThemeId = 'midnight'
const SYSTEM_LIGHT: ConcreteThemeId = 'daylight'

const SYSTEM_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'
const ROUNDED_STACK = 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", system-ui, sans-serif'
const MONO_STACK = 'ui-monospace, "SF Mono", "JetBrains Mono", "Roboto Mono", Menlo, Consolas, monospace'
// Self-hosted via @fontsource-variable/inter (imported in main.tsx). "Inter Variable" is the exact
// @font-face family name the package registers; the system fallback covers first paint (before the
// bundled woff2 loads) and any load failure.
const INTER_STACK = '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'

export const FONTS: { id: FontId; label: string; stack: string }[] = [
  { id: 'system', label: 'System', stack: SYSTEM_STACK },
  { id: 'rounded', label: 'Rounded', stack: ROUNDED_STACK },
  { id: 'mono', label: 'Mono', stack: MONO_STACK },
  { id: 'inter', label: 'Inter', stack: INTER_STACK },
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

/** Field-by-field validation with fallback to `DEFAULT_PREFS`, shared by `readPrefs` (localStorage)
 *  and `usePrefsSync` (the server `ui_prefs` blob) — one validation path means a malformed blob from
 *  either source degrades to defaults per-field, and never throws. */
export function coercePrefs(p: Partial<Prefs>): Prefs {
  return {
    theme: p.theme ?? DEFAULT_PREFS.theme,
    fontFamily: p.fontFamily ?? DEFAULT_PREFS.fontFamily,
    fontScale: typeof p.fontScale === 'number' ? p.fontScale : DEFAULT_PREFS.fontScale,
    weightUnit: p.weightUnit === 'lb' || p.weightUnit === 'kg' ? p.weightUnit : DEFAULT_PREFS.weightUnit,
    weekStartDay: p.weekStartDay === 'monday' || p.weekStartDay === 'sunday' ? p.weekStartDay : DEFAULT_PREFS.weekStartDay,
    restTimerDefaultSeconds:
      typeof p.restTimerDefaultSeconds === 'number' && Number.isFinite(p.restTimerDefaultSeconds) && p.restTimerDefaultSeconds > 0
        ? p.restTimerDefaultSeconds
        : DEFAULT_PREFS.restTimerDefaultSeconds,
    restTimerHaptics: typeof p.restTimerHaptics === 'boolean' ? p.restTimerHaptics : DEFAULT_PREFS.restTimerHaptics,
    showRpe: typeof p.showRpe === 'boolean' ? p.showRpe : DEFAULT_PREFS.showRpe,
    autoFillSets: typeof p.autoFillSets === 'boolean' ? p.autoFillSets : DEFAULT_PREFS.autoFillSets,
  }
}

export function readPrefs(storage: Pick<Storage, 'getItem'> = localStorage): Prefs {
  try {
    const raw = storage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    return coercePrefs(JSON.parse(raw) as Partial<Prefs>)
  } catch {
    return DEFAULT_PREFS
  }
}

/** The single mapping site for the historical 'lbs' (profiles.units, DB) vs 'lb' (Prefs.weightUnit,
 *  client) spelling mismatch. Only ever used to seed weightUnit *from* units (never the reverse) —
 *  see usePrefsSync's seed-up path and OnboardingPage.finish(). Accepts null/undefined defensively
 *  (profiles.units is NOT NULL DEFAULT 'lbs' in practice, so a real row never actually passes null —
 *  this covers a hand-edited/legacy row or a caller outside the DB boundary). */
export function unitsToWeightUnit(units: Units | null | undefined): WeightUnit {
  if (units === 'lbs') return 'lb'
  if (units === 'kg') return 'kg'
  return 'lb'
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
