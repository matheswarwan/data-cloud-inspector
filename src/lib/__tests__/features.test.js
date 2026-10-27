import { describe, it, expect } from 'vitest'
import { featuresFor, isOn } from '../features.js'
import config from '../../features.json'
import { ALL_NAV } from '../../app/router.js'

describe('feature switches (feedback #1020)', () => {
  it('lays the public profile over the default one', () => {
    const cfg = { default: { a: true, b: true }, public: { b: false } }
    expect(featuresFor('production', cfg)).toEqual({ a: true, b: true })
    expect(featuresFor('public', cfg)).toEqual({ a: true, b: false })
    expect(isOn('b', featuresFor('public', cfg))).toBe(false)
    expect(isOn('missing', {})).toBe(true)
    expect(isOn(undefined, {})).toBe(true)
  })
  it('has a switch for every sidebar page', () => {
    for (const n of ALL_NAV.filter((x) => x.path !== '/')) expect(config.default, n.path).toHaveProperty(n.feature)
  })
})
