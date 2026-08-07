import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readPrefs } from './prefs'
import { usePrefs } from './usePrefs'

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
  localStorage.clear()
  document.documentElement.dataset.theme = ''
  document.documentElement.removeAttribute('style')
})

describe('usePrefs — init from storage', () => {
  it('initializes state from localStorage at module load', async () => {
    localStorage.setItem('tt-prefs', JSON.stringify({ theme: 'gold', fontFamily: 'mono', fontScale: 1.2 }))
    vi.resetModules()
    const { usePrefs: freshUsePrefs } = await import('./usePrefs')
    expect(freshUsePrefs.getState().theme).toBe('gold')
    expect(freshUsePrefs.getState().fontFamily).toBe('mono')
    expect(freshUsePrefs.getState().fontScale).toBe(1.2)
  })
})

describe('usePrefs — setTheme', () => {
  beforeEach(() => {
    usePrefs.setState(readPrefs())
  })

  it('updates state, DOM dataset, and localStorage', () => {
    usePrefs.getState().setTheme('navy')

    expect(usePrefs.getState().theme).toBe('navy')
    expect(document.documentElement.dataset.theme).toBe('navy')
    expect(JSON.parse(localStorage.getItem('tt-prefs')!).theme).toBe('navy')
  })
})

describe('usePrefs — setFontScale', () => {
  beforeEach(() => {
    usePrefs.setState(readPrefs())
  })

  it('sets the --font-scale CSS variable', () => {
    usePrefs.getState().setFontScale(1.2)

    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.2')
  })
})

describe('usePrefs — persistApply spreads full state (regression guard for the hand-enumerated-fields bug)', () => {
  beforeEach(() => {
    usePrefs.setState(readPrefs())
  })

  it('setting showRpe does not drop a restTimerDefaultSeconds set immediately before it', () => {
    usePrefs.getState().setRestTimerDefaultSeconds(180)
    usePrefs.getState().setShowRpe(false)

    expect(usePrefs.getState().restTimerDefaultSeconds).toBe(180)
    expect(JSON.parse(localStorage.getItem('tt-prefs')!).restTimerDefaultSeconds).toBe(180)

    const persisted = JSON.parse(localStorage.getItem('tt-prefs')!)
    expect(Object.keys(persisted).sort()).toEqual(
      ['autoFillSets', 'autoFillSetsByExercise', 'fontFamily', 'fontScale', 'restTimerDefaultSeconds', 'restTimerHaptics', 'showRpe', 'theme', 'weekStartDay', 'weightUnit'],
    )
  })
})

describe('usePrefs — new P1 setters', () => {
  beforeEach(() => {
    usePrefs.setState(readPrefs())
  })

  it('setWeekStartDay updates state and persists', () => {
    usePrefs.getState().setWeekStartDay('sunday')
    expect(usePrefs.getState().weekStartDay).toBe('sunday')
    expect(JSON.parse(localStorage.getItem('tt-prefs')!).weekStartDay).toBe('sunday')
  })

  it('setRestTimerDefaultSeconds updates state and persists', () => {
    usePrefs.getState().setRestTimerDefaultSeconds(90)
    expect(usePrefs.getState().restTimerDefaultSeconds).toBe(90)
    expect(JSON.parse(localStorage.getItem('tt-prefs')!).restTimerDefaultSeconds).toBe(90)
  })

  it('setRestTimerHaptics updates state and persists', () => {
    usePrefs.getState().setRestTimerHaptics(false)
    expect(usePrefs.getState().restTimerHaptics).toBe(false)
    expect(JSON.parse(localStorage.getItem('tt-prefs')!).restTimerHaptics).toBe(false)
  })

  it('setShowRpe updates state and persists', () => {
    usePrefs.getState().setShowRpe(false)
    expect(usePrefs.getState().showRpe).toBe(false)
    expect(JSON.parse(localStorage.getItem('tt-prefs')!).showRpe).toBe(false)
  })

  it('setAutoFillForExercise sets/updates a per-exercise override and persists, merging entries', () => {
    usePrefs.getState().setAutoFillForExercise('Front Lever', false)
    expect(usePrefs.getState().autoFillSetsByExercise).toEqual({ 'Front Lever': false })

    usePrefs.getState().setAutoFillForExercise('Squat', true)
    expect(usePrefs.getState().autoFillSetsByExercise).toEqual({ 'Front Lever': false, Squat: true })
    expect(JSON.parse(localStorage.getItem('tt-prefs')!).autoFillSetsByExercise).toEqual({ 'Front Lever': false, Squat: true })

    // Re-setting the same exercise overwrites just that key.
    usePrefs.getState().setAutoFillForExercise('Front Lever', true)
    expect(usePrefs.getState().autoFillSetsByExercise).toEqual({ 'Front Lever': true, Squat: true })
  })

  it('apply() remains a no-op for the DOM w.r.t. the new fields', () => {
    document.documentElement.removeAttribute('style')
    usePrefs.getState().setRestTimerDefaultSeconds(200)
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe(String(usePrefs.getState().fontScale))
    // no new dataset/style keys introduced by the new fields
    expect(document.documentElement.dataset.theme).toBeTruthy()
  })
})

describe('usePrefs — weightUnit setter (P2)', () => {
  beforeEach(() => {
    usePrefs.setState(readPrefs())
  })

  it('setWeightUnit updates state and persists', () => {
    usePrefs.getState().setWeightUnit('kg')
    expect(usePrefs.getState().weightUnit).toBe('kg')
    expect(JSON.parse(localStorage.getItem('tt-prefs')!).weightUnit).toBe('kg')
  })

  it('apply() remains a DOM no-op for weightUnit (no dataset/style mutation from a unit change)', () => {
    // Prime the DOM to match current state first (mirrors what initPrefs() does at app boot).
    // Without this, the outer beforeEach's dataset.theme = '' / removeAttribute('style') reset
    // would make the "before" snapshot below an un-applied artifact rather than real DOM state,
    // so the very first setter call in the test would always appear to "mutate" the DOM.
    usePrefs.getState().setWeightUnit(usePrefs.getState().weightUnit)
    const themeBefore = document.documentElement.dataset.theme
    const scaleBefore = document.documentElement.style.getPropertyValue('--font-scale')
    usePrefs.getState().setWeightUnit('kg')
    expect(document.documentElement.dataset.theme).toBe(themeBefore)
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe(scaleBefore)
  })
})
