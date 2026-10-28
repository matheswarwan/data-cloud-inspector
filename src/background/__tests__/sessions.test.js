import { listOrgs, orgForUrl, sessionFor } from '../sessions.js'

const SID_A = '00D5g000000AbCd!AQ0AQ.fake'
const SID_B = '00DHs000001XyZw!AQ4AQ.fake'
const cookies = async () => [
  { name: 'sid', domain: 'acme.my.salesforce.com', value: SID_A },
  { name: 'sid', domain: 'other.my.salesforce.com', value: SID_B },
]
const policy = (p = {}) => async () => ({ authMode: 'session-or-oauth', allowedOrgDomains: [], ...p })
const none = async () => []
const noToken = async () => null

describe('sessions under the administrator policy', () => {
  it('lists cookie orgs by default', async () => {
    const orgs = await listOrgs({ policy: policy(), cookies, oauthOrgs: none })
    expect(orgs.map((o) => o.host)).toEqual(['acme.my.salesforce.com', 'other.my.salesforce.com'])
  })
  it('hides orgs outside allowedOrgDomains', async () => {
    const orgs = await listOrgs({ policy: policy({ allowedOrgDomains: ['acme.my.salesforce.com'] }), cookies, oauthOrgs: none })
    expect(orgs.map((o) => o.orgId)).toEqual(['00D5g000000AbCd'])
    expect(await sessionFor('00DHs000001XyZw', { policy: policy({ allowedOrgDomains: ['acme.my.salesforce.com'] }), cookies, oauthSession: noToken })).toBeNull()
  })
  it('never reads cookies under oauth-only', async () => {
    const boom = async () => { throw new Error('cookie read') }
    const p = policy({ authMode: 'oauth-only' })
    expect(await listOrgs({ policy: p, cookies: boom, oauthOrgs: async () => [{ orgId: '00D000000000009', host: 'z.my.salesforce.com', oauth: true }] })).toHaveLength(1)
    expect(await sessionFor('00D5g000000AbCd', { policy: p, cookies: boom, oauthSession: noToken })).toBeNull()
    expect(await sessionFor('00D000000000009', { policy: p, cookies: boom, oauthSession: async () => ({ host: 'z.my.salesforce.com', sid: 'AT', oauth: true }) })).toMatchObject({ sid: 'AT' })
  })
  it('finds the org of a Lightning tab through its my.salesforce.com cookie', async () => {
    const deps = { policy: policy(), cookies, oauthOrgs: none }
    expect(await orgForUrl('https://acme.lightning.force.com/lightning/page/home', deps)).toMatchObject({ orgId: '00D5g000000AbCd', host: 'acme.my.salesforce.com' })
    expect(await orgForUrl('https://www.example.com/', deps)).toBeNull()
  })
})
