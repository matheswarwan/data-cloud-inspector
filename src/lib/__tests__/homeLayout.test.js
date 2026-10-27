import { describe, it, expect } from 'vitest'
import { normalizeLayout, moveSection, HOME_SECTIONS } from '../homeLayout.js'

describe('Home layout (feedback #1022)', () => {
  it('keeps a saved order, drops unknown ids and adds new sections', () => {
    expect(normalizeLayout(null)).toEqual({ order: HOME_SECTIONS, folded: ['oauth'] })
    const l = normalizeLayout({ order: ['all', 'gone', 'connection', 'all'], folded: ['most', 'gone'] })
    expect(l.order.slice(0, 2)).toEqual(['all', 'connection'])
    expect(new Set(l.order)).toEqual(new Set(HOME_SECTIONS))
    expect(l.folded).toEqual(['most'])
  })
  it('moves a section by a step or before another', () => {
    const o = ['a', 'b', 'c', 'd']
    expect(moveSection(o, 'c', { step: -1 })).toEqual(['a', 'c', 'b', 'd'])
    expect(moveSection(o, 'a', { step: -1 })).toEqual(o)
    expect(moveSection(o, 'd', { before: 'a' })).toEqual(['d', 'a', 'b', 'c'])
    expect(moveSection(o, 'a', {})).toEqual(['b', 'c', 'd', 'a'])
  })
})
