import { describe, it, expect } from 'vitest'
import { tableFromColumns, streamsDoc, streamsSheets, streamDoc, streamSheets } from '../streamDoc.js'
import { toMarkdown } from '../exportDoc.js'

const cols = [{ key: 'label', label: 'Data stream' }, { key: 'dmos', label: 'Maps into', value: (s) => s.dmos }, { key: 'n', label: 'Records', value: (s) => s.n ?? null }]
const rows = [{ label: 'Contacts', dmos: ['ssot__Individual__dlm', 'ssot__ContactPointEmail__dlm'], n: 12 }, { label: 'Empty', dmos: [] }]

describe('streamDoc (#146)', () => {
  it('turns table columns into cells', () => {
    expect(tableFromColumns(cols, rows)).toEqual({ columns: ['Data stream', 'Maps into', 'Records'], rows: [['Contacts', 'ssot__Individual__dlm, ssot__ContactPointEmail__dlm', '12'], ['Empty', '', '']] })
  })
  it('writes the list', () => {
    const md = toMarkdown(streamsDoc({ columns: cols, rows, org: 'Prod', dataSpace: 'default', at: new Date('2026-10-25T00:00:00Z') }))
    expect(md).toContain('# Data streams: Prod')
    expect(md).toContain('2 data streams')
    expect(md).toContain('| Contacts |')
    expect(streamsSheets({ columns: cols, rows })[0].rows).toHaveLength(2)
  })
  it('writes one stream', () => {
    const stream = { label: 'Contacts', name: 'Contacts_1' }
    const fields = [{ name: 'Email', type: 'STRING', dloField: 'Email__c', dloLabel: 'Email' }]
    const md = toMarkdown(streamDoc({ stream, details: [['Source', 'Salesforce CRM: Contact']], mapsTo: [{ target: 'ssot__Individual__dlm', fields: [1, 2] }], fields, org: 'Prod' }))
    expect(md).toContain('# Data stream: Contacts')
    expect(md).toContain('Salesforce CRM: Contact')
    expect(md).toContain('ssot__Individual__dlm (2 fields)')
    expect(md).toContain('| Email | STRING | Email__c |')
    expect(toMarkdown(streamDoc({ stream, fields: [] }))).toContain('not mapped')
    expect(streamSheets({ stream, fields, mapsTo: [] }).map((s) => s.name)).toEqual(['Stream', 'Source fields', 'Maps into'])
  })
})
