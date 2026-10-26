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

import { PRELOAD_STEPS, plural, preloadProgress } from '../preload.js'
describe('Load everything steps (feedback #1002)', () => {
  it('ends with the Health check', () => expect(PRELOAD_STEPS.at(-1).id).toBe('health'))
  it('counts finished and failed steps', () => {
    const steps = PRELOAD_STEPS.map((s, i) => ({ ...s, status: i === 0 ? 'done' : i === 1 ? 'failed' : i === 2 ? 'running' : 'pending' }))
    expect(preloadProgress(steps)).toEqual({ finished: 2, failed: 1, total: PRELOAD_STEPS.length })
  })
  it('writes plurals', () => {
    expect(plural(1, 'stream')).toBe('1 stream')
    expect(plural(1200, 'object')).toBe('1,200 objects')
  })
})
