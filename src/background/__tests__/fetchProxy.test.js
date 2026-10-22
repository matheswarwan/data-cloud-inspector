import { sfFetch, errorMessage, CLIENT_NAME } from '../fetchProxy.js'

const session = async () => ({ host: 'acme.my.salesforce.com', sid: '00D5g000000AbCd!fake' })

function fakeFetch(status, body) {
  const calls = []
  const fn = async (url, opts) => {
    calls.push({ url, opts })
    return { ok: status >= 200 && status < 300, status, text: async () => body }
  }
  fn.calls = calls
  return fn
}

describe('sfFetch', () => {
  it('sends the session as a Bearer token to the my domain', async () => {
    const fetch = fakeFetch(200, '{"totalSize":1}')
    const res = await sfFetch({ orgId: 'x', path: '/services/data/' }, { fetch, sessionFor: session })
    expect(res).toMatchObject({ ok: true, status: 200, data: { totalSize: 1 } })
    expect(fetch.calls[0].url).toBe('https://acme.my.salesforce.com/services/data/')
    expect(fetch.calls[0].opts.headers.Authorization).toBe('Bearer 00D5g000000AbCd!fake')
    expect(fetch.calls[0].opts.headers['Sforce-Call-Options']).toBe(`client=${CLIENT_NAME}`)
    expect(fetch.calls[0].opts.credentials).toBe('omit')
  })

  it('sends a JSON body for query POSTs', async () => {
    const fetch = fakeFetch(200, '{}')
    await sfFetch({ orgId: 'x', path: '/services/data/v65.0/ssot/query-sql', method: 'POST', body: { sql: 'SELECT 1' } }, { fetch, sessionFor: session })
    expect(fetch.calls[0].opts.body).toBe('{"sql":"SELECT 1"}')
    expect(fetch.calls[0].opts.headers['Content-Type']).toBe('application/json')
  })

  it('refuses writes before reading the session', async () => {
    const fetch = fakeFetch(200, '{}')
    const res = await sfFetch({ orgId: 'x', path: '/services/data/v65.0/sobjects/Account/1', method: 'DELETE' }, { fetch, sessionFor: session })
    expect(res.code).toBe('READ_ONLY')
    expect(fetch.calls).toHaveLength(0)
  })

  it('says so when there is no session', async () => {
    const res = await sfFetch({ orgId: 'x', path: '/services/data/' }, { fetch: fakeFetch(200, ''), sessionFor: async () => null })
    expect(res.code).toBe('NO_SESSION')
  })

  it('turns Salesforce error arrays into a message', async () => {
    const fetch = fakeFetch(404, '[{"errorCode":"NOT_FOUND","message":"The requested resource does not exist"}]')
    const res = await sfFetch({ orgId: 'x', path: '/services/data/v65.0/ssot/nope' }, { fetch, sessionFor: session })
    expect(res).toMatchObject({ ok: false, status: 404, error: 'NOT_FOUND: The requested resource does not exist' })
  })
})

describe('errorMessage', () => {
  it('uses the title of an HTML error page', () => {
    expect(errorMessage(500, null, '<html><title>Server Error</title></html>')).toBe('Server Error')
  })
})
