import { describe, it, expect, beforeEach } from 'vitest'
import { SIZES, clampSize, defaultLayout, normalizeLayout, readLayout, writeLayout, LAYOUT_KEY } from '../builderLayout.js'

describe('builderLayout', () => {
  beforeEach(() => localStorage.clear())
  it('clamps sizes', () => {
    expect(clampSize(10, SIZES.browser)).toBe(SIZES.browser.min)
    expect(clampSize(5000, SIZES.browser)).toBe(SIZES.browser.max)
    expect(clampSize('abc', SIZES.code)).toBe(SIZES.code.min)
    expect(clampSize(300.4, SIZES.code)).toBe(300)
  })
  it('keeps the layout saved before #124 (visual and dock only)', () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ visual: true, dock: 'bottom' }))
    expect(readLayout()).toEqual({ ...defaultLayout(), visual: true, dock: 'bottom' })
  })
  it('remembers sizes and step heights', () => {
    const l = { ...defaultLayout(), browser: 300, sqlWidth: 700, code: 150, steps: { structure: 420, output: null, filters: null, options: 90 } }
    writeLayout(l)
    expect(readLayout()).toEqual(l)
  })
  it('ignores bad values', () => {
    expect(normalizeLayout({ dock: 'left', browser: 'x', steps: { structure: 5, bogus: 3 } })).toEqual({
      ...defaultLayout(), browser: SIZES.browser.min, steps: { structure: SIZES.step.min, output: null, filters: null, options: null },
    })
    localStorage.setItem(LAYOUT_KEY, '{bad')
    expect(readLayout()).toEqual(defaultLayout())
  })
})
