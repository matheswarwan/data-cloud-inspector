// Query builder (feedback #110, after the Marketing Cloud Toolkit's): a list of tables, each
// after the first joined to an earlier one on one or more conditions; the output fields;
// filters; and options (DISTINCT, GROUP BY, ORDER BY, computed columns, LIMIT). Turned into
// Data Cloud SQL (PostgreSQL-like: plain identifiers, LIMIT at the end).

import { lit } from './profile.js'
import { joinOptions, guessJoin } from './queryBuilder.js'

export const JOIN_TYPES = ['LEFT JOIN', 'INNER JOIN']
export const JOIN_OPS = ['=', '<>', '>', '<', '>=', '<=']
export const FILTER_OPS = [
  { id: '=', label: '=' }, { id: '<>', label: '≠' },
  { id: 'contains', label: 'contains' }, { id: 'starts', label: 'starts with' }, { id: 'ends', label: 'ends with' },
  { id: '>', label: '>' }, { id: '>=', label: '≥' }, { id: '<', label: '<' }, { id: '<=', label: '≤' },
  { id: 'in', label: 'is one of' }, { id: 'notin', label: 'is not one of' },
  { id: 'empty', label: 'is empty', noValue: true }, { id: 'notEmpty', label: 'is not empty', noValue: true },
  { id: 'lastDays', label: 'in the last N days' },
]

export function emptyQuery() {
  return { tables: [], joins: [], where: { combinator: 'AND', conditions: [] }, options: { distinct: false, limit: 100, orderBy: [], groupBy: [], computed: [] } }
}

export const aliasAt = (i) => `t${i + 1}`
const tableIndex = (q, id) => q.tables.findIndex((t) => t.id === id)
const objOf = (catalog, name) => catalog.find((o) => o.name === name)

let seq = 0
const newId = () => `q${Date.now().toString(36)}${(seq++).toString(36)}`

/**
 * Join conditions to suggest between an earlier table and a new one: the metadata
 * relationship, else a shared field (ids first). `[{ left, op, right }]` or [].
 */
export function suggestConditions(leftObj, rightObj, catalog) {
  if (!leftObj || !rightObj) return []
  const rel = joinOptions(leftObj.name, catalog).filter((o) => o.object === rightObj.name)
  if (rel.length) return rel.slice(0, 1).map((r) => ({ left: r.objectField, op: '=', right: r.otherField }))
  const g = guessJoin(leftObj, rightObj, catalog)
  return g.objectField && g.otherField ? [{ left: g.objectField, op: '=', right: g.otherField }] : []
}

/** Which earlier table to join a new table to: one the metadata relates it to, else the last one. */
function bestParent(q, obj, catalog) {
  for (let i = q.tables.length - 1; i >= 0; i--) {
    const t = objOf(catalog, q.tables[i].name)
    if (t && joinOptions(t.name, catalog).some((o) => o.object === obj.name)) return q.tables[i]
  }
  return q.tables[q.tables.length - 1]
}

/** Adds a table (with a suggested join when it is not the first). Returns the new table's id. */
export function addTable(q, name, catalog) {
  const obj = objOf(catalog, name)
  const id = newId()
  const table = { id, name, fields: null } // fields: null = every field
  if (q.tables.length && obj) {
    const parent = bestParent(q, obj, catalog)
    const conditions = suggestConditions(objOf(catalog, parent.name), obj, catalog)
    q.joins.push({ tableId: id, leftId: parent.id, type: 'LEFT JOIN', combinator: 'AND', conditions: conditions.length ? conditions : [{ left: '', op: '=', right: '' }] })
  }
  q.tables.push(table)
  return id
}

/** Removes a table, its join, the joins that hang on it (they move to the first table), and its filters. */
export function removeTable(q, id) {
  const i = tableIndex(q, id)
  if (i < 0) return
  const alias = aliasAt(i)
  q.tables.splice(i, 1)
  q.joins = q.joins.filter((j) => j.tableId !== id)
  const first = q.tables[0]
  for (const j of q.joins) if (j.leftId === id) { j.leftId = first?.id; j.conditions = [{ left: '', op: '=', right: '' }] }
  // The first table has no join: drop it if it had one.
  if (first) q.joins = q.joins.filter((j) => j.tableId !== first.id)
  const keep = (c) => c.alias !== alias
  q.where.conditions = q.where.conditions.filter(keep)
  q.options.orderBy = q.options.orderBy.filter(keep)
  q.options.groupBy = q.options.groupBy.filter(keep)
  renumber(q, i, null)
}

/** Moves a table up or down; a table can only join one placed before it, so joins are checked. */
export function moveTable(q, id, delta) {
  const i = tableIndex(q, id)
  const k = i + delta
  if (i < 0 || k < 0 || k >= q.tables.length) return false
  const order = q.tables.map((t) => t.id)
  ;[order[i], order[k]] = [order[k], order[i]]
  const pos = new Map(order.map((x, n) => [x, n]))
  // Every join must point to an earlier table, and the first table cannot have a join.
  if (q.joins.some((j) => pos.get(j.leftId) >= pos.get(j.tableId))) return false
  if (q.joins.some((j) => pos.get(j.tableId) === 0)) return false
  const before = q.tables.map((t) => t.id)
  q.tables = order.map((x) => q.tables.find((t) => t.id === x))
  renumber(q, null, before)
  return true
}

// Keeps filters and sorts on the same table when aliases shift (aliases follow position).
function renumber(q, removedIndex, beforeOrder) {
  const map = new Map()
  if (beforeOrder) beforeOrder.forEach((id, n) => map.set(aliasAt(n), aliasAt(tableIndex(q, id))))
  else for (let n = removedIndex + 1; n <= q.tables.length; n++) map.set(aliasAt(n), aliasAt(n - 1))
  const fix = (c) => { if (map.has(c.alias)) c.alias = map.get(c.alias) }
  q.where.conditions.forEach(fix)
  q.options.orderBy.forEach(fix)
  q.options.groupBy.forEach(fix)
}

/** `[{ alias, field, label, table, type }]` for the field pickers of filters and options. */
export function fieldOptions(q, catalog) {
  return q.tables.flatMap((t, i) => (objOf(catalog, t.name)?.fields || []).map((f) => ({ alias: aliasAt(i), field: f.name, label: `${aliasAt(i)}.${f.name}`, table: t.name, type: f.businessType || f.type || '' })))
}

const ident = (s) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : `"${String(s).replace(/"/g, '""')}"`)
const col = (alias, field) => `${alias}.${ident(field)}`
const NUMERIC = /NUMBER|PERCENT|CURRENCY|INT|DOUBLE|DECIMAL|FLOAT/i
const BOOL = /BOOLEAN/i
const DATE = /DATE|TIME/i

function valueSql(v, type) {
  const s = String(v ?? '').trim()
  if (NUMERIC.test(type) && s !== '' && !Number.isNaN(Number(s))) return String(Number(s))
  if (BOOL.test(type) && /^(true|false)$/i.test(s)) return s.toLowerCase()
  return lit(s)
}

/** One filter as SQL, or '' when it is not complete. */
export function filterSql(c, type = '') {
  if (!c?.field || !c.op) return ''
  const f = col(c.alias, c.field)
  const v = c.value ?? ''
  const list = () => String(v).split(',').map((x) => x.trim()).filter(Boolean).map((x) => valueSql(x, type))
  switch (c.op) {
    case 'empty': return `(${f} IS NULL${NUMERIC.test(type) || BOOL.test(type) || DATE.test(type) ? '' : ` OR ${f} = ''`})`
    case 'notEmpty': return `(${f} IS NOT NULL${NUMERIC.test(type) || BOOL.test(type) || DATE.test(type) ? '' : ` AND ${f} <> ''`})`
    case 'contains': return String(v) === '' ? '' : `${f} ILIKE ${lit(`%${v}%`)}`
    case 'starts': return String(v) === '' ? '' : `${f} ILIKE ${lit(`${v}%`)}`
    case 'ends': return String(v) === '' ? '' : `${f} ILIKE ${lit(`%${v}`)}`
    case 'in': return list().length ? `${f} IN (${list().join(', ')})` : ''
    case 'notin': return list().length ? `${f} NOT IN (${list().join(', ')})` : ''
    case 'lastDays': return /^\d+$/.test(String(v).trim()) ? `${f} >= CURRENT_DATE - INTERVAL '${Number(v)} days'` : ''
    default: return String(v) === '' ? '' : `${f} ${c.op} ${valueSql(v, type)}`
  }
}

/** The ON clause of a join (multi-line when it has several conditions), or '' when none is complete. */
export function onClause(join, leftAlias, rightAlias) {
  const done = (join?.conditions || []).filter((c) => c.left && c.right)
  return done.map((c, i) => `${i ? `\n    ${join.combinator === 'OR' ? 'OR' : 'AND'} ` : ''}${col(leftAlias, c.left)} ${c.op || '='} ${col(rightAlias, c.right)}`).join('')
}

/** Problems that keep the SQL from running: `[{ tableId?, text }]`. */
export function problems(q) {
  const out = []
  q.tables.forEach((t, i) => {
    if (!i) return
    const j = q.joins.find((x) => x.tableId === t.id)
    if (!j || !onClause(j, 'a', 'b')) out.push({ tableId: t.id, text: `Join condition for ${aliasAt(i)} is incomplete` })
  })
  return out
}

/** The SELECT list: picked fields (duplicates across tables get an alias), or grouped columns, plus computed columns. */
function selectList(q, catalog) {
  const o = q.options
  const groups = (o.groupBy || []).filter((g) => g.field)
  const computed = (o.computed || []).filter((c) => (c.expression || '').trim()).map((c) => ((c.alias || '').trim() ? `${c.expression.trim()} AS ${ident(c.alias.trim())}` : c.expression.trim()))
  if (groups.length) return [...groups.map((g) => col(g.alias, g.field)), ...computed]
  const cols = q.tables.flatMap((t, i) => {
    const names = Array.isArray(t.fields) ? t.fields : (objOf(catalog, t.name)?.fields || []).map((f) => f.name)
    return names.length ? names.map((field) => ({ alias: aliasAt(i), field })) : [{ alias: aliasAt(i), star: true }]
  })
  const count = {}
  for (const c of cols) if (c.field) count[c.field.toLowerCase()] = (count[c.field.toLowerCase()] || 0) + 1
  const out = cols.map((c) => (c.star ? `${c.alias}.*` : count[c.field.toLowerCase()] > 1 ? `${col(c.alias, c.field)} AS ${ident(`${c.alias}_${c.field}`)}` : col(c.alias, c.field)))
  return [...out, ...computed]
}

/** The query as Data Cloud SQL ('' with no tables). `{ limit: false }` leaves LIMIT out (for counting). */
export function buildQuery(q, catalog, { limit = true } = {}) {
  if (!q.tables.length) return ''
  const o = q.options
  const types = new Map(fieldOptions(q, catalog).map((f) => [`${f.alias}.${f.field}`, f.type]))
  const sel = selectList(q, catalog)
  const lines = [`SELECT${o.distinct ? ' DISTINCT' : ''}`, sel.length ? sel.map((c) => `  ${c}`).join(',\n') : '  *']
  lines.push(`FROM ${ident(q.tables[0].name)} ${aliasAt(0)}`)
  q.tables.slice(1).forEach((t, n) => {
    const i = n + 1
    const j = q.joins.find((x) => x.tableId === t.id)
    const li = j ? tableIndex(q, j.leftId) : i - 1
    const on = j ? onClause(j, aliasAt(li < 0 ? 0 : li), aliasAt(i)) : ''
    lines.push(`${j?.type || 'LEFT JOIN'} ${ident(t.name)} ${aliasAt(i)} ON ${on || '/* set the join condition */ TRUE'}`)
  })
  const w = q.where.conditions.map((c) => filterSql(c, types.get(`${c.alias}.${c.field}`) || '')).filter(Boolean)
  if (w.length) lines.push(`WHERE ${w.join(`\n  ${q.where.combinator === 'OR' ? 'OR' : 'AND'} `)}`)
  const groups = (o.groupBy || []).filter((g) => g.field)
  if (groups.length) lines.push(`GROUP BY ${groups.map((g) => col(g.alias, g.field)).join(', ')}`)
  const order = (o.orderBy || []).filter((x) => x.field)
  if (order.length) lines.push(`ORDER BY ${order.map((x) => `${col(x.alias, x.field)} ${x.dir === 'DESC' ? 'DESC' : 'ASC'}`).join(', ')}`)
  const n = Number.parseInt(o.limit, 10)
  if (limit && Number.isFinite(n) && n > 0) lines.push(`LIMIT ${n}`)
  return lines.join('\n')
}

/** COUNT of the rows the query returns (without its LIMIT). */
export function countQuery(q, catalog) {
  const sql = buildQuery(q, catalog, { limit: false })
  return sql ? `SELECT COUNT(*) AS row_count FROM (\n${sql}\n) x` : ''
}
