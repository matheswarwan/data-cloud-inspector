import { runQuery, fetchAllRows, cleanError, toCsv, resultMarkdown } from '../query.js'

const meta = [{ name: 'x', type: 'Integer' }]

describe('runQuery', () => {
  it('returns the first page straight from the POST', async () => {
    let body
    const call = async (path, opts) => {
      body = opts.body
      return { ok: true, data: { data: [[1], [2]], metadata: meta, returnedRows: 2, status: { queryId: 'q1', completionStatus: 'ResultsProduced', rowCount: 3500 } } }
    }
    const r = await runQuery(call, '68.0', 'SELECT 1')
    expect(body).toEqual({ sql: 'SELECT 1', rowLimit: 1000 })
    expect(r).toMatchObject({ queryId: 'q1', total: 3500, rows: [[1], [2]], columns: [{ name: 'x', type: 'Integer' }] })
  })

  it('polls a running query, then fetches the first page', async () => {
    const seen = []
    let polls = 0
    const call = async (path, opts = {}) => {
      seen.push(`${opts.method || 'GET'} ${path}`)
      if (opts.method === 'POST') return { ok: true, data: { metadata: [], status: { queryId: 'a/b', completionStatus: 'Running' } } }
      if (path.endsWith('/rows?offset=0&rowLimit=1000')) return { ok: true, data: { data: [[7]], metadata: meta } }
      polls++
      return { ok: true, data: { queryId: 'a/b', completionStatus: polls < 2 ? 'Running' : 'Finished', rowCount: 1 } }
    }
    const r = await runQuery(call, '68.0', 'SELECT 7', { wait: async () => {} })
    expect(r.rows).toEqual([[7]])
    expect(r.total).toBe(1)
    expect(seen).toContain('GET /services/data/v68.0/ssot/query-sql/a%2Fb')
  })

  it('stops on a failed query and on cancel', async () => {
    const failed = async (p, o = {}) => (o.method === 'POST'
      ? { ok: true, data: { status: { queryId: 'q', completionStatus: 'Running' } } }
      : { ok: true, data: { queryId: 'q', completionStatus: 'Failure' } })
    await expect(runQuery(failed, '68.0', 'x', { wait: async () => {} })).rejects.toThrow('Query Failure')
    const running = async () => ({ ok: true, data: { status: { queryId: 'q', completionStatus: 'Running' } } })
    await expect(runQuery(running, '68.0', 'x', { isCancelled: () => true })).rejects.toThrow('Cancelled')
  })

  it('cleans Salesforce query errors', async () => {
    const call = async () => ({ ok: false, error: 'BAD_REQUEST: {"errorMessage":"INVALID_ARGUMENT: unknown column \'nope\' [TraceId:abc]","traceId":"abc"}' })
    await expect(runQuery(call, '68.0', 'x')).rejects.toThrow("INVALID_ARGUMENT: unknown column 'nope'")
    expect(cleanError('plain message')).toBe('plain message')
  })
})

describe('fetchAllRows', () => {
  it('pages from the offset up to the total', async () => {
    const asked = []
    const call = async (path) => {
      asked.push(path.split('/rows')[1])
      const offset = Number(path.match(/offset=(\d+)/)[1])
      const limit = Number(path.match(/rowLimit=(\d+)/)[1])
      return { ok: true, data: { data: Array.from({ length: limit }, (_, i) => [offset + i]) } }
    }
    const rows = await fetchAllRows(call, '68.0', 'q', { offset: 1000, total: 2500, pageSize: 1000 })
    expect(rows).toHaveLength(1500)
    expect(rows[0]).toEqual([1000])
    expect(asked).toEqual(['?offset=1000&rowLimit=1000', '?offset=2000&rowLimit=500'])
  })
})

describe('export', () => {
  const cols = [{ name: 'a', type: 'Varchar' }, { name: 'b', type: 'Integer' }]
  it('writes CSV with quoting and empty nulls', () => {
    expect(toCsv(cols, [['x,y', 1], [null, 2], ['say "hi"', 3]])).toBe('a,b\r\n"x,y",1\r\n,2\r\n"say ""hi""",3')
  })
  it('writes Markdown with the SQL and a row cap', () => {
    const md = resultMarkdown('SELECT a, b FROM t', cols, [['1|2', 1], ['z', 2]], { total: 10, max: 1 })
    expect(md).toContain('```sql\nSELECT a, b FROM t\n```')
    expect(md).toContain('10 rows, first 1 shown.')
    expect(md).toContain('| a (Varchar) | b (Integer) |')
    expect(md).toContain('| 1\\|2 | 1 |')
    expect(md).not.toContain('| z |')
  })
})
