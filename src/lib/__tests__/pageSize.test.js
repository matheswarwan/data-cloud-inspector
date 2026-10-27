import { describe, it, expect } from 'vitest'
import { pageOf, PAGE_SIZES } from '../pageSize.js'

describe('table pages (feedback #1015)', () => {
  const rows = Array.from({ length: 123 }, (_, i) => i)
  it('slices a page and keeps the page in range', () => {
    expect(PAGE_SIZES).toEqual([10, 20, 50, 100, 200])
    expect(pageOf(rows, 0, 50)).toMatchObject({ page: 0, pages: 3, from: 1, to: 50 })
    expect(pageOf(rows, 2, 50).rows).toEqual(rows.slice(100))
    expect(pageOf(rows, 9, 50)).toMatchObject({ page: 2, from: 101, to: 123 })
    expect(pageOf([], 0, 50)).toMatchObject({ page: 0, pages: 1, from: 0, to: 0 })
  })
})
