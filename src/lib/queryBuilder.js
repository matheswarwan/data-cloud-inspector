// Query Builder: a starting object, ticked fields, related objects joined through the org's
// metadata relationships (keys filled in), filters, sorting and a limit, turned into Data
// Cloud SQL. Joins use relatedTo() from the profile code: other.otherField = parent.objectField.

import { relatedTo, lit } from './profile.js'

export const OPERATORS = [
  { id: 'eq', label: '=' },
  { id: 'ne', label: '≠' },
  { id: 'contains', label: 'contains' },
  { id: 'starts', label: 'starts with' },
  { id: 'gt', label: '>' },
  { id: 'ge', label: '≥' },
  { id: 'lt', label: '<' },
  { id: 'le', label: '≤' },
  { id: 'in', label: 'is one of (comma separated)' },
  { id: 'empty', label: 'is empty', noValue: true },
  { id: 'notEmpty', label: 'is not empty', noValue: true },
]

/** The relationships an object can be joined through: `[{ object, objectField, otherField, category, label }]`. */
export function joinOptions(objectName, catalog) {
  const byName = new Map(catalog.map((o) => [o.name, o]))
  return relatedTo(objectName, catalog).map((r) => ({ ...r, label: byName.get(r.object)?.label || r.object }))
}

export function emptyModel(base = '') {
  return { base, fields: [], joins: [], filters: [], orderBy: [], limit: 100, distinct: false }
}

let nextJoin = 1
/** Adds a join under `parent` (an alias: 't0' for the base). Returns its alias. */
export function addJoin(model, parent, option) {
  const alias = `t${nextJoinAlias(model)}`
  model.joins.push({ alias, parent, object: option.object, parentField: option.objectField, field: option.otherField, type: 'LEFT', fields: [], id: nextJoin++ })
  return alias
}

function nextJoinAlias(model) {
  const used = new Set(model.joins.map((j) => Number(j.alias.slice(1))))
  let i = 1
  while (used.has(i)) i++
  return i
}

/** Removes a join and everything joined under it, with their filters and sorts. */
export function removeJoin(model, alias) {
  const gone = new Set([alias])
  let changed = true
  while (changed) {
    changed = false
    for (const j of model.joins) if (!gone.has(j.alias) && gone.has(j.parent)) { gone.add(j.alias); changed = true }
  }
  model.joins = model.joins.filter((j) => !gone.has(j.alias))
  model.filters = model.filters.filter((f) => !gone.has(f.alias))
  model.orderBy = model.orderBy.filter((o) => !gone.has(o.alias))
}

export function objectOf(model, alias) {
  return alias === 't0' ? model.base : model.joins.find((j) => j.alias === alias)?.object
}

function fieldType(catalog, object, field) {
  const f = catalog.find((o) => o.name === object)?.fields.find((x) => x.name === field)
  return String(f?.businessType || f?.type || '').toUpperCase()
}

function value(catalog, object, field, v) {
  const t = fieldType(catalog, object, field)
  if (/NUMBER|PERCENT|CURRENCY|INT|DOUBLE/.test(t) && v !== '' && !Number.isNaN(Number(v))) return String(Number(v))
  if (/BOOLEAN/.test(t) && /^(true|false)$/i.test(String(v))) return String(v).toLowerCase()
  return lit(v)
}

export function filterSql(model, catalog, f) {
  const col = `${f.alias}.${f.field}`
  const obj = objectOf(model, f.alias)
  const v = (x) => value(catalog, obj, f.field, x)
  switch (f.op) {
    case 'eq': return `${col} = ${v(f.value)}`
    case 'ne': return `${col} <> ${v(f.value)}`
    case 'contains': return `${col} ILIKE ${lit(`%${f.value}%`)}`
    case 'starts': return `${col} ILIKE ${lit(`${f.value}%`)}`
    case 'gt': return `${col} > ${v(f.value)}`
    case 'ge': return `${col} >= ${v(f.value)}`
    case 'lt': return `${col} < ${v(f.value)}`
    case 'le': return `${col} <= ${v(f.value)}`
    case 'in': {
      const items = String(f.value).split(',').map((x) => x.trim()).filter(Boolean)
      return items.length ? `${col} IN (${items.map(v).join(', ')})` : null
    }
    case 'empty': return `(${col} IS NULL OR CAST(${col} AS VARCHAR) = '')`
    case 'notEmpty': return `(${col} IS NOT NULL AND CAST(${col} AS VARCHAR) <> '')`
    default: return null
  }
}

/** The SQL for a model, or '' when there is no starting object. `{ limit: false }` leaves LIMIT out. */
export function buildSql(model, catalog, { limit = true } = {}) {
  if (!model.base) return ''
  const sel = []
  const seen = new Map()
  const add = (alias, field) => {
    const n = (seen.get(field) || 0) + 1
    seen.set(field, n)
    sel.push(n === 1 ? `${alias}.${field}` : `${alias}.${field} AS ${alias}_${field}`)
  }
  model.fields.forEach((f) => add('t0', f))
  for (const j of model.joins) j.fields.forEach((f) => add(j.alias, f))
  const lines = [`SELECT${model.distinct ? ' DISTINCT' : ''}`, `  ${sel.length ? sel.join(',\n  ') : 't0.*'}`, `FROM ${model.base} t0`]
  for (const j of model.joins) {
    lines.push(`${j.type === 'INNER' ? 'JOIN' : 'LEFT JOIN'} ${j.object} ${j.alias} ON ${j.alias}.${j.field} = ${j.parent}.${j.parentField}`)
  }
  const where = model.filters.map((f) => (f.field && f.op && (OPERATORS.find((o) => o.id === f.op)?.noValue || String(f.value ?? '').trim() !== '') ? filterSql(model, catalog, f) : null)).filter(Boolean)
  if (where.length) lines.push(`WHERE ${where.join('\n  AND ')}`)
  const order = model.orderBy.filter((o) => o.field).map((o) => `${o.alias}.${o.field}${o.dir === 'DESC' ? ' DESC' : ''}`)
  if (order.length) lines.push(`ORDER BY ${order.join(', ')}`)
  if (limit && Number(model.limit) > 0) lines.push(`LIMIT ${Math.floor(Number(model.limit))}`)
  return lines.join('\n')
}

/** COUNT(*) of the model's rows (no limit, no sort). */
export function countSql(model, catalog) {
  const inner = buildSql({ ...model, orderBy: [] }, catalog, { limit: false })
  return inner ? `SELECT COUNT(*) AS n FROM (\n${inner}\n) q` : ''
}
