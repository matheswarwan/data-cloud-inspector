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

// Pages are read by what came back, not what was asked for: an org answered 20 a page to
// limit=100, and stopping at the first short page showed only 20 of 500+ (feedback #121).
export async function loadSegments(call, version, { max = 10000, onPage = null } = {}) {
  const out = []
  const seen = new Set()
  let offset = 0
  while (offset < max) {
    const res = await call(`/services/data/v${version}/ssot/segments?limit=100&offset=${offset}`)
    if (!res.ok) { if (!out.length) throw new Error(res.error || `HTTP ${res.status}`); break }
    const page = res.data?.segments || []
    const fresh = page.filter((x) => !seen.has(x.apiName))
    if (!fresh.length) break // empty, or the API ignored the offset
    for (const x of fresh) seen.add(x.apiName)
    out.push(...fresh.map(normalizeSegment))
    const total = res.data?.totalSize
    onPage?.(out.slice(), total ?? null) // shown while the rest loads (feedback #1005)
    if (total != null && out.length >= total) break
    offset += page.length
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

/** Sorts for the segment list: by name, newest created, latest publish, latest change, most members. */
export const SEGMENT_SORTS = [
  { id: 'name', label: 'Name' },
  { id: 'created', label: 'Newest created' },
  { id: 'published', label: 'Latest refreshed' },
  { id: 'modified', label: 'Latest changed' },
  { id: 'members', label: 'Most members' },
]
export function sortSegments(list, by = 'name') {
  const time = (v) => (v ? Date.parse(v) || 0 : 0)
  const key = { created: (x) => time(x.created), published: (x) => time(x.lastPublished), modified: (x) => time(x.modified), members: (x) => x.lastCount ?? -1 }[by]
  const out = [...list]
  if (!key) return out.sort((a, b) => a.label.localeCompare(b.label))
  return out.sort((a, b) => key(b) - key(a) || a.label.localeCompare(b.label))
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

// Operators as words (feedback #1003: Data Cloud sends "equal", "in", "in the last number
// of days" and the like; unknown ones are shown as sent).
const OP_TEXT = {
  equal: 'is', equals: 'is', 'not equal': 'is not', 'not equals': 'is not', in: 'is one of', 'not in': 'is none of',
  'has value': 'has a value', 'has no value': 'has no value', 'greater than': 'is greater than', 'greater than or equal': 'is at least',
  'less than': 'is less than', 'less than or equal': 'is at most',
}
const COUNT_TEXT = {
  'greater than or equal': (n) => `At least ${n}`, 'greater than': (n) => `More than ${n}`, equal: (n) => `Exactly ${n}`, equals: (n) => `Exactly ${n}`,
  'less than': (n) => `Fewer than ${n}`, 'less than or equal': (n) => `At most ${n}`, 'not equal': (n) => `Not exactly ${n}`,
}
const fmtVal = (v) => (typeof v === 'string' ? JSON.stringify(v) : v && typeof v === 'object' ? JSON.stringify(v) : String(v))

/** One condition as a sentence: `Individual.PrimaryLanguageId is "E"`, `CloseDt is in the last 16 days`. */
export function conditionText(node) {
  const subj = node.subject || {}
  const vals = valuesOf(node)
  const op = String(node.operator || '?')
  const field = `${short(subj.objectApiName)}.${short(subj.fieldApiName)}`
  const via = (node.path?.length || node.joinPath?.length) ? ' (on a related object)' : ''
  // Relative dates: "in the last number of days" with value 16 reads "in the last 16 days".
  if (/number of/i.test(op) && vals.length === 1) return `${field} is ${op.replace(/number of/i, String(vals[0]))}${via}`
  const words = OP_TEXT[op.toLowerCase()] || op
  return `${field} ${words}${vals.length ? ` ${vals.map(fmtVal).join(', ')}` : ''}${via}`
}

/** The criteria as plain lines with indentation: `[{ depth, text, raw? }]`. */
export function describeCriteria(node, depth = 0) {
  if (!node) return [{ depth, text: 'No criteria (every record of the object)' }]
  if (node.unparsed) return [{ depth, text: 'Could not read the criteria', raw: node.unparsed }]
  if (isGroup(node)) {
    const op = String(node.operator || node.logicalOperator || 'and').toUpperCase()
    const kids = childrenOf(node)
    return [{ depth, text: `${op === 'OR' ? 'Any' : 'All'} of these (${op}):` }, ...kids.flatMap((k) => describeCriteria(k, depth + 1))]
  }
  if (isAggregation(node)) return describeAggregation(node, depth)
  // A wrapper with only `filter` (seen inside OR groups): describe what it wraps.
  if (node.filter && !node.subject) return describeCriteria(node.filter, depth)
  const subj = node.subject || {}
  if (!subj.fieldApiName) return [{ depth, text: `Unrecognised rule (${node.type || 'no type'})`, raw: JSON.stringify(node) }]
  return [{ depth, text: conditionText(node) }]
}

// "Count of related records" rules (type NumberAggregation, feedback #1003): `filter` holds the
// conditions on the related records, `comparison` the count (or sum, average...) test.
const isAggregation = (n) => /aggregation/i.test(n?.type || '') || (n?.aggregateFunction && n?.comparison)
function describeAggregation(node, depth) {
  const cmp = node.comparison || {}
  const op = String(cmp.operator || '').toLowerCase()
  const n = valuesOf(cmp)[0]
  const obj = short(node.containerObjectApiName || cmp.subject?.objectApiName) || 'related'
  const fn = String(node.aggregateFunction || 'count').toLowerCase()
  let head
  if (fn === 'count' && COUNT_TEXT[op] && n != null) head = `${COUNT_TEXT[op](n)} related ${obj} record${Number(n) === 1 ? '' : 's'}`
  else {
    const field = cmp.subject?.fieldApiName ? `${obj}.${short(cmp.subject.fieldApiName)}` : `${obj} records`
    head = `${fn === 'count' ? 'Count of' : `${fn[0].toUpperCase()}${fn.slice(1)} of`} ${field} ${OP_TEXT[op] || op || '?'}${n != null ? ` ${fmtVal(n)}` : ''}`
  }
  if (!node.filter) return [{ depth, text: head }]
  return [{ depth, text: `${head} where:` }, ...describeCriteria(node.filter, depth + 1)]
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
  'equal': (f, v, text) => OPS.equals(f, v, text),
  'not equal': (f, v, text) => OPS['not equals'](f, v, text),
  'in': (f, v, text) => OPS['is in'](f, v, text),
  'not in': (f, v, text) => OPS['is not in'](f, v, text),
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
const NEEDS = { equal: 1, 'not equal': 1, in: 1, 'not in': 1, equals: 1, 'is equal to': 1, 'not equals': 1, 'does not equal': 1, contains: 1, 'does not contain': 1, 'begins with': 1, 'starts with': 1, 'ends with': 1, 'is in': 1, 'is not in': 1, 'greater than': 1, 'greater than or equal': 1, 'less than': 1, 'less than or equal': 1, between: 2 }

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
  if (isAggregation(node)) return { error: 'count rules on related records are not supported yet' }
  if (node.filter && !node.subject) return criteriaSql(node.filter, on, catalog)
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

// Membership tables hold the 15-character segment ID; match the 18-character one too in case
// an org stores that.
export function segIdIn(seg) {
  return `IN ${inList([...new Set([seg.id15, seg.id].filter(Boolean))])}`
}

/** The first 15 characters of a Salesforce ID (membership tables use either length). */
export const id15 = (id) => String(id || '').slice(0, 15)

export async function membershipCount(q, table, seg) {
  if (!table) return null
  const r = toObjects(await q(`SELECT COUNT(*) AS n FROM ${table} WHERE Segment_Id__c ${segIdIn(seg)}`))
  return Number(r[0]?.n ?? 0)
}

/** One row per publish, newest first: `{ version, at, members, added, removed }`. */
export async function publishHistory(q, table, seg) {
  if (!table) return []
  const rows = toObjects(await q(`SELECT Version_Stamp__c AS version, Snapshot_Type__c AS snapshot, Delta_Type__c AS delta, MIN(Timestamp__c) AS at, COUNT(*) AS n FROM ${table} WHERE Segment_Id__c ${segIdIn(seg)} GROUP BY Version_Stamp__c, Snapshot_Type__c, Delta_Type__c ORDER BY Version_Stamp__c DESC LIMIT 400`))
  const byVersion = new Map()
  for (const r of rows) {
    const v = byVersion.get(r.version) || { version: r.version, at: r.at, members: 0, deltas: {}, snapshot: r.snapshot || '' }
    v.deltas[r.delta || 'none'] = (v.deltas[r.delta || 'none'] || 0) + Number(r.n)
    v.members += Number(r.n)
    if (r.snapshot) v.snapshot = r.snapshot
    if (r.at && (!v.at || r.at < v.at)) v.at = r.at
    byVersion.set(r.version, v)
  }
  return withSizes([...byVersion.values()])
}

const LEAVES = /delet|remov|exit|drop/i

/**
 * Adds `size` to each publish (newest first in, newest first out). A full snapshot (F) holds
 * every member, minus rows marked as leaving; an incremental one changes the previous size by
 * its added and leaving rows. Only F with "new" rows has been seen live.
 */
export function withSizes(versions) {
  const asc = [...versions].sort((a, b) => String(a.version).localeCompare(String(b.version)))
  let size = null
  for (const v of asc) {
    const leaving = Object.entries(v.deltas).filter(([k]) => LEAVES.test(k)).reduce((n, [, c]) => n + c, 0)
    const staying = v.members - leaving
    if (/^f/i.test(v.snapshot) || size == null) size = staying
    else size = Math.max(0, size + staying - leaving)
    v.size = size
  }
  return asc.reverse()
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
    latestTable ? q(`SELECT Id__c AS id, Timestamp__c AS at FROM ${latestTable} WHERE Segment_Id__c ${segIdIn(seg)} AND Id__c IN ${list}`).then(toObjects) : [],
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

/**
 * The segments `ids` appear in, from a membership history table (feedback #1028): one entry per
 * person and segment, newest publish first. With `seg`, only that segment and the ones nested
 * under it (feedback #1030).
 * `Map(id -> [{ segmentId, parentId, at, version, delta, snapshot, leaving, publishes }])`
 */
export async function personHistory(q, historyTable, ids, seg = null) {
  const list = inList(ids)
  const out = new Map(ids.map((id) => [id, []]))
  if (!historyTable || !list) return out
  const rows = toObjects(await q(`SELECT Id__c AS id, Segment_Id__c AS seg, Parent_Segment_Id__c AS parent, Delta_Type__c AS delta, Snapshot_Type__c AS snapshot, Timestamp__c AS at, Version_Stamp__c AS version FROM ${historyTable} WHERE Id__c IN ${list}${seg ? ` AND (Segment_Id__c ${segIdIn(seg)} OR Parent_Segment_Id__c ${segIdIn(seg)})` : ''} ORDER BY Timestamp__c DESC LIMIT 5000`))
  const seen = new Map()
  for (const r of rows) {
    const key = `${r.id}|${id15(r.seg)}`
    const had = seen.get(key)
    if (had) { had.publishes += 1; continue }
    const e = { segmentId: id15(r.seg), parentId: r.parent ? id15(r.parent) : '', at: r.at || '', version: r.version ?? '', delta: r.delta || '', snapshot: r.snapshot || '', leaving: LEAVES.test(r.delta || ''), publishes: 1 }
    seen.set(key, e)
    out.get(r.id)?.push(e)
  }
  return out
}

/**
 * Names of segments missing from the segment list (nested or other data spaces), from SOQL on
 * MarketSegment (feedback #1030). `Map(id15 -> name)`; empty when the object cannot be read.
 */
export async function segmentNames(call, version, ids15) {
  const out = new Map()
  const ids = [...new Set(ids15.filter(Boolean))].slice(0, 200)
  if (!ids.length) return out
  const soql = `SELECT Id, Name FROM MarketSegment WHERE Id IN (${ids.map((i) => `'${i.replace(/[^\w]/g, '')}'`).join(', ')})`
  const res = await call(`/services/data/v${version}/query?q=${encodeURIComponent(soql)}`)
  if (!res?.ok) return out
  for (const r of res.data?.records || []) out.set(id15(r.Id), r.Name)
  return out
}

const NAME_FIELDS = [['first', 'ssot__FirstName__c'], ['last', 'ssot__LastName__c'], ['person', 'ssot__PersonName__c']]

/** SQL for one page of a segment's members from the latest membership table (feedback #1031). */
export function membersSql(seg, latestTable, { limit = 100, offset = 0 } = {}) {
  return `SELECT Id__c AS id, Timestamp__c AS since FROM ${latestTable} WHERE Segment_Id__c ${segIdIn(seg)} ORDER BY Id__c LIMIT ${limit}${offset ? ` OFFSET ${offset}` : ''}`
}

/**
 * One page of members: `[{ id, since, name }]`. Names come from the object the segment is on
 * when it has name fields (a second query for just these IDs, not a join over the whole table).
 */
export async function loadMembers(q, seg, catalog, latestTable, { limit = 100, offset = 0 } = {}) {
  const rows = toObjects(await q(membersSql(seg, latestTable, { limit, offset })))
  return withNames(q, seg, catalog, rows)
}

/**
 * SQL for one page of the records matching the criteria now (feedback #1033: a segment that
 * never published has nothing in the membership tables), or `{ error }`.
 */
export function matchingSql(seg, catalog, { limit = 100, offset = 0 } = {}) {
  const sql = segmentSql(seg, catalog)
  if (sql.error) return sql
  const pk = primaryKey(seg.on, catalog)
  return { sql: `SELECT s.${pk} AS id FROM ${seg.on} s WHERE ${sql.where} ORDER BY s.${pk} LIMIT ${limit}${offset ? ` OFFSET ${offset}` : ''}` }
}

export async function loadMatching(q, seg, catalog, { limit = 100, offset = 0 } = {}) {
  const m = matchingSql(seg, catalog, { limit, offset })
  if (m.error) throw new Error(m.error)
  return withNames(q, seg, catalog, toObjects(await q(m.sql)))
}

async function withNames(q, seg, catalog, rows) {
  const obj = catalog.find((o) => o.name === seg.on)
  const have = NAME_FIELDS.filter(([, f]) => obj?.fields?.some((x) => x.name === f))
  const names = new Map()
  if (rows.length && have.length) {
    const pk = primaryKey(seg.on, catalog)
    const found = toObjects(await q(`SELECT ${pk} AS id, ${have.map(([a, f]) => `${f} AS ${a}`).join(', ')} FROM ${seg.on} WHERE ${pk} IN ${inList(rows.map((r) => r.id))}`))
    for (const p of found) names.set(p.id, [p.first, p.last].filter(Boolean).join(' ') || p.person || '')
  }
  return rows.map((r) => ({ id: r.id, since: r.since || '', name: names.get(r.id) || '' }))
}
