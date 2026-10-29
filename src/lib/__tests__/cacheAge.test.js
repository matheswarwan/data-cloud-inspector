import { describe, it, expect, beforeEach } from 'vitest'
import { cacheHours, setCacheHours, metadataTtl } from '../cacheAge.js'

describe('how long org details are kept (feedback #1043)', () => {
  beforeEach(() => localStorage.clear())
  it('defaults to a day and takes only the listed choices', () => {
    expect(cacheHours()).toBe(24)
    expect(metadataTtl()).toBe(24 * 3600 * 1000)
    setCacheHours(168)
    expect(cacheHours()).toBe(168)
    setCacheHours(5)
    expect(cacheHours()).toBe(24)
  })
})
