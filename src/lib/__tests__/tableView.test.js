import { describe, it, expect } from 'vitest'
import { tableRows, distinctValues, nextSort, filterActive, valueText } from '../tableView.js'

const cols = [
  { key: 'name' },
  { key: 'category' },
  { key: 'fields', kind: 'number' },
  { key: 'sources', value: (r) => r.src },
]
const rows = [
  { name: 'Individual', category: 'Profile', fields: 22, src: ['Contact_Home__dll'] },
  { name: 'Email Engagement', category: 'Engagement', fields: 9, src: [] },
  { name: 'Account', category: 'Profile', fields: 33, src: ['Account_Home__dll', 'X__dll'] },
  { name: 'Unit', category: '', fields: null, src: [] },
]

describe('tableRows', () => {
  it('keeps the order with no sort or filter', () => {
    expect(tableRows(rows, cols).map((r) => r.name)).toEqual(['Individual', 'Email Engagement', 'Account', 'Unit'])
  })
  it('filters on picked values', () => {
    expect(tableRows(rows, cols, { filters: { category: { values: ['Profile'] } } }).map((r) => r.name)).toEqual(['Individual', 'Account'])
  })
  it('filters on blank as a pickable value', () => {
    expect(tableRows(rows, cols, { filters: { category: { values: [''] } } }).map((r) => r.name)).toEqual(['Unit'])
  })
  it('filters on text, case-insensitive, through value() and arrays', () => {
    expect(tableRows(rows, cols, { filters: { sources: { text: 'x__' } } }).map((r) => r.name)).toEqual(['Account'])
    expect(tableRows(rows, cols, { filters: { name: { text: 'EMAIL' } } }).map((r) => r.name)).toEqual(['Email Engagement'])
  })
  it('combines filters on several columns', () => {
    expect(tableRows(rows, cols, { filters: { category: { values: ['Profile'] }, name: { text: 'ind' } } }).map((r) => r.name)).toEqual(['Individual'])
  })
  it('sorts numbers numerically with blanks last both ways', () => {
    expect(tableRows(rows, cols, { sort: { key: 'fields', dir: 'asc' } }).map((r) => r.fields)).toEqual([9, 22, 33, null])
    expect(tableRows(rows, cols, { sort: { key: 'fields', dir: 'desc' } }).map((r) => r.fields)).toEqual([33, 22, 9, null])
  })
  it('sorts text and ignores filters for unknown columns', () => {
    expect(tableRows(rows, cols, { sort: { key: 'name', dir: 'asc' }, filters: { nope: { text: 'z' } } }).map((r) => r.name)).toEqual(['Account', 'Email Engagement', 'Individual', 'Unit'])
  })
  it('does not change the input', () => {
    const copy = rows.slice()
    tableRows(rows, cols, { sort: { key: 'name', dir: 'desc' } })
    expect(rows).toEqual(copy)
  })
})

describe('distinctValues', () => {
  it('counts values, blanks last', () => {
    expect(distinctValues(rows, cols[1])).toEqual([{ value: 'Engagement', count: 1 }, { value: 'Profile', count: 2 }, { value: '', count: 1 }])
  })
  it('gives up past the limit', () => {
    expect(distinctValues(rows, cols[0], 3)).toBeNull()
  })
})

describe('helpers', () => {
  it('cycles the sort', () => {
    expect(nextSort(null, 'a')).toEqual({ key: 'a', dir: 'asc' })
    expect(nextSort({ key: 'a', dir: 'asc' }, 'a')).toEqual({ key: 'a', dir: 'desc' })
    expect(nextSort({ key: 'a', dir: 'desc' }, 'a')).toBeNull()
    expect(nextSort({ key: 'a', dir: 'desc' }, 'b')).toEqual({ key: 'b', dir: 'asc' })
  })
  it('knows active filters', () => {
    expect(filterActive({ text: ' ' })).toBe(false)
    expect(filterActive({ values: [] })).toBe(true)
    expect(filterActive({ text: 'a' })).toBe(true)
    expect(filterActive(undefined)).toBe(false)
  })
  it('joins arrays', () => { expect(valueText(['a', 'b'])).toBe('a, b') })
})
