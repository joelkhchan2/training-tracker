import { describe, expect, it } from 'vitest'
import { reorderFromDragEnd } from './dragReorder'

describe('reorderFromDragEnd', () => {
  const ids = ['a', 'b', 'c']
  it('maps active/over ids to indices', () => {
    expect(reorderFromDragEnd(ids, 'a', 'c')).toEqual({ from: 0, to: 2 })
  })
  it('returns null when over is missing or unchanged', () => {
    expect(reorderFromDragEnd(ids, 'a', null)).toBeNull()
    expect(reorderFromDragEnd(ids, 'a', 'a')).toBeNull()
  })
  it('returns null when an id is not found', () => {
    expect(reorderFromDragEnd(ids, 'a', 'zzz')).toBeNull()
  })
})
