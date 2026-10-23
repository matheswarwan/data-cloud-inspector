import { paletteItems, searchPalette } from '../palette.js'

const items = paletteItems({
  pages: [{ path: '/sql', label: 'SQL' }, { path: '/health', label: 'Health' }],
  objects: [{ name: 'ssot__Individual__dlm', label: 'Individual', kind: 'DMO', fields: [{ name: 'ssot__FirstName__c', label: 'First Name' }] }],
  segments: [{ apiName: 'Test_Segment_1', label: 'Test Segment - 1' }],
  saved: [{ name: 'Series test', sql: 'SELECT x\nFROM t' }],
})

describe('command palette', () => {
  it('builds items with router targets', () => {
    expect(items.find((i) => i.kind === 'Field').to).toEqual({ path: '/objects/ssot__Individual__dlm', query: { field: 'ssot__FirstName__c' } })
    expect(items.find((i) => i.kind === 'Query').to).toEqual({ path: '/sql', query: { sql: 'SELECT x\nFROM t' } })
  })
  it('ranks exact and prefix matches first, fields after objects, and offers Find person', () => {
    const r = searchPalette(items, 'indiv')
    expect(r[0]).toMatchObject({ kind: 'DMO', label: 'Individual' })
    expect(r.at(-1)).toMatchObject({ kind: 'Action', to: { path: '/profile', query: { q: 'indiv' } } })
    expect(searchPalette(items, 'test')[0].kind).toBe('Segment')
    expect(searchPalette(items, 'first')[0].kind).toBe('Field')
    expect(searchPalette(items, '').every((i) => i.kind === 'Page')).toBe(true)
  })
})
