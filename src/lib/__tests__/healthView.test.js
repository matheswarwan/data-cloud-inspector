import { describe, it, expect } from 'vitest'
import { problemGroups, areaTiles, healthScore, headline, okBreakdown, ageScale, healthChanges, levelMap, reasonStatus, itemKey } from '../healthView.js'

const sections = [
  { title: 'Data streams', items: [{ kind: 'Data stream', name: 's1', label: 'S1', level: 'ok', reason: 'Last run succeeded' }] },
  { title: 'Identity resolution', items: [], notice: '' },
  { title: 'Activations', items: [
    { kind: 'Activation', name: 'a1', label: 'Same', level: 'fail', reason: 'Last publish: partnererror' },
    { kind: 'Activation', name: 'a2', label: 'Same', level: 'fail', reason: 'Last publish: partnererror' },
    { kind: 'Activation', name: 'a3', label: 'Other', level: 'idle', reason: 'Activation is inactive' },
  ] },
  { title: 'Segments', items: Array.from({ length: 14 }, (_, n) => ({ kind: 'Segment', name: `g${n}`, label: `G${n}`, level: 'warn', reason: 'Has never been published' })) },
  { title: 'Engagement data', items: [{ kind: 'Engagement data', name: 'e1', label: 'Email', level: 'warn', reason: 'No new rows in 30 days', lastRun: '2026-09-29' }] },
]

describe('Health page (design Option D)', () => {
  it('groups problems as sentences, failed first', () => {
    const g = problemGroups(sections)
    expect(g.map((x) => [x.title, x.items.length, x.layout])).toEqual([
      ['Failed activations', 2, 'list'], ['Segments never published', 14, 'chips'], ['Engagement data going stale', 1, 'stale'], ['Inactive', 1, 'inactive'],
    ])
    expect(g[0].note).toMatch(/share one name/)
    expect(g[0].hint.word).toBe('partnererror')
    expect(reasonStatus('Last publish: partnererror')).toBe('partnererror')
  })

  it('leaves out items marked as expected and counts them as OK', () => {
    const expected = new Set(sections[3].items.map(itemKey))
    expect(problemGroups(sections, expected).map((x) => x.title)).not.toContain('Segments never published')
    const s = healthScore(sections, expected)
    expect(s.counts.warn).toBe(1)
    expect(s.expected).toBe(14)
    expect(okBreakdown(sections, expected)).toBe('1 data stream, 14 segments')
  })

  it('makes a tile per area', () => {
    const t = areaTiles(sections)
    expect(t.map((x) => x.label)).toEqual(['All OK', 'Nothing to check', 'Failed', 'Needs a look', 'Needs a look'])
    expect(t[1].note).toBe('No rulesets in this org')
  })

  it('says what is wrong in one line', () => {
    expect(headline({ fail: 3, warn: 120 })).toBe('3 things failed and 120 need a look')
    expect(headline({})).toBe('Everything is OK')
  })

  it('places ages on a log scale and compares checks', () => {
    expect(ageScale(1)).toBe(0)
    expect(Math.round(ageScale(24) * 100)).toBe(35)
    expect(Math.round(ageScale(168) * 1000)).toBe(564)
    const before = levelMap(sections)
    const after = [{ title: 'Activations', items: [{ kind: 'Activation', name: 'a1', level: 'ok' }, { kind: 'Activation', name: 'a3', level: 'warn' }] }]
    const c = healthChanges(before, after)
    expect([...c.newProblems]).toEqual(['Activation:a3'])
    expect(c.fixed).toBe(1)
  })
})
