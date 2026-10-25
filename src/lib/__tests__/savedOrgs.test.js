import { describe, it, expect } from 'vitest'
import { rememberOrg, renameOrg, forgetOrgs, savedOrgRows, loginUrl, orgLabel } from '../savedOrgs.js'

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
  it('names an org never saved when its host is given (#140)', () => {
    const s = renameOrg({}, '00DB', ' Prod ', 'b.my.salesforce.com')
    expect(s['00DB']).toEqual({ orgId: '00DB', host: 'b.my.salesforce.com', name: 'Prod', username: '', lastConnected: '' })
    expect(rememberOrg(s, { orgId: '00DB', host: 'b.my.salesforce.com' }, 't3')['00DB'].name).toBe('Prod')
  })
  it('labels an org by its name, else its domain (#140)', () => {
    const s = renameOrg(rememberOrg({}, a, 't1'), '00DA', 'Dev')
    expect(orgLabel(s, '00DA', a.host)).toBe('Dev')
    expect(orgLabel(s, '00DB', 'b.my.salesforce.com')).toBe('b.my.salesforce.com')
    expect(orgLabel(rememberOrg({}, a, 't1'), '00DA')).toBe(a.host)
    expect(orgLabel({}, '00DX')).toBe('00DX')
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
