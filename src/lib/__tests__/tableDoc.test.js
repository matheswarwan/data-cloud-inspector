import { describe, it, expect } from 'vitest'
import { docFrom, sheetsFrom } from '../tableDoc.js'
import { toMarkdown } from '../exportDoc.js'

describe('tableDoc (#149)', () => {
  const sections = [
    { heading: 'Details', kv: [['Status', 'active'], ['Members', 12]] },
    { heading: 'Rows', columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', value: (r) => r.b * 2 }], rows: [{ a: 'x', b: 1 }] },
    { heading: 'Empty', columns: [{ key: 'a', label: 'A' }], rows: [], empty: 'Nothing here.' },
    { heading: 'Criteria', list: ['a = 1', 'b = 2'] },
    { heading: 'SQL', code: 'SELECT 1', lang: 'sql' },
    { text: 'A note.' },
  ]
  it('writes a document', () => {
    const md = toMarkdown(docFrom({ title: 'Segment: S', intro: 'In Prod.', sections }))
    expect(md).toContain('# Segment: S')
    expect(md).toContain('In Prod.')
    expect(md).toContain('## Details')
    expect(md).toContain('| x | 2 |')
    expect(md).toContain('Nothing here.')
    expect(md).toContain('- a = 1')
    expect(md).toContain('SELECT 1')
    expect(md).toContain('A note.')
  })
  it('makes sheets from tables and details', () => {
    expect(sheetsFrom(sections).map((s) => [s.name, s.rows.length])).toEqual([['Details', 2], ['Rows', 1], ['Empty', 0]])
  })
})
