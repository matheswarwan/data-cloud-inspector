import { describeShape, summarize } from '../shape.js'

describe('describeShape', () => {
  it('keeps keys and types but no values', () => {
    const shape = describeShape({ totalSize: 2, records: [{ name: 'Secret Co', id: 'a1' }, { name: 'Other', extra: true }] })
    expect(shape).toBe('{ totalSize: number, records: [2 × { name: string, id: string, extra: boolean }] }')
    expect(shape).not.toMatch(/Secret/)
  })
  it('handles nested arrays, nulls and depth', () => {
    expect(describeShape({ data: [['a', 1]], x: null })).toBe('{ data: [1 × [2 × string]], x: null }')
    expect(describeShape({ a: { b: { c: { d: 1 } } } }, 2)).toBe('{ a: { b: { 1 keys } } }')
  })
})

describe('summarize', () => {
  it('counts the lists in a response', () => {
    expect(summarize({ dataModelObject: [1, 2, 3], totalSize: 3 })).toBe('dataModelObject: 3')
    expect(summarize([1, 2])).toBe('2 items')
  })
})
