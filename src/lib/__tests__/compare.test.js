import { compareSnapshots, compareMarkdown } from '../compare.js'

const obj = (name, fields, kind = 'DMO') => ({ name, label: name, kind, fields: fields.map(([n, t]) => ({ name: n, businessType: t })) })
const A = { objects: [obj('Ind__dlm', [['Id', 'TEXT'], ['Age', 'NUMBER'], ['Old', 'TEXT']]), obj('OnlyA__dlm', [])], segments: ['S1', 'S2'], insights: ['C1__cio'], streams: ['Contact_Home'] }
const B = { objects: [obj('Ind__dlm', [['Id', 'TEXT'], ['Age', 'TEXT'], ['New', 'TEXT']]), obj('OnlyB__dll', [], 'DLO')], segments: ['S2'], insights: ['C1__cio', 'C2__cio'], streams: ['Contact_Home'] }

describe('compare orgs', () => {
  it('finds objects, fields, types and other items in only one org', () => {
    const d = compareSnapshots(A, B)
    expect(d.objectsOnlyA.map((o) => o.name)).toEqual(['OnlyA__dlm'])
    expect(d.objectsOnlyB).toEqual([{ name: 'OnlyB__dll', label: 'OnlyB__dll', kind: 'DLO' }])
    expect(d.changed).toEqual([{ name: 'Ind__dlm', label: 'Ind__dlm', kind: 'DMO', fieldsOnlyA: ['Old'], fieldsOnlyB: ['New'], typeChanges: [{ field: 'Age', a: 'NUMBER', b: 'TEXT' }] }])
    expect(d.segmentsOnlyA).toEqual(['S1'])
    expect(d.insightsOnlyB).toEqual(['C2__cio'])
    expect(d.streamsOnlyA).toEqual([])
    expect(d.same).toBe(false)
  })
  it('says when two snapshots are the same', () => {
    const d = compareSnapshots(A, A)
    expect(d.same).toBe(true)
    expect(compareMarkdown(d, { a: 'x', b: 'y' })).toContain('No differences')
  })
  it('writes the differences as Markdown', () => {
    const md = compareMarkdown(compareSnapshots(A, B), { a: 'sandbox', b: 'prod', at: new Date('2026-10-23T00:00:00Z') })
    expect(md).toContain('# Data Cloud comparison: sandbox and prod')
    expect(md).toContain('Only in sandbox: `OnlyA__dlm`')
    expect(md).toContain('- `Age`: NUMBER in sandbox, TEXT in prod')
    expect(md).toContain('## Calculated insights')
    expect(md).not.toContain('.salesforce.com')
  })
  it('says which domain each org name stands for (#140)', () => {
    const md = compareMarkdown(compareSnapshots(A, B), { a: 'Sandbox', b: 'x.my.salesforce.com', hosts: { a: 'x--dev.sandbox.my.salesforce.com', b: 'x.my.salesforce.com' } })
    expect(md).toContain('Sandbox: x--dev.sandbox.my.salesforce.com.')
    expect(md).not.toContain('x.my.salesforce.com: x.my.salesforce.com')
  })
})
