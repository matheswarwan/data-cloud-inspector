import { describe, it, expect, beforeEach } from 'vitest'
import { pageListed, setPageShown, shownPages } from '../optionalPages.js'

describe('optional pages (feedback #1041)', () => {
  beforeEach(() => localStorage.clear())
  it('hides Personalization, Marketing flows and Campaigns until turned on', () => {
    expect(pageListed('personalization')).toBe(false)
    expect(pageListed('campaigns')).toBe(false)
    expect(pageListed('segments')).toBe(true)
    expect(pageListed(undefined)).toBe(true)
    setPageShown('campaigns', true)
    expect(pageListed('campaigns')).toBe(true)
    expect(shownPages()).toEqual(['campaigns'])
    setPageShown('campaigns', false)
    expect(pageListed('campaigns')).toBe(false)
  })
  it('ignores unknown or broken stored values', () => {
    localStorage.setItem('dci_pages_shown', '{"x":1}')
    expect(shownPages()).toEqual([])
    localStorage.setItem('dci_pages_shown', '["segments","flows","marketingFlows"]')
    expect(shownPages()).toEqual(['marketingFlows'])
  })
})
