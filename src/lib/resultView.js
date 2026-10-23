// Sorting, filtering and copying for the SQL results table, on the rows already loaded.

const NUMERIC = /int|numeric|decimal|double|float|real|number/i
const DATE = /date|time/i

export function kindOf(type) {
  if (NUMERIC.test(type || '')) return 'number'
  if (DATE.test(type || '')) return 'date'
  if (/bool/i.test(type || '')) return 'boolean'
  return 'text'
}

/** Compares two cell values of a column kind; nulls (and blanks) always sort last. */
export function compareCells(a, b, kind) {
  const empty = (v) => v == null || v === ''
  if (empty(a) && empty(b)) return 0
  if (empty(a)) return 1
  if (empty(b)) return -1
  if (kind === 'number') return Number(a) - Number(b)
  if (kind === 'date') return Date.parse(a) - Date.parse(b)
  if (kind === 'boolean') return (a === true || a === 'true' ? 1 : 0) - (b === true || b === 'true' ? 1 : 0)
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Row indexes in display order: filtered by `text` (any cell contains it) and by `filters`
 * per column index ({ [col]: { text, values } }, values null = all), sorted by `sort`.
 */
export function viewOrder(rows, columns, { text = '', sort = null, filters = {} } = {}) {
  const t = text.trim().toLowerCase()
  let idx = rows.map((_, i) => i)
  if (t) idx = idx.filter((i) => rows[i].some((v) => v != null && cellText(v).toLowerCase().includes(t)))
  for (const [col, f] of Object.entries(filters)) {
    const ft = f?.text?.trim().toLowerCase()
    const picked = Array.isArray(f?.values) ? new Set(f.values) : null
    if (!ft && !picked) continue
    idx = idx.filter((i) => {
      const s = cellText(rows[i][col])
      return (!picked || picked.has(s)) && (!ft || s.toLowerCase().includes(ft))
    })
  }
  if (sort && sort.col != null) {
    const kind = kindOf(columns[sort.col]?.type)
    const dir = sort.dir === 'desc' ? -1 : 1
    idx.sort((x, y) => {
      const c = compareCells(rows[x][sort.col], rows[y][sort.col], kind)
      // Nulls stay last in both directions; ties keep the original order.
      const nullish = (v) => v == null || v === ''
      if (nullish(rows[x][sort.col]) || nullish(rows[y][sort.col])) return c || x - y
      return dir * c || x - y
    })
  }
  return idx
}

export function cellText(v) {
  if (v == null) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

/** A cell value pretty-printed when it is JSON (an object, or a string holding one). */
export function prettyCell(v) {
  if (v != null && typeof v === 'object') return JSON.stringify(v, null, 2)
  const s = cellText(v)
  if (/^\s*[[{]/.test(s)) {
    try { return JSON.stringify(JSON.parse(s), null, 2) } catch { /* not JSON */ }
  }
  return s
}

/** One column's values, one per line, in display order. */
export function columnValues(rows, order, col) {
  return order.map((i) => cellText(rows[i][col])).join('\n')
}
