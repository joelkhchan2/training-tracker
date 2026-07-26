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
