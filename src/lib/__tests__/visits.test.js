import { describe, it, expect, beforeEach } from 'vitest'
import { pageOf, recordVisit, topVisits, readVisits } from '../visits.js'

const NAV = ['/', '/objects', '/sql', '/sql/builder', '/segments']

describe('visits', () => {
  beforeEach(() => localStorage.clear())
  it('maps a path to its sidebar page', () => {
    expect(pageOf('/segments/Test_1', NAV)).toBe('/segments')
    expect(pageOf('/sql/builder', NAV)).toBe('/sql/builder')
    expect(pageOf('/sql', NAV)).toBe('/sql')
    expect(pageOf('/', NAV)).toBe('')
    expect(pageOf('/help', NAV)).toBe('')
  })
  it('counts visits and ranks them', () => {
    recordVisit('/objects/a', NAV, 1)
    recordVisit('/segments/x', NAV, 2)
    recordVisit('/objects', NAV, 3)
    recordVisit('/', NAV, 4)
    expect(readVisits()).toEqual({ '/objects': { n: 2, at: 3 }, '/segments': { n: 1, at: 2 } })
    expect(topVisits(5).map((v) => v.path)).toEqual(['/objects', '/segments'])
    expect(topVisits(1)).toHaveLength(1)
  })
  it('breaks ties by the most recent', () => {
    expect(topVisits(5, { '/a': { n: 1, at: 1 }, '/b': { n: 1, at: 5 } }).map((v) => v.path)).toEqual(['/b', '/a'])
  })
})

describe('fillCards', () => {
  const pages = ['/a', '/b', '/c', '/d', '/e', '/f', '/g', '/h'].map((path) => ({ path }))
  it('always gives six: most used first, then starters, then the rest', async () => {
    const { fillCards } = await import('../visits.js')
    expect(fillCards([{ path: '/g', n: 3 }], ['/b', '/g', '/x'], pages).map((p) => p.path)).toEqual(['/g', '/b', '/a', '/c', '/d', '/e'])
    expect(fillCards([], ['/b'], pages.slice(0, 3))).toHaveLength(3)
  })
})
