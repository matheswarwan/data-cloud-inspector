import { checkRequest } from '../guard.js'

describe('checkRequest (read only)', () => {
  it('allows GET on API paths', () => {
    expect(checkRequest('GET', '/services/data/v65.0/ssot/data-model-objects')).toBeNull()
    expect(checkRequest('get', '/services/data/')).toBeNull()
  })
  it('allows POST only to the query endpoints', () => {
    expect(checkRequest('POST', '/services/data/v65.0/ssot/query-sql')).toBeNull()
    expect(checkRequest('POST', '/services/data/v65.0/ssot/queryv2')).toBeNull()
    expect(checkRequest('POST', '/services/data/v65.0/ssot/segments')).toMatch(/read only/)
    expect(checkRequest('POST', '/services/data/v65.0/sobjects/Account')).toMatch(/read only/)
  })
  it('refuses writes of any kind', () => {
    for (const m of ['PATCH', 'PUT', 'DELETE']) {
      expect(checkRequest(m, '/services/data/v65.0/ssot/query-sql')).toMatch(/read only/)
    }
  })
  it('refuses paths outside /services and tricks', () => {
    expect(checkRequest('GET', 'https://evil.example/services/data')).toMatch(/Only/)
    expect(checkRequest('GET', '/lightning/setup')).toMatch(/Only/)
    expect(checkRequest('GET', '/services/../secur/frontdoor.jsp')).toMatch(/Only/)
    expect(checkRequest('GET', '/services/data/../../secur/frontdoor.jsp')).toMatch(/not allowed/)
  })
  it('refuses Apex REST and other /services paths, even GET', () => {
    expect(checkRequest('GET', '/services/apexrest/anything')).toMatch(/Only/)
    expect(checkRequest('GET', '/services/oauth2/userinfo')).toMatch(/Only/)
    expect(checkRequest('GET', '/services/data/v65.0/ssot/data-spaces')).toBeNull()
  })
})
