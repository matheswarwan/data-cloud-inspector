// Segment debugger. Checked on a live org (API v68.0, 2026-10-22):
// - GET /ssot/segments?limit=&offset= lists segments: apiName, displayName, marketSegmentId
//   (1sg...), segmentOnApiName, segmentStatus, publishStatus, publishInterval,
//   lastPublishedEndDateTime, lastSegmentMemberCount, segmentMembershipTable, lookbackPeriod,
//   includeCriteria (HTML-escaped JSON);
// - membership DMOs (category Segment_Membership, "<Object> - Latest" _SM_ and "- History" _SMH_)
//   hold Id__c (the member's ID), Segment_Id__c (the 15-character segment ID), Version_Stamp__c
//   (one per publish), Delta_Type__c, Snapshot_Type__c, Timestamp__c.
// Only one criteria shape has been seen live (TextComparison "has value"); the translator covers
// the usual operators and leaves anything else as raw JSON instead of guessing.

import { lit, inList, toObjects } from './profile.js'

export async function loadSegments(call, version) {
  const out = []
  for (let offset = 0; offset < 5000; offset += 100) {
    const res = await call(`/services/data/v${version}/ssot/segments?limit=100&offset=${offset}`)
    if (!res.ok) { if (!out.length) throw new Error(res.error || `HTTP ${res.status}`); break }
    const page = res.data?.segments || []
    out.push(...page.map(normalizeSegment))
    if (page.length < 100 || out.length >= (res.data?.totalSize ?? Infinity)) break
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

export function decodeHtml(s) {
  return String(s ?? '')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

export function parseCriteria(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(decodeHtml(raw)) } catch { return { unparsed: String(raw) } }
}

export function normalizeSegment(s) {
  return {
    apiName: s.apiName,
    label: s.displayName || s.apiName,
    id: s.marketSegmentId || '',
    id15: String(s.marketSegmentId || '').slice(0, 15),
    on: s.segmentOnApiName || '',
    status: s.segmentStatus || '',
    publishStatus: s.publishStatus || '',
    publishInterval: s.publishInterval || '',
    lastPublished: s.lastPublishedEndDateTime || '',
    lastCount: s.lastSegmentMemberCount ?? null,
    membershipTable: s.segmentMembershipTable || '',
    lookback: s.lookbackPeriod || '',
    type: s.segmentType || '',
    dataSpace: s.dataSpace || '',
    created: s.createdDate || '',
    modified: s.lastModifiedDate || '',
    criteria: parseCriteria(s.includeCriteria),
    excludeCriteria: parseCriteria(s.excludeCriteria),
    raw: s,
  }
}

// ---- criteria ----

const isGroup = (n) => Array.isArray(n?.filters) || Array.isArray(n?.criteria) || Array.isArray(n?.children)
const childrenOf = (n) => n.filters || n.criteria || n.children || []

function valuesOf(n) {
  for (const k of ['values', 'value', 'comparisonValue', 'comparisonValues', 'literal']) {
    if (n[k] != null) return Array.isArray(n[k]) ? n[k] : [n[k]]
  }
  const range = [n.lowerBound ?? n.rangeStart ?? n.from, n.upperBound ?? n.rangeEnd ?? n.to].filter((v) => v != null)
  return range
}

const short = (name) => String(name || '').replace(/^ssot__/, '').replace(/__(c|dlm|dll|cio)$/, '')

/** The criteria as plain lines with indentation: `[{ depth, text, raw? }]`. */
export function describeCriteria(node, depth = 0) {
  if (!node) return [{ depth, text: 'No criteria (every record of the object)' }]
  if (node.unparsed) return [{ depth, text: 'Could not read the criteria', raw: node.unparsed }]
  if (isGroup(node)) {
    const op = String(node.operator || node.logicalOperator || 'and').toUpperCase()
    const kids = childrenOf(node)
    return [{ depth, text: `${op === 'OR' ? 'Any' : 'All'} of these (${op}):` }, ...kids.flatMap((k) => describeCriteria(k, depth + 1))]
  }
  const subj = node.subject || {}
  if (!subj.fieldApiName) return [{ depth, text: `Unrecognised rule (${node.type || 'no type'})`, raw: JSON.stringify(node) }]
  const vals = valuesOf(node)
  const via = (node.path || node.joinPath) ? ' (on a related object)' : ''
  return [{ depth, text: `${short(subj.objectApiName)}.${short(subj.fieldApiName)} ${node.operator || '?'}${vals.length ? ` ${vals.map((v) => JSON.stringify(v)).join(', ')}` : ''}${via}` }]
}

/** The top-level conditions, for a rule-by-rule check of one person. */
export function topConditions(node) {
  if (!node) return []
  if (isGroup(node) && String(node.operator || node.logicalOperator || 'and').toLowerCase() === 'and') return childrenOf(node)
  return [node]
}

const OPS = {
  'has value': (f) => `(${f} IS NOT NULL AND CAST(${f} AS VARCHAR) <> '')`,
  'is not null': (f) => `${f} IS NOT NULL`,
  'has no value': (f) => `(${f} IS NULL OR CAST(${f} AS VARCHAR) = '')`,
  'is null': (f) => `${f} IS NULL`,
  'equals': (f, v, text) => (text ? `LOWER(${f}) = LOWER(${lit(v[0])})` : `${f} = ${lit(v[0])}`),
  'is equal to': (f, v, text) => OPS.equals(f, v, text),
  'not equals': (f, v, text) => (text ? `LOWER(${f}) <> LOWER(${lit(v[0])})` : `${f} <> ${lit(v[0])}`),
  'does not equal': (f, v, text) => OPS['not equals'](f, v, text),
  'contains': (f, v) => `${f} ILIKE ${lit(`%${v[0]}%`)}`,
  'does not contain': (f, v) => `(${f} IS NULL OR ${f} NOT ILIKE ${lit(`%${v[0]}%`)})`,
  'begins with': (f, v) => `${f} ILIKE ${lit(`${v[0]}%`)}`,
  'starts with': (f, v) => `${f} ILIKE ${lit(`${v[0]}%`)}`,
  'ends with': (f, v) => `${f} ILIKE ${lit(`%${v[0]}`)}`,
  'is in': (f, v, text) => (text ? `LOWER(${f}) IN (${v.map((x) => `LOWER(${lit(x)})`).join(', ')})` : `${f} IN ${inList(v)}`),
  'is not in': (f, v, text) => `NOT (${OPS['is in'](f, v, text)})`,
  'greater than': (f, v) => `${f} > ${lit(v[0])}`,
  'greater than or equal': (f, v) => `${f} >= ${lit(v[0])}`,
  'less than': (f, v) => `${f} < ${lit(v[0])}`,
  'less than or equal': (f, v) => `${f} <= ${lit(v[0])}`,
  'between': (f, v) => `${f} BETWEEN ${lit(v[0])} AND ${lit(v[1])}`,
  'is true': (f) => `${f} = true`,
  'is false': (f) => `${f} = false`,
}
const NEEDS = { equals: 1, 'is equal to': 1, 'not equals': 1, 'does not equal': 1, contains: 1, 'does not contain': 1, 'begins with': 1, 'starts with': 1, 'ends with': 1, 'is in': 1, 'is not in': 1, 'greater than': 1, 'greater than or equal': 1, 'less than': 1, 'less than or equal': 1, between: 2 }

/**
 * SQL for one criteria node against `on` (aliased `s`), or `{ error }` when it cannot be
 * translated. A rule on another object becomes EXISTS through a direct relationship from
 * the catalog.
 */
export function criteriaSql(node, on, catalog) {
  if (!node) return { sql: 'TRUE' }
  if (node.unparsed) return { error: 'the criteria could not be read' }
  if (isGroup(node)) {
    const parts = childrenOf(node).map((k) => criteriaSql(k, on, catalog))
    const bad = parts.find((p) => p.error)
    if (bad) return bad
    const op = String(node.operator || node.logicalOperator || 'and').toLowerCase() === 'or' ? ' OR ' : ' AND '
    return { sql: parts.length ? `(${parts.map((p) => p.sql).join(op)})` : 'TRUE' }
  }
  const subj = node.subject || {}
  const operator = String(node.operator || '').toLowerCase()
  const make = OPS[operator]
  if (!subj.fieldApiName || !make) return { error: `the operator "${node.operator || node.type}" is not supported yet` }
  const vals = valuesOf(node)
  if ((NEEDS[operator] || 0) > vals.length) return { error: `"${node.operator}" without a value` }
  if (node.path?.length || node.joinPath?.length) return { error: 'rules that follow a relationship path are not supported yet' }
  const text = /text/i.test(node.type || node.subjectFieldDataType || '')
  const obj = subj.objectApiName || on
  if (obj === on) return { sql: make(`s.${subj.fieldApiName}`, vals, text) }
  const rel = directRelationship(on, obj, catalog)
  if (!rel) return { error: `no direct relationship from ${on} to ${obj}` }
  return { sql: `EXISTS (SELECT 1 FROM ${obj} r WHERE r.${rel.otherField} = s.${rel.onField} AND ${make(`r.${subj.fieldApiName}`, vals, text)})` }
}

function directRelationship(on, other, catalog) {
  for (const o of catalog) {
    for (const r of o.relationships || []) {
      if (r.from === other && r.to === on) return { onField: r.toField, otherField: r.fromField }
      if (r.from === on && r.to === other) return { onField: r.fromField, otherField: r.toField }
    }
  }
  return null
}

export function primaryKey(on, catalog) {
  return catalog.find((o) => o.name === on)?.primaryKeys?.[0] || 'ssot__Id__c'
}

/** `{ count, select }` SQL for the segment's criteria, or `{ error }`. */
export function segmentSql(seg, catalog) {
  const where = criteriaSql(seg.criteria, seg.on, catalog)
  if (where.error) return where
  const exclude = seg.excludeCriteria ? criteriaSql(seg.excludeCriteria, seg.on, catalog) : null
  if (exclude?.error) return exclude
  const cond = exclude ? `${where.sql} AND NOT ${exclude.sql}` : where.sql
  const pk = primaryKey(seg.on, catalog)
  return {
    count: `SELECT COUNT(*) AS members FROM ${seg.on} s WHERE ${cond}`,
    select: `SELECT s.${pk}\nFROM ${seg.on} s\nWHERE ${cond}\nLIMIT 1000`,
    where: cond,
  }
}

// ---- membership ----

/** The Latest and History membership DMOs for the object a segment is on. */
export function membershipTables(seg, catalog) {
  const tables = catalog.filter((o) => o.category === 'Segment_Membership' && o.relationships.some((r) => r.to === seg.on || r.from === seg.on))
  const history = tables.find((t) => t.name === seg.membershipTable) || tables.find((t) => /_SMH_/.test(t.name) || /history/i.test(t.label))
  const latest = tables.find((t) => t !== history && (/_SM_/.test(t.name) || /latest/i.test(t.label)))
  return { latest: latest?.name || null, history: history?.name || null }
}

export async function membershipCount(q, table, seg) {
  if (!table) return null
  const r = toObjects(await q(`SELECT COUNT(*) AS n FROM ${table} WHERE Segment_Id__c = ${lit(seg.id15)}`))
  return Number(r[0]?.n ?? 0)
}

/** One row per publish, newest first: `{ version, at, members, added, removed }`. */
export async function publishHistory(q, table, seg) {
  if (!table) return []
  const rows = toObjects(await q(`SELECT Version_Stamp__c AS version, MIN(Timestamp__c) AS at, Delta_Type__c AS delta, COUNT(*) AS n FROM ${table} WHERE Segment_Id__c = ${lit(seg.id15)} GROUP BY Version_Stamp__c, Delta_Type__c ORDER BY Version_Stamp__c DESC LIMIT 200`))
  const byVersion = new Map()
  for (const r of rows) {
    const v = byVersion.get(r.version) || { version: r.version, at: r.at, members: 0, deltas: {} }
    v.deltas[r.delta || 'none'] = Number(r.n)
    v.members += Number(r.n)
    if (r.at && (!v.at || r.at < v.at)) v.at = r.at
    byVersion.set(r.version, v)
  }
  return [...byVersion.values()]
}

/**
 * Is each of `ids` (IDs of the object the segment is on) a member, and does each match the
 * criteria now? With `conditions`, also which top-level conditions each one fails.
 * `[{ id, member, memberSince, matchesNow, failing: [index] }]`
 */
export async function checkMembers(q, seg, catalog, ids, latestTable) {
  const list = inList(ids)
  if (!list) return []
  const pk = primaryKey(seg.on, catalog)
  const sql = segmentSql(seg, catalog)
  const [members, matching] = await Promise.all([
    latestTable ? q(`SELECT Id__c AS id, Timestamp__c AS at FROM ${latestTable} WHERE Segment_Id__c = ${lit(seg.id15)} AND Id__c IN ${list}`).then(toObjects) : [],
    sql.error ? null : q(`SELECT s.${pk} AS id FROM ${seg.on} s WHERE s.${pk} IN ${list} AND ${sql.where}`).then(toObjects),
  ])
  const conds = topConditions(seg.criteria)
  const failing = new Map(ids.map((id) => [id, []]))
  if (conds.length > 1) {
    await Promise.all(conds.map(async (c, i) => {
      const w = criteriaSql(c, seg.on, catalog)
      if (w.error) return
      const ok = new Set(toObjects(await q(`SELECT s.${pk} AS id FROM ${seg.on} s WHERE s.${pk} IN ${list} AND ${w.sql}`)).map((r) => r.id))
      for (const id of ids) if (!ok.has(id)) failing.get(id).push(i)
    }))
  }
  const memberMap = new Map(members.map((m) => [m.id, m.at]))
  const matchSet = matching ? new Set(matching.map((m) => m.id)) : null
  return ids.map((id) => ({
    id,
    member: memberMap.has(id),
    memberSince: memberMap.get(id) || null,
    matchesNow: matchSet ? matchSet.has(id) : null,
    failing: failing.get(id),
  }))
}
