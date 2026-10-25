import { describe, it, expect } from 'vitest'
import { detailPath, unwrap, statusFields } from '../healthDetails.js'

describe('health details (#148)', () => {
  it('knows where each kind keeps its details', () => {
    expect(detailPath({ kind: 'Segment', name: 'A B' }, '68.0')).toBe('/services/data/v68.0/ssot/segments/A%20B')
    expect(detailPath({ kind: 'Activation', name: 'x', recordId: '0s1' }, '68.0')).toBe('/services/data/v68.0/ssot/activations/0s1')
    expect(detailPath({ kind: 'Identity resolution', name: 'r' }, '68.0')).toBe(null)
  })
  it('unwraps a one-item list', () => {
    expect(unwrap({ segments: [{ apiName: 'S' }] })).toEqual({ apiName: 'S' })
    expect(unwrap({ apiName: 'S' })).toEqual({ apiName: 'S' })
    expect(unwrap(null)).toBe(null)
  })
  it('keeps the status and error fields, errors marked', () => {
    const f = statusFields({
      apiName: 'S', publishStatus: 'FAILED', lastPublishedEndDateTime: '2026-10-24T01:00:00Z', publishInterval: 'TWELVE_HOURS',
      lastPublishErrorMessage: 'Query timed out', includeCriteria: '{...}', empty: '',
      runs: [{ status: 'FAILED', errorCode: 'E1' }], statusCodes: ['A', 'B'],
    })
    expect(f).toEqual([
      { path: 'publishStatus', value: 'FAILED', error: false },
      { path: 'lastPublishedEndDateTime', value: '2026-10-24T01:00:00Z', error: false },
      { path: 'publishInterval', value: 'TWELVE_HOURS', error: false },
      { path: 'lastPublishErrorMessage', value: 'Query timed out', error: true },
      { path: 'runs[0].status', value: 'FAILED', error: false },
      { path: 'runs[0].errorCode', value: 'E1', error: true },
      { path: 'statusCodes', value: 'A, B', error: false },
    ])
  })
})
