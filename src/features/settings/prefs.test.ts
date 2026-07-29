import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { resolveTheme, fontStack, readPrefs, writePrefs, applyPrefs, THEMES, FONTS, DEFAULT_PREFS } from './prefs'

describe('resolveTheme', () => {
  it('maps system to midnight (dark) / daylight (light)', () => {
    expect(resolveTheme('system', true)).toBe('midnight')
    expect(resolveTheme('system', false)).toBe('daylight')
  })
  it('passes through a concrete theme', () => {
    expect(resolveTheme('navy', true)).toBe('navy')
  })
  it('falls back to midnight for an unknown id', () => {
    expect(resolveTheme('bogus' as never, true)).toBe('midnight')
  })
})

describe('fontStack', () => {
  it('returns the stack for an id and system for unknown', () => {
    expect(fontStack('mono')).toContain('monospace')
    expect(fontStack('bogus' as never)).toBe(fontStack('system'))
  })
})

describe('readPrefs / writePrefs', () => {
  it('round-trips via injected storage', () => {
    const store: Record<string, string> = {}
    writePrefs({ ...DEFAULT_PREFS, theme: 'gold', fontFamily: 'mono', fontScale: 1.2 }, { setItem: (k, v) => { store[k] = v } })
    const p = readPrefs({ getItem: (k) => store[k] ?? null })
    expect(p).toEqual({ ...DEFAULT_PREFS, theme: 'gold', fontFamily: 'mono', fontScale: 1.2 })
  })
  it('returns defaults on missing or malformed json', () => {
    expect(readPrefs({ getItem: () => null })).toEqual(DEFAULT_PREFS)
    expect(readPrefs({ getItem: () => '{bad' })).toEqual(DEFAULT_PREFS)
  })
})

describe('readPrefs / writePrefs — P1 toggle fields', () => {
  it('round-trips weekStartDay, restTimerDefaultSeconds, restTimerHaptics, showRpe via injected storage', () => {
    const store: Record<string, string> = {}
    writePrefs(
      {
        theme: 'gold', fontFamily: 'mono', fontScale: 1.2,
        weekStartDay: 'sunday', restTimerDefaultSeconds: 180, restTimerHaptics: false, showRpe: false,
      },
      { setItem: (k, v) => { store[k] = v } },
    )
    const p = readPrefs({ getItem: (k) => store[k] ?? null })
    expect(p).toEqual({
      theme: 'gold', fontFamily: 'mono', fontScale: 1.2,
      weekStartDay: 'sunday', restTimerDefaultSeconds: 180, restTimerHaptics: false, showRpe: false,
    })
  })

  it('defaults all four new fields when the stored blob has none of them', () => {
    const p = readPrefs({ getItem: () => JSON.stringify({ theme: 'navy' }) })
    expect(p.weekStartDay).toBe('monday')
    expect(p.restTimerDefaultSeconds).toBe(120)
    expect(p.restTimerHaptics).toBe(true)
    expect(p.showRpe).toBe(true)
  })

  it('falls back to monday for an unknown weekStartDay value', () => {
    expect(readPrefs({ getItem: () => JSON.stringify({ weekStartDay: 'tuesday' }) }).weekStartDay).toBe('monday')
  })

  it('falls back to 120 for a non-finite, zero, negative, or non-number restTimerDefaultSeconds', () => {
    expect(readPrefs({ getItem: () => JSON.stringify({ restTimerDefaultSeconds: -5 }) }).restTimerDefaultSeconds).toBe(120)
    expect(readPrefs({ getItem: () => JSON.stringify({ restTimerDefaultSeconds: 0 }) }).restTimerDefaultSeconds).toBe(120)
    expect(readPrefs({ getItem: () => JSON.stringify({ restTimerDefaultSeconds: 'nope' }) }).restTimerDefaultSeconds).toBe(120)
  })

  it('falls back to true for a non-boolean restTimerHaptics or showRpe', () => {
    expect(readPrefs({ getItem: () => JSON.stringify({ restTimerHaptics: 'no' }) }).restTimerHaptics).toBe(true)
    expect(readPrefs({ getItem: () => JSON.stringify({ showRpe: 0 }) }).showRpe).toBe(true)
  })
})

describe('DEFAULT_PREFS — P1 fields', () => {
  it('matches the documented defaults', () => {
    expect(DEFAULT_PREFS.weekStartDay).toBe('monday')
    expect(DEFAULT_PREFS.restTimerDefaultSeconds).toBe(120)
    expect(DEFAULT_PREFS.restTimerHaptics).toBe(true)
    expect(DEFAULT_PREFS.showRpe).toBe(true)
  })
})

describe('applyPrefs', () => {
  it('sets data-theme (resolved), font vars, and theme-color', () => {
    const root = { dataset: {} as { theme?: string }, style: { setProperty: vi.fn() } }
    const setMeta = vi.fn()
    applyPrefs(root, setMeta, { ...DEFAULT_PREFS, theme: 'system', fontFamily: 'rounded', fontScale: 1.2 }, false)
    expect(root.dataset.theme).toBe('daylight') // system + light
    expect(root.style.setProperty).toHaveBeenCalledWith('--font-scale', '1.2')
    expect(root.style.setProperty).toHaveBeenCalledWith('--font-sans', fontStack('rounded'))
    expect(setMeta).toHaveBeenCalledWith(THEMES.find(t => t.id === 'daylight')!.bg)
  })
})

describe('data integrity', () => {
  it('THEMES ids are unique and all present in FONTS/SCALES shape', () => {
    expect(new Set(THEMES.map(t => t.id)).size).toBe(THEMES.length)
    expect(FONTS.map(f => f.id)).toContain('system')
  })

  it('every THEMES id has a matching [data-theme] block in index.css, and vice-versa', () => {
    // Indirection through `metaUrl` avoids Vite's static `new URL('...', import.meta.url)`
    // asset-URL transform, which would rewrite this to a dev-server URL instead of a file path.
    const metaUrl = import.meta.url
    const css = readFileSync(fileURLToPath(new URL('../../index.css', metaUrl)), 'utf8')
    const cssIds = new Set(
      [...css.matchAll(/\[data-theme="([^"]+)"\]/g)].map(m => m[1]),
    )
    const themeIds = new Set(THEMES.map(t => t.id))
    expect(cssIds).toEqual(themeIds) // includes midnight; catches typos / missing blocks either direction
  })

  it('every THEMES entry has non-empty surface and accent colors', () => {
    for (const t of THEMES) {
      expect(typeof t.surface).toBe('string')
      expect(t.surface.length).toBeGreaterThan(0)
      expect(typeof t.accent).toBe('string')
      expect(t.accent.length).toBeGreaterThan(0)
    }
  })
})
