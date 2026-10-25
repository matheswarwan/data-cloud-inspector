import { describe, it, expect } from 'vitest'
import { describePath, pageOf, loadingText } from '../loadingText.js'

describe('loadingText (#143)', () => {
  it('names what a call reads', () => {
    expect(describePath('/services/data/v68.0/ssot/data-streams?limit=50&offset=100')).toBe('data streams')
    expect(describePath('/services/data/v68.0/ssot/data-model-object-mappings?dmoDeveloperName=X')).toBe('mappings')
    expect(describePath('/services/data/v68.0/ssot/metadata?entityType=DataModelObject')).toBe('data model objects')
    expect(describePath('/services/data/v68.0/ssot/query-sql')).toBe('query')
    expect(describePath('/services/data/v68.0/ssot/query-sql/abc/rows?offset=0&rowLimit=1000')).toBe('query rows')
    expect(describePath('/services/data/v68.0/ssot/something-new')).toBe('something new')
  })
  it('finds the page number', () => {
    expect(pageOf('/x?limit=50&offset=100')).toBe(3)
    expect(pageOf('/x?limit=50&offset=0')).toBe(null)
    expect(pageOf('/x')).toBe(null)
  })
  it('makes one line, jobs first, without naming a job twice', () => {
    expect(loadingText(['/v/ssot/segments?limit=100&offset=200', '/v/ssot/data-model-object-mappings?a', '/v/ssot/data-model-object-mappings?b'], ['data streams: page 2, 50 so far']))
      .toBe('data streams: page 2, 50 so far · segments (page 3) · mappings (2 requests)')
    expect(loadingText(['/v/ssot/data-model-object-mappings?a'], ['mappings: 12 of 52 data model objects'])).toBe('mappings: 12 of 52 data model objects')
    expect(loadingText([], [])).toBe('')
  })
})
