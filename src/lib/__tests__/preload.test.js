import { describe, it, expect, beforeEach } from 'vitest'
import { preloadOn, setPreloadOn, stale } from '../preload.js'

describe('preload (#147)', () => {
  beforeEach(() => localStorage.clear())
  it('is on unless turned off', () => {
    expect(preloadOn()).toBe(true)
    setPreloadOn(false)
    expect(preloadOn()).toBe(false)
    setPreloadOn(true)
    expect(preloadOn()).toBe(true)
  })
  it('checks again after an hour', () => {
    const now = Date.parse('2026-10-25T12:00:00Z')
    expect(stale('2026-10-25T11:30:00Z', { now })).toBe(false)
    expect(stale('2026-10-25T10:30:00Z', { now })).toBe(true)
    expect(stale(null, { now })).toBe(true)
  })
})
