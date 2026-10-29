// Sorting and per-column filters for the tables on every page (DataTable). A column is
// `{ key, label, value?(row), sortValue?(row), kind?, filter?, sort? }`; its value is
// `value(row)` or `row[key]`.

import { compareCells, cellText } from './resultView.js'

/** Most distinct values a column can have and still offer a pick list. */
export const PICK_MAX = 40

export function colValue(col, row) {
  return col.value ? col.value(row) : row?.[col.key]
}

/** Filter text of a value: arrays are joined, objects are JSON. */
export function valueText(v) {
  if (Array.isArray(v)) return v.map(valueText).join(', ')
  return cellText(v)
}

function kindFor(col, rows) {
  if (col.kind) return col.kind
  const sample = rows.map((r) => colValue(col, r)).find((v) => v != null && v !== '')
  return typeof sample === 'number' ? 'number' : 'text'
}

/** A filter is active when it has text, or a pick list that leaves some values out. */
export function filterActive(f) {
  return !!f && (!!f.text?.trim() || Array.isArray(f.values))
}

/**
 * Does a row match the table search (feedback #1036)? Every word of `text` has to appear in
 * some column, ignoring case, so "ada m000" finds a row with that name and that ID.
 */
export function rowMatches(row, columns, text) {
  const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const cells = columns.map((c) => valueText(colValue(c, row)).toLowerCase())
  return words.every((w) => cells.some((t) => t.includes(w)))
}

/**
 * Rows that match the search (`search`, any column) and pass every column filter (`filters`:
 * { [key]: { text, values } }), then sorted.
 */
export function tableRows(rows, columns, { sort = null, filters = {}, search = '' } = {}) {
  const byKey = new Map(columns.map((c) => [c.key, c]))
  const active = Object.entries(filters).filter(([k, f]) => byKey.has(k) && filterActive(f))
  let out = rows.map((row, i) => ({ row, i }))
  if (search.trim()) out = out.filter(({ row }) => rowMatches(row, columns, search))
  for (const [k, f] of active) {
    const col = byKey.get(k)
    const t = f.text?.trim().toLowerCase()
    const picked = Array.isArray(f.values) ? new Set(f.values) : null
    out = out.filter(({ row }) => {
      const s = valueText(colValue(col, row))
      if (picked && !picked.has(s)) return false
      return !t || s.toLowerCase().includes(t)
    })
  }
  const col = sort && byKey.get(sort.key)
  if (col) {
    const kind = kindFor(col, rows)
    const dir = sort.dir === 'desc' ? -1 : 1
    const get = (row) => (col.sortValue ? col.sortValue(row) : colValue(col, row))
    const blank = (v) => v == null || v === ''
    out.sort((a, b) => {
      const x = get(a.row), y = get(b.row)
      const c = compareCells(Array.isArray(x) ? valueText(x) : x, Array.isArray(y) ? valueText(y) : y, kind)
      // Blanks stay last in both directions; ties keep the original order.
      if (blank(x) || blank(y)) return c || a.i - b.i
      return dir * c || a.i - b.i
    })
  }
  return out.map((x) => x.row)
}

/** `[{ value, count }]` for a column's pick list, sorted; null when there are too many values. */
export function distinctValues(rows, col, max = PICK_MAX) {
  const counts = new Map()
  for (const row of rows) {
    const s = valueText(colValue(col, row))
    counts.set(s, (counts.get(s) || 0) + 1)
    if (counts.size > max) return null
  }
  return [...counts].map(([value, count]) => ({ value, count }))
    .sort((a, b) => (a.value === '') - (b.value === '') || a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' }))
}

/** Next sort after a click on a column header: ascending, descending, none. */
export function nextSort(sort, key) {
  if (!sort || sort.key !== key) return { key, dir: 'asc' }
  return sort.dir === 'asc' ? { key, dir: 'desc' } : null
}
