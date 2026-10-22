import { base64url, pkcePair, authorizeUrl, codeFromRedirect, orgIdOfToken, oauthLogin } from '../oauth.js'
import { sessionProblem, dataCloudProblem } from '../../lib/orgStatus.js'

describe('oauth helpers', () => {
  it('builds a PKCE pair (S256, base64url)', async () => {
    const { verifier, challenge } = await pkcePair((n) => new Uint8Array(n).fill(7))
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{64}$/)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(base64url(new Uint8Array([251, 255]))).toBe('-_8')
  })
  it('builds the authorize URL', () => {
    const u = new URL(authorizeUrl({ host: 'acme.my.salesforce.com', clientId: 'CID', redirectUri: 'https://abc.chromiumapp.org/', challenge: 'CH', state: 'ST' }))
    expect(u.origin + u.pathname).toBe('https://acme.my.salesforce.com/services/oauth2/authorize')
    expect(Object.fromEntries(u.searchParams)).toEqual({ response_type: 'code', client_id: 'CID', redirect_uri: 'https://abc.chromiumapp.org/', code_challenge: 'CH', code_challenge_method: 'S256', state: 'ST' })
  })
  it('reads the code and checks the state', () => {
    expect(codeFromRedirect('https://abc.chromiumapp.org/?code=C1&state=S', 'S')).toBe('C1')
    expect(() => codeFromRedirect('https://abc.chromiumapp.org/?code=C1&state=X', 'S')).toThrow(/did not match/)
    expect(() => codeFromRedirect('https://abc.chromiumapp.org/?error=access_denied&error_description=end-user+denied', 'S')).toThrow('access_denied: end-user denied')
  })
  it('reads the org of a token', () => {
    expect(orgIdOfToken({ id: 'https://login.salesforce.com/id/00DjV000006UTXNUA4/005jV000002p0ZVQAY' })).toBe('00DjV000006UTXN')
    expect(orgIdOfToken({})).toBeNull()
  })
})

describe('oauthLogin', () => {
  const store = {}
  beforeEach(() => {
    globalThis.chrome = {
      storage: {
        session: { set: (o, cb) => { Object.assign(store, o); cb() }, get: (k, cb) => cb({ [k]: store[k] }), remove: (k, cb) => { delete store[k]; cb() } },
        local: { set: (o, cb) => { Object.assign(store, o); cb() }, get: (k, cb) => cb({ [k]: store[k] }) },
      },
    }
  })
  afterEach(() => { delete globalThis.chrome })

  it('exchanges the code with the verifier and keeps the token in session storage', async () => {
    let authUrl, tokenBody
    const launchWebAuthFlow = async ({ url }) => { authUrl = new URL(url); return `https://abc.chromiumapp.org/?code=THECODE&state=${authUrl.searchParams.get('state')}` }
    const fetch = async (url, opts) => { tokenBody = new URLSearchParams(opts.body); return { ok: true, status: 200, json: async () => ({ access_token: 'AT', instance_url: 'https://acme.my.salesforce.com', id: 'https://login.salesforce.com/id/00D000000000001AAA/005', scope: 'api cdp_query_api' }) } }
    const res = await oauthLogin({ orgId: '00D000000000001', host: 'acme.my.salesforce.com', clientId: ' CID ' }, { launchWebAuthFlow, fetch, redirectUri: 'https://abc.chromiumapp.org/' })
    expect(res).toEqual({ ok: true, scope: 'api cdp_query_api' })
    expect(tokenBody.get('grant_type')).toBe('authorization_code')
    expect(tokenBody.get('code')).toBe('THECODE')
    expect(tokenBody.get('client_id')).toBe('CID')
    expect(tokenBody.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{64}$/)
    expect(store.dci_oauth_00D000000000001).toMatchObject({ accessToken: 'AT', host: 'acme.my.salesforce.com' })
    expect(store.dci_oauthClient_00D000000000001).toBe('CID')
  })

  it('refuses a token for another org', async () => {
    const launchWebAuthFlow = async ({ url }) => `https://abc.chromiumapp.org/?code=C&state=${new URL(url).searchParams.get('state')}`
    const fetch = async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'AT', id: 'https://login.salesforce.com/id/00D999999999999AAA/005' }) })
    await expect(oauthLogin({ orgId: '00D000000000001', host: 'acme.my.salesforce.com', clientId: 'CID' }, { launchWebAuthFlow, fetch, redirectUri: 'r' })).rejects.toThrow(/different org/)
  })
})

describe('org status messages', () => {
  it('explains a rejected session and missing Data Cloud', () => {
    expect(sessionProblem({ ok: true })).toBeNull()
    expect(sessionProblem({ ok: false, status: 401, error: 'INVALID_SESSION_ID: Session expired or invalid' })).toMatchObject({ kind: 'rejected' })
    expect(sessionProblem({ ok: false, code: 'NO_SESSION' })).toMatchObject({ kind: 'logged-out' })
    expect(dataCloudProblem({ ok: false, status: 404 })).toMatchObject({ kind: 'no-data-cloud' })
    expect(dataCloudProblem({ ok: false, status: 403, error: 'Insufficient privileges' })).toMatchObject({ kind: 'no-access' })
    expect(dataCloudProblem({ ok: false, status: 500 })).toBeNull()
  })
})
