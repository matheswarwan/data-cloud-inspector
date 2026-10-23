import { describe, it, expect } from 'vitest'
import * as dagre from '@dagrejs/dagre'
import { diagramGraph, layoutDiagram, gridLayout, toMermaid, toDot, toDrawio, toDiagramMarkdown, edgePath, anchorY, cardinalityText, diagramBounds, neighbours, NODE } from '../modelDiagram.js'

const f = (name, extra = {}) => ({ name, label: name, type: 'TEXT', ...extra })
const ind = { name: 'ssot__Individual__dlm', label: 'Individual', kind: 'DMO', category: 'Profile', fields: [f('ssot__Id__c', { primaryKey: true }), f('ssot__FirstName__c')], relationships: [
  { from: 'ssot__ContactPointEmail__dlm', fromField: 'ssot__PartyId__c', to: 'ssot__Individual__dlm', toField: 'ssot__Id__c', cardinality: 'MANYTOONE' },
  { from: 'ssot__Individual__dlm', fromField: 'ssot__Id__c', to: 'UnifiedLink__dlm', toField: 'SourceRecordId__c', cardinality: 'ONETOONE' },
] }
const email = { name: 'ssot__ContactPointEmail__dlm', label: 'Contact Point Email', kind: 'DMO', category: 'Related', fields: [f('ssot__Id__c', { primaryKey: true }), f('ssot__PartyId__c'), f('ssot__EmailAddress__c')], relationships: [
  { from: 'ssot__ContactPointEmail__dlm', fromField: 'ssot__PartyId__c', to: 'ssot__Individual__dlm', toField: 'ssot__Id__c', cardinality: 'MANYTOONE' },
] }
const dlo = { name: 'Contact_Home__dll', label: 'Contact_Home', kind: 'DLO', category: '', fields: [f('Id__c')], relationships: [] }
const objects = [ind, email, dlo]
const mappings = [{ source: 'Contact_Home__dll', target: 'ssot__Individual__dlm', fields: [{ source: 'Id__c', target: 'ssot__Id__c' }] }]
const names = new Set(['ssot__Individual__dlm', 'ssot__ContactPointEmail__dlm'])

describe('diagramGraph', () => {
  it('draws each relationship once and counts those to objects not shown', () => {
    const g = diagramGraph(objects, mappings, names)
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ kind: 'rel', from: 'ssot__ContactPointEmail__dlm', to: 'ssot__Individual__dlm', cardinality: 'MANYTOONE' })
    expect(g.nodes.find((n) => n.id === 'ssot__Individual__dlm').outside).toBe(1)
  })
  it('keeps keys and relationship fields only, all fields, or none', () => {
    const keys = diagramGraph(objects, mappings, names).nodes.find((n) => n.id === 'ssot__ContactPointEmail__dlm')
    expect(keys.fields.map((x) => [x.name, x.pk, x.fk])).toEqual([['ssot__Id__c', true, false], ['ssot__PartyId__c', false, true]])
    expect(diagramGraph(objects, mappings, names, { fields: 'all' }).nodes[1].fields).toHaveLength(3)
    const none = diagramGraph(objects, mappings, names, { fields: 'none' }).nodes[0]
    expect(none.fields).toEqual([])
    expect(none.height).toBe(NODE.header)
  })
  it('adds mapped DLOs with mapping edges when asked', () => {
    const g = diagramGraph(objects, mappings, names, { sources: true })
    expect(g.nodes.map((n) => n.kind)).toEqual(['DMO', 'DMO', 'DLO'])
    expect(g.edges.find((e) => e.kind === 'map')).toMatchObject({ from: 'Contact_Home__dll', to: 'ssot__Individual__dlm', count: 1 })
  })
  it('skips names missing from the catalog', () => {
    expect(diagramGraph(objects, [], new Set(['nope'])).nodes).toEqual([])
  })
})

describe('layout and drawing', () => {
  const g = diagramGraph(objects, mappings, names, { sources: true })
  const pos = layoutDiagram(g, dagre)
  it('places every node without overlaps', () => {
    expect(Object.keys(pos).sort()).toEqual(g.nodes.map((n) => n.id).sort())
    const boxes = g.nodes.map((n) => ({ ...pos[n.id], w: n.width, h: n.height }))
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true)
    }
  })
  it('copes with parallel edges and falls back to a grid when dagre fails', () => {
    const par = { nodes: g.nodes, edges: [...g.edges, ...g.edges.map((e) => ({ ...e, id: `${e.id}b` })), ...g.edges.map((e) => ({ ...e, id: `${e.id}c`, from: e.to, to: e.from }))] }
    expect(Object.keys(layoutDiagram(par, dagre))).toHaveLength(g.nodes.length)
    const broken = { graphlib: dagre.graphlib, layout: () => { throw new Error('Not possible to find intersection inside of the rectangle') } }
    expect(layoutDiagram(g, broken)).toEqual(gridLayout(g))
  })
  it('anchors edges at field rows', () => {
    const n = g.nodes.find((x) => x.id === 'ssot__ContactPointEmail__dlm')
    expect(anchorY(n, 'ssot__PartyId__c')).toBe(NODE.header + NODE.pad + NODE.row * 1.5)
    expect(anchorY(n, 'missing')).toBe(n.height / 2)
    const a = g.nodes[0], b = g.nodes[1]
    expect(edgePath(a, { x: 0, y: 0 }, b, { x: 400, y: 0 }, { fromField: '', toField: '' }).d).toMatch(/^M\d+,[\d.]+ C/)
    expect(edgePath(a, { x: 0, y: 0 }, a, { x: 0, y: 0 }, { fromField: 'ssot__Id__c', toField: 'ssot__Id__c' }).d).toContain(`M${a.width},`)
  })
  it('bounds and neighbours', () => {
    const b = diagramBounds(g, pos)
    expect(b.width).toBeGreaterThan(0)
    expect([...neighbours(g, 'ssot__Individual__dlm')].sort()).toEqual(['Contact_Home__dll', 'ssot__ContactPointEmail__dlm', 'ssot__Individual__dlm'])
  })
})

describe('exports', () => {
  const g = diagramGraph(objects, mappings, names, { sources: true })
  it('Mermaid erDiagram', () => {
    const m = toMermaid(g)
    expect(m).toMatch(/^erDiagram\n/)
    expect(m).toContain('TEXT ssot__Id__c PK')
    expect(m).toContain('TEXT ssot__PartyId__c FK')
    expect(m).toContain('ssot__ContactPointEmail__dlm }o--|| ssot__Individual__dlm : "ssot__PartyId__c = ssot__Id__c"')
    expect(m).toContain('Contact_Home__dll }o..|| ssot__Individual__dlm : "maps to"')
  })
  it('Markdown with the diagram and a relationships table', () => {
    const md = toDiagramMarkdown(g, { subtitle: 'x' })
    expect(md).toContain('```mermaid\nerDiagram')
    expect(md).toContain('| Contact Point Email (`ssot__ContactPointEmail__dlm`) | `ssot__PartyId__c` | Individual (`ssot__Individual__dlm`) | `ssot__Id__c` | N:1 |')
  })
  it('DOT and draw.io', () => {
    expect(toDot(g)).toContain('"ssot__ContactPointEmail__dlm" -> "ssot__Individual__dlm" [label="N:1 ssot__PartyId__c = ssot__Id__c"];')
    const x = toDrawio(g, layoutDiagram(g, dagre))
    expect(x).toMatch(/^<mxfile/)
    expect((x.match(/vertex="1"/g) || []).length).toBe(3)
    expect((x.match(/edge="1"/g) || []).length).toBe(2)
    expect(x).not.toMatch(/<b>Individual<\/b>/) // label HTML is escaped inside the attribute
  })
  it('cardinality text', () => {
    expect(cardinalityText('onetomany')).toBe('1:N')
    expect(cardinalityText('NTOONE')).toBe('N:1')
    expect(cardinalityText('')).toBe('')
  })
})
