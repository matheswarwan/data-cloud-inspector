import { describe, it, expect } from 'vitest'
import { diagramToDiagramforce } from '../diagramforce.js'

describe('Open in Diagramforce (feedback #1013)', () => {
  it('turns a data model drawing into Diagramforce cards and lines', () => {
    const graph = {
      nodes: [
        { id: 'ssot__Individual__dlm', kind: 'DMO', name: 'ssot__Individual__dlm', label: 'Individual', fields: [{ name: 'ssot__Id__c', type: 'TEXT', pk: true }] },
        { id: 'ssot__ContactPointEmail__dlm', kind: 'DMO', name: 'ssot__ContactPointEmail__dlm', label: 'Contact Point Email', fields: [{ name: 'ssot__PartyId__c', fk: true }] },
        { id: 'stream:Web', kind: 'STREAM', name: 'Web', label: 'Web', fields: [] },
      ],
      edges: [
        { kind: 'rel', from: 'ssot__ContactPointEmail__dlm', to: 'ssot__Individual__dlm', fromField: 'ssot__PartyId__c', toField: 'ssot__Id__c', cardinality: 'NTOONE' },
        { kind: 'feed', from: 'stream:Web', to: 'ssot__Individual__dlm' },
      ],
    }
    const d = diagramToDiagramforce(graph, { 'ssot__Individual__dlm': { x: 100, y: 0 } }, { title: 'Model', edgeLabel: (e) => (e.kind === 'feed' ? 'feeds' : 'many to one') })
    expect(d).toMatchObject({ version: 1, appVersion: '1.26.4', title: 'Model', diagramType: 'datamodel' })
    const cards = d.graph.cells.filter((c) => c.type === 'sf.DataObject')
    expect(cards.map((c) => c.objectName)).toEqual(['Individual (ssot__Individual__dlm)', 'Contact Point Email (ssot__ContactPointEmail__dlm)', 'Web (data stream)'])
    expect(cards[0].fields[0]).toMatchObject({ apiName: 'ssot__Id__c', type: 'TEXT', keyType: 'pk', fid: 'n0f0' })
    expect(cards[0].position).toEqual({ x: 215, y: 80 })
    const [rel, feed] = d.graph.cells.filter((c) => c.type === 'standard.Link')
    expect(rel.source).toEqual({ id: 'obj-1', port: 'field-right-n1f0' })
    expect(rel.target).toEqual({ id: 'obj-0', port: 'field-left-n0f0' })
    expect(rel.labels[0].attrs.text.text).toBe('many to one')
    expect(feed).toMatchObject({ source: { id: 'obj-2', port: 'er-right' }, target: { id: 'obj-0', port: 'er-left' }, lineStyle: '8 4' })
  })
})
