import { dataModelRows, dataModelSheets, dataModelMarkdown } from '../dataModels.js'

const objects = [
  { name: 'ssot__Individual__dlm', label: 'Individual', kind: 'DMO', category: 'Profile', primaryKeys: ['ssot__Id__c'], fields: [{ name: 'ssot__Id__c', label: 'Id', businessType: 'TEXT', primaryKey: true }, { name: 'ssot__FirstName__c', label: 'First Name', businessType: 'TEXT' }], relationships: [] },
  { name: 'ssot__Account__dlm', label: 'Account', kind: 'DMO', category: 'Profile', primaryKeys: [], fields: [], relationships: [] },
  { name: 'Contact_Home__dll', label: 'Contact_Home', kind: 'DLO', category: 'Profile', primaryKeys: [], fields: [], relationships: [] },
]
const mappings = [{ name: 'm', source: 'Contact_Home__dll', target: 'ssot__Individual__dlm', fields: [{ source: 'Id__c', target: 'ssot__Id__c' }, { source: 'FirstName__c', target: 'ssot__FirstName__c' }] }]
const streams = [{ dlo: 'Contact_Home__dll', label: 'Contact_Home' }]
const usage = { insights: [], segments: [{ name: 'S', label: 'Seg', id: '1sg', on: 'ssot__Individual__dlm', refs: { ssot__Individual__dlm: ['ssot__FirstName__c'] } }], activations: [] }

describe('data models', () => {
  it('lists mapped DMOs, or all of them', () => {
    expect(dataModelRows(objects, mappings, streams, usage).map((r) => r.obj.name)).toEqual(['ssot__Individual__dlm'])
    expect(dataModelRows(objects, mappings, streams, usage, { all: true }).map((r) => r.obj.name)).toEqual(['ssot__Account__dlm', 'ssot__Individual__dlm'])
    const [ind] = dataModelRows(objects, mappings, streams, usage)
    expect(ind.sources).toEqual([{ dlo: 'Contact_Home__dll', stream: 'Contact_Home', fields: mappings[0].fields }])
    expect(ind.usedBy).toBe(1)
  })
  it('builds three Excel sheets and a document', () => {
    const rows = dataModelRows(objects, mappings, streams, usage)
    const [dmos, fields, maps] = dataModelSheets(rows, usage)
    expect(dmos.rows[0]).toEqual(['Individual', 'ssot__Individual__dlm', 'Profile', 2, 'Contact_Home__dll', 'Contact_Home', 1])
    expect(fields.rows[1]).toEqual(['ssot__Individual__dlm', 'ssot__FirstName__c', 'First Name', 'TEXT', '', undefined, 'Contact_Home__dll.FirstName__c', 'Seg (segment)'])
    expect(maps.rows).toHaveLength(2)
    expect(dataModelMarkdown(rows, objects, mappings, streams, usage)).toContain('### Individual (`ssot__Individual__dlm`)')
  })
})
