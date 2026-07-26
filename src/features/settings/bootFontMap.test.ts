import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FONTS, THEMES } from './prefs'

const metaUrl = import.meta.url
const html = readFileSync(fileURLToPath(new URL('../../../index.html', metaUrl)), 'utf8')

describe('index.html boot script stays in sync with prefs.ts', () => {
  it('inline FONT stacks match FONTS', () => {
    for (const id of ['rounded', 'mono'] as const) {
      const stack = FONTS.find(f => f.id === id)!.stack
      expect(html).toContain(stack)
    }
  })
  it('inline THEME_BG has every theme id with its bg', () => {
    for (const t of THEMES) {
      expect(html).toContain(`${t.id}:'${t.bg}'`)
    }
  })
})
