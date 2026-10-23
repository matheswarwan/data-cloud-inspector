import { kindOf, compareCells, viewOrder, prettyCell, columnValues } from '../resultView.js'

const cols = [{ name: 'n', type: 'Integer' }, { name: 's', type: 'Varchar' }, { name: 'd', type: 'TimestampTZ' }]
const rows = [
  [10, 'banana', '2026-10-02T00:00:00Z'],
  [9, 'Apple', null],
  [null, 'cherry 2', '2026-10-01T00:00:00Z'],
  [100, 'cherry 10', '2026-10-03T00:00:00Z'],
]

describe('results view', () => {
  it('knows column kinds', () => {
    expect([kindOf('Integer'), kindOf('BigInt'), kindOf('Numeric'), kindOf('TimestampTZ'), kindOf('Date'), kindOf('Varchar'), kindOf('Boolean')]).toEqual(['number', 'number', 'number', 'date', 'date', 'text', 'boolean'])
  })
  it('sorts numbers, text and dates, with nulls last both ways', () => {
    expect(viewOrder(rows, cols, { sort: { col: 0, dir: 'asc' } })).toEqual([1, 0, 3, 2])
    expect(viewOrder(rows, cols, { sort: { col: 0, dir: 'desc' } })).toEqual([3, 0, 1, 2])
    expect(viewOrder(rows, cols, { sort: { col: 1, dir: 'asc' } })).toEqual([1, 0, 2, 3]) // natural: cherry 2 before cherry 10
    expect(viewOrder(rows, cols, { sort: { col: 2, dir: 'desc' } })).toEqual([3, 0, 2, 1])
    expect(compareCells('', 'a', 'text')).toBe(1)
  })
  it('filters on any cell and combines with sort', () => {
    expect(viewOrder(rows, cols, { text: 'CHERRY' })).toEqual([2, 3])
    expect(viewOrder(rows, cols, { text: 'cherry', sort: { col: 0, dir: 'desc' } })).toEqual([3, 2])
    expect(viewOrder(rows, cols, { text: '2026-10-03' })).toEqual([3])
  })
  it('pretty-prints JSON and copies a column in display order', () => {
    expect(prettyCell('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(prettyCell('{not json')).toBe('{not json')
    expect(prettyCell({ b: [1] })).toContain('"b"')
    expect(columnValues(rows, [3, 0], 1)).toBe('cherry 10\nbanana')
  })
})
