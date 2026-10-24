import { describe, it, expect, vi } from 'vitest'

describe('API console', () => {
  it('logs calls only while on, newest first, and writes Markdown', async () => {
    vi.resetModules()
    let reply = { ok: true, status: 200, ms: 12, data: { a: 1 } }
    globalThis.chrome = { runtime: { sendMessage: (m, cb) => cb(reply), lastError: null } }
    const api = await import('../api.js')
    const c = await import('../../app/useApiConsole.js')
    c.setApiConsole(false)
    await api.sf('00D', '/services/data/v68.0/x')
    expect(c.useApiConsole().calls.value).toHaveLength(0)
    c.setApiConsole(true)
    await api.sf('00D', '/services/data/v68.0/one')
    reply = { ok: false, status: 400, error: 'BAD_REQUEST: nope' }
    await api.sf('00D', '/services/data/v68.0/ssot/query-sql', { method: 'POST', body: { sql: 'SELECT 1' } })
    const calls = c.useApiConsole().calls.value
    expect(calls.map((x) => [x.method, x.status])).toEqual([['POST', 400], ['GET', 200]])
    const md = c.apiConsoleMarkdown(calls)
    expect(md.indexOf('GET /services/data/v68.0/one')).toBeLessThan(md.indexOf('POST /services'))
    expect(md).toContain('"sql": "SELECT 1"')
    expect(md).toContain('BAD_REQUEST: nope')
    expect(c.apiConsoleMarkdown([{ at: 0, method: 'GET', path: '/x', status: 200, ms: 1, data: 'y'.repeat(10) }], { maxChars: 4 })).toContain('(6 more characters)')
    c.setApiConsole(false)
    expect(c.useApiConsole().calls.value).toHaveLength(0)
  })
})
