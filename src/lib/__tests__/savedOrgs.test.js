import { describe, it, expect } from 'vitest'
import { rememberOrg, renameOrg, forgetOrgs, savedOrgRows, loginUrl } from '../savedOrgs.js'

describe('saved orgs', () => {
  const a = { orgId: '00DA', host: 'a.my.salesforce.com', username: 'me@a' }
  it('remembers, keeps the name, updates the time', () => {
    let s = rememberOrg({}, a, 't1')
    s = renameOrg(s, '00DA', '  Dev org ')
    s = rememberOrg(s, { ...a, username: '' }, 't2')
    expect(s['00DA']).toEqual({ orgId: '00DA', host: 'a.my.salesforce.com', name: 'Dev org', username: 'me@a', lastConnected: 't2' })
    expect(rememberOrg(s, { orgId: '', host: 'x' })).toBe(s)
    expect(renameOrg(s, 'nope', 'x')).toBe(s)
  })
  it('forgets several', () => {
    const s = rememberOrg(rememberOrg({}, a, 't1'), { orgId: '00DB', host: 'b' }, 't2')
    expect(Object.keys(forgetOrgs(s, ['00DA']))).toEqual(['00DB'])
  })
  it('lists saved and live orgs with a status, newest first', () => {
    const s = rememberOrg(rememberOrg({}, a, '2026-10-01'), { orgId: '00DB', host: 'b.my.salesforce.com' }, '2026-10-20')
    const rows = savedOrgRows(s, [{ orgId: '00DA', host: 'a.my.salesforce.com' }, { orgId: '00DC', host: 'c.my.salesforce.com' }], { currentId: '00DA', problem: { kind: 'expired' } })
    expect(rows.map((r) => [r.orgId, r.status, r.saved])).toEqual([['00DB', 'none', true], ['00DA', 'problem', true], ['00DC', 'session', false]])
    expect(savedOrgRows(s, [], { currentId: '00DB' }).find((r) => r.orgId === '00DB').status).toBe('connected')
  })
  it('login url', () => {
    expect(loginUrl('a.my.salesforce.com')).toBe('https://a.my.salesforce.com/')
    expect(loginUrl('')).toBe('')
  })
})
