import { normalizePolicy, policyOverrides, hostAllowed, DEFAULT_POLICY } from '../policy.js'
import { jobArea } from '../../app/useJobs.js'
import { cacheArea } from '../store.js'
import { feedbackText, feedbackMailto } from '../feedbackMeta.js'

describe('administrator policy', () => {
  it('defaults when nothing is set, ignores wrong types', () => {
    expect(normalizePolicy(undefined)).toEqual({ ...DEFAULT_POLICY, allowedOrgDomains: [] })
    expect(normalizePolicy({ authMode: 'bogus', disableCache: 'yes', allowedOrgDomains: 'acme' })).toEqual({ ...DEFAULT_POLICY, allowedOrgDomains: [] })
  })
  it('cleans domains and lists overrides', () => {
    const p = normalizePolicy({ authMode: 'oauth-only', allowedOrgDomains: ['https://Acme.my.salesforce.com/', ' *.acme.my.salesforce.com '], disableDiagramforce: true })
    expect(p.allowedOrgDomains).toEqual(['acme.my.salesforce.com', '*.acme.my.salesforce.com'])
    expect(policyOverrides(p)).toEqual(['authMode', 'allowedOrgDomains', 'disableDiagramforce'])
  })
  it('matches hosts exactly or by *. suffix', () => {
    const allowed = ['acme.my.salesforce.com', '*.sandbox.my.salesforce.com']
    expect(hostAllowed('acme.my.salesforce.com', allowed)).toBe(true)
    expect(hostAllowed('acme--uat.sandbox.my.salesforce.com', allowed)).toBe(true)
    expect(hostAllowed('evilacme.my.salesforce.com', allowed)).toBe(false)
    expect(hostAllowed('anything.my.salesforce.com', [])).toBe(true)
  })
  it('keeps people data in session storage only, and caches per disableCache', () => {
    const def = normalizePolicy(null)
    const off = normalizePolicy({ disableCache: true })
    expect(jobArea('bulk:00D5g000000AbCd:default', def)).toBe('session')
    expect(jobArea('compare', def)).toBe('session')
    expect(jobArea('health:00D5g000000AbCd:default', def)).toBe('local')
    expect(jobArea('health:00D5g000000AbCd:default', off)).toBe('session')
    expect(cacheArea(def)).toBe('local')
    expect(cacheArea(off)).toBe('session')
  })
})

describe('feedback by email', () => {
  it('builds the text and a shortened mailto link', () => {
    const text = feedbackText({ kind: 'problem', message: ' Broken ', details: 'Steps', meta: { appVersion: '1.0.8', recentApiCalls: [] } })
    expect(text).toContain('Kind: problem\n\nBroken\n\nMore details:\nSteps')
    expect(text).toContain('App Version: 1.0.8')
    const link = feedbackMailto('a@b.c', 'S', 'x'.repeat(3000), 100)
    expect(link.startsWith('mailto:a@b.c?subject=S&body=')).toBe(true)
    expect(decodeURIComponent(link.split('body=')[1])).toContain('[Shortened')
  })
})

describe('status badges', () => {
  it('colours status words', async () => {
    const { badgeClass } = await import('../badges.js')
    expect(badgeClass('Active')).toContain('green')
    expect(badgeClass('Failed')).toContain('red')
    expect(badgeClass('Every 24 hours')).toContain('blue')
    expect(badgeClass('Not published')).toContain('amber')
    expect(badgeClass('Calculated')).toBe('dci-badge')
  })
})
