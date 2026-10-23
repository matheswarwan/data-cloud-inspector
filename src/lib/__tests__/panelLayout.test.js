import { describe, it, expect, beforeEach } from 'vitest'
import { clampWidth, readPanel, writePanel, PANEL_MIN, PANEL_MAX } from '../panelLayout.js'

describe('panelLayout', () => {
  beforeEach(() => localStorage.clear())
  it('clamps widths', () => {
    expect(clampWidth(10)).toBe(PANEL_MIN)
    expect(clampWidth(5000)).toBe(PANEL_MAX)
    expect(clampWidth('abc')).toBe(PANEL_MIN)
    expect(clampWidth(700, 500)).toBe(500)
  })
  it('remembers per key, with defaults', () => {
    expect(readPanel('a', 320)).toEqual({ width: 320, hidden: false })
    writePanel('a', { width: 410, hidden: true })
    expect(readPanel('a', 320)).toEqual({ width: 410, hidden: true })
    expect(readPanel('b', 300)).toEqual({ width: 300, hidden: false })
  })
  it('ignores bad stored values', () => {
    localStorage.setItem('dci_panel_a', '{bad')
    expect(readPanel('a', 320)).toEqual({ width: 320, hidden: false })
  })
})
