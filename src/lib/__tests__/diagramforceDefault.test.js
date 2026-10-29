import { describe, it, expect, beforeEach } from 'vitest'
import { diagramforceOn, setDiagramforceOn } from '../diagramforce.js'

describe('Open in Diagramforce on by default (feedback #1045)', () => {
  beforeEach(() => localStorage.clear())
  it('is on until turned off, and an older "on" stays on', () => {
    expect(diagramforceOn()).toBe(true)
    setDiagramforceOn(false)
    expect(diagramforceOn()).toBe(false)
    setDiagramforceOn(true)
    expect(diagramforceOn()).toBe(true)
    localStorage.setItem('dci_diagramforce', 'on')
    expect(diagramforceOn()).toBe(true)
  })
})
