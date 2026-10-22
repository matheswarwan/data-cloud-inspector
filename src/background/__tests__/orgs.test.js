import { orgIdFromSid, toApiHost, isApiHost, groupSessions } from '../orgs.js'

const SID_A = '00D5g000000AbCd!AQ0AQ.fake'
const SID_B = '00DHs000001XyZw!AQ4AQ.fake'

describe('orgIdFromSid', () => {
  it('takes the org ID before the !', () => expect(orgIdFromSid(SID_A)).toBe('00D5g000000AbCd'))
  it('rejects values that are not sessions', () => {
    expect(orgIdFromSid('abc!def')).toBeNull()
    expect(orgIdFromSid(undefined)).toBeNull()
  })
})

describe('toApiHost', () => {
  it('maps the lightning host to my.salesforce.com', () => {
    expect(toApiHost('acme.lightning.force.com')).toBe('acme.my.salesforce.com')
    expect(toApiHost('acme--uat.sandbox.lightning.force.com')).toBe('acme--uat.sandbox.my.salesforce.com')
  })
  it('maps the setup host and strips a leading dot', () => {
    expect(toApiHost('acme.my.salesforce-setup.com')).toBe('acme.my.salesforce.com')
    expect(toApiHost('.acme.my.salesforce.com')).toBe('acme.my.salesforce.com')
  })
})

describe('isApiHost', () => {
  it('accepts org hosts and refuses help and login pages', () => {
    expect(isApiHost('acme.my.salesforce.com')).toBe(true)
    expect(isApiHost('help.salesforce.com')).toBe(false)
    expect(isApiHost('login.salesforce.com')).toBe(false)
    expect(isApiHost('acme.lightning.force.com')).toBe(false)
  })
})

describe('groupSessions', () => {
  it('keeps one host per org and prefers my.salesforce.com', () => {
    const orgs = groupSessions([
      { domain: 'acme.lightning.force.com', value: SID_A },
      { domain: 'na123.salesforce.com', value: SID_A },
      { domain: 'acme.my.salesforce.com', value: SID_A },
      { domain: 'beta.my.salesforce.com', value: SID_B },
      { domain: 'help.salesforce.com', value: SID_B },
      { domain: 'x.my.salesforce.com', value: 'not-a-session' },
    ])
    expect(orgs).toEqual([
      { orgId: '00D5g000000AbCd', host: 'acme.my.salesforce.com' },
      { orgId: '00DHs000001XyZw', host: 'beta.my.salesforce.com' },
    ])
  })
})
