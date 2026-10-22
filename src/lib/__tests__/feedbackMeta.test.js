import { collectFeedbackMetadata, metadataLines, pagePath, safePath } from '../feedbackMeta.js'

describe('feedback metadata', () => {
  it('drops record IDs from the page and query values from API paths', () => {
    expect(pagePath('/profile/s/003jV00000E4s0mQAB')).toBe('/profile/s/:id')
    expect(pagePath('/objects/ssot__Individual__dlm')).toBe('/objects/ssot__Individual__dlm')
    expect(safePath('/services/data/v68.0/query?q=SELECT+Name+FROM+Contact')).toBe('/services/data/v68.0/query?q')
    expect(safePath('/x?dataspace=default&dmoDeveloperName=A')).toBe('/x?dataspace&dmoDeveloperName')
  })
  it('collects calls and errors and lists them for the preview', () => {
    const calls = [
      { method: 'POST', path: '/ssot/query-sql', status: 400, ms: 90, error: 'unknown column' },
      { method: 'GET', path: '/ssot/metadata?entityType', status: 200, ms: 50, error: null },
    ]
    const meta = collectFeedbackMetadata({ route: '/sql', orgHost: 'acme.my.salesforce.com', apiVersion: '68.0', apiCalls: calls, now: new Date('2026-10-22T00:00:00Z') })
    expect(meta).toMatchObject({ page: '/sql', org: 'acme.my.salesforce.com', apiVersion: '68.0', time: '2026-10-22T00:00:00.000Z' })
    expect(meta.recentApiErrors).toHaveLength(1)
    const lines = metadataLines(meta)
    expect(lines).toContainEqual(['API error 1', 'POST /ssot/query-sql (400): unknown column'])
    expect(lines).toContainEqual(['API call 2', 'GET /ssot/metadata?entityType (200, 50 ms)'])
  })
})
