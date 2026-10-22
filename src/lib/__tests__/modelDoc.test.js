import { buildModel, modelMarkdown, modelHtml } from '../modelDoc.js'

const objects = [
  { name: 'ssot__Individual__dlm', label: 'Individual', kind: 'DMO', category: 'Profile', primaryKeys: ['ssot__Id__c'],
    fields: [{ name: 'ssot__Id__c', label: 'Id', type: 'STRING', businessType: 'TEXT', primaryKey: true }, { name: 'ssot__FirstName__c', label: 'First <Name>', type: 'STRING', businessType: 'TEXT' }],
    relationships: [{ from: 'ssot__Party__dlm', to: 'ssot__Individual__dlm', fromField: 'ssot__IndividualId__c', toField: 'ssot__Id__c', cardinality: 'NTOONE' }] },
  { name: 'Contact_Home__dll', label: 'Contact_Home', kind: 'DLO', category: 'Profile', primaryKeys: [], fields: [], relationships: [] },
]
const mappings = [{ name: 'm', source: 'Contact_Home__dll', target: 'ssot__Individual__dlm', fields: [{ source: 'FirstName__c', target: 'ssot__FirstName__c' }] }]
const streams = [{ dlo: 'Contact_Home__dll', label: 'Contact_Home' }]
const usage = { insights: [], segments: [{ name: 'S', label: 'Seg', id: '1sg', on: 'ssot__Individual__dlm', refs: { ssot__Individual__dlm: ['ssot__FirstName__c'] } }], activations: [] }

describe('data model export', () => {
  const model = buildModel({ objects, kinds: ['DMO', 'DLO'], mappings, streams, usage, host: 'acme', dataSpace: 'default', at: new Date('2026-10-23T00:00:00Z') })
  it('builds sections with mappings, streams and usage', () => {
    expect(model.meta).toBe('2026-10-23, data space default. 1 data model objects, 1 data lake objects.')
    const dmo = model.sections[0].objects[0]
    expect(dmo.mappedFrom[0].stream.label).toBe('Contact_Home')
    expect(dmo.fields[1].usedBy).toEqual(['Seg (segment)'])
    expect(dmo.usedBy).toEqual(['Seg (segment)'])
    expect(model.sections[1].objects[0].mapsTo).toEqual(['ssot__Individual__dlm'])
  })
  it('writes Markdown', () => {
    const md = modelMarkdown(model)
    expect(md).toContain('### Individual (`ssot__Individual__dlm`)')
    expect(md).toContain('| `ssot__FirstName__c` | First <Name> | TEXT | Seg (segment) |')
    expect(md).toContain('Mapped from `Contact_Home__dll` (stream Contact_Home):')
    expect(md).toContain('Maps to: `ssot__Individual__dlm`.')
  })
  it('writes escaped HTML', () => {
    const html = modelHtml(model)
    expect(html).toContain('<title>Data Cloud data model: acme</title>')
    expect(html).toContain('First &lt;Name&gt;')
    expect(html).not.toContain('First <Name>')
  })
})
