import { problemCounts, withProblems, latestProblemsSql } from '../problems.js'

describe('problem records', () => {
  it('counts each problem DLO once and reports failures', async () => {
    const seen = []
    const call = async (path, opts) => {
      seen.push(opts.body.sql)
      if (opts.body.sql.includes('Bad__dll')) return { ok: false, error: 'BAD_REQUEST' }
      return { ok: true, data: { data: [[3, '2026-10-22T10:00:00Z']], metadata: [{ name: 'n' }, { name: 'latest' }], status: { completionStatus: 'ResultsProduced', rowCount: 1 } } }
    }
    const m = await problemCounts(call, '68.0', ['PR_A__dll', 'PR_A__dll', 'Bad__dll', ''])
    expect(seen).toHaveLength(2)
    expect(m.get('PR_A__dll')).toEqual({ count: 3, latest: '2026-10-22T10:00:00Z', error: '' })
    expect(m.get('Bad__dll').error).toBe('BAD_REQUEST')
  })
  it('turns an OK stream with rejected rows into needs a look', () => {
    const ok = { level: 'ok', reason: 'Last run succeeded', problemDlo: 'PR_A__dll' }
    expect(withProblems(ok, { count: 3, latest: 't' })).toMatchObject({ level: 'warn', reason: 'Rows were rejected: 3 problem records, latest t' })
    expect(withProblems(ok, { count: 0 }).level).toBe('ok')
    expect(withProblems({ ...ok, level: 'fail', reason: 'Last run: failure' }, { count: 1 }).reason).toBe('Last run: failure; 1 problem record')
    expect(latestProblemsSql('PR_A__dll')).toContain('ORDER BY error_timestamp__c DESC')
  })
})
