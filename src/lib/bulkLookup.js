// Bulk lookup: a pasted list of emails, phones or IDs, checked in batches of 200 per query:
// found or not, the source records, the unified profile under a ruleset, and (optionally)
// membership of a segment and whether the person matches its criteria now.

import { searchKind, toObjects, inList, INDIVIDUAL, relatedTo } from './profile.js'
import { segmentSql, primaryKey } from './segments.js'

const BATCH = 200
export const MAX_INPUTS = 1000


/**
 * Short runs of digits with no + or separators (up to 9) are record numbers, not phones
 * (feedback #120: '10000012' was taken for a phone).
 */
export function detectKind(v) {
  const t = String(v).trim()
  if (/^\d{1,9}$/.test(t)) return 'id'
  const kind = searchKind(t)
  return kind === 'name' ? 'unknown' : kind
}

/**
 * The values, deduplicated, each with a kind: detected (`as = 'auto'`), or the one chosen
 * ('email', 'phone', 'id', or 'field' for a field you pick).
 */
export function parseInputs(text, { as = 'auto' } = {}) {
  const seen = new Set()
  const out = []
  for (const raw of String(text || '').split(/[\n,;\t]+/)) {
    const v = raw.trim().replace(/^["']|["']$/g, '')
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ input: v, kind: as === 'auto' ? detectKind(v) : as })
  }
  return out
}

/** How many values of each kind: `{ email: 3, id: 7 }`. */
export function kindCounts(items) {
  const out = {}
  for (const i of items) out[i.kind] = (out[i.kind] || 0) + 1
  return out
}

/**
 * Fields you can look values up in (feedback #120): Individual's own fields, and the fields of
 * objects related to Individual, with the field that leads to the Individual ID.
 * `[{ object, label, link, fields: [{ name, label }] }]`
 */
export function lookupTargets(catalog) {
  const ind = catalog.find((o) => o.name === INDIVIDUAL)
  if (!ind) return []
  const out = [{ object: INDIVIDUAL, label: ind.label, link: 'ssot__Id__c', fields: ind.fields.map((f) => ({ name: f.name, label: f.label })) }]
  for (const r of relatedTo(INDIVIDUAL, catalog)) {
    if (r.objectField !== 'ssot__Id__c' || out.some((t) => t.object === r.object)) continue
    const o = catalog.find((x) => x.name === r.object)
    if (o) out.push({ object: o.name, label: o.label, link: r.otherField, fields: o.fields.map((f) => ({ name: f.name, label: f.label })) })
  }
  return out.sort((a, b) => (a.object === INDIVIDUAL ? -1 : b.object === INDIVIDUAL ? 1 : a.label.localeCompare(b.label)))
}

/** The digit strings a phone may be stored as: as typed, and without a 1 to 3 digit country code. */
export function phoneKeys(v) {
  const d = String(v).replace(/\D/g, '')
  const keys = new Set([d])
  if (/^\+/.test(String(v).trim()) || d.length > 10) for (const cc of [1, 2, 3]) if (d.length - cc >= 7) keys.add(d.slice(cc))
  return [...keys]
}

function chunks(list, n = BATCH) {
  const out = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

/**
 * `[{ input, kind, sourceIds, unifiedIds, member, matchesNow, note }]` in input order.
 * `progress(text)` reports each step.
 */
export async function bulkLookup(q, items, { ruleset = null, segment = null, catalog = [], latestTable = null, field = null, progress = () => {} } = {}) {
  const rows = items.slice(0, MAX_INPUTS).map((i) => ({ ...i, sourceIds: [], unifiedIds: [], member: null, matchesNow: null, note: i.kind === 'unknown' ? 'Not an email, phone or ID' : '' }))
  const byKind = (k) => rows.filter((r) => r.kind === k)

  // Emails
  const emails = byKind('email')
  for (const [n, part] of chunks(emails).entries()) {
    progress(`emails ${n * BATCH + 1} to ${n * BATCH + part.length} of ${emails.length}`)
    const found = toObjects(await q(`SELECT LOWER(ssot__EmailAddress__c) AS v, ssot__PartyId__c AS id FROM ssot__ContactPointEmail__dlm WHERE LOWER(ssot__EmailAddress__c) IN ${inList(part.map((r) => r.input.toLowerCase()))}`))
    for (const r of part) r.sourceIds = [...new Set(found.filter((f) => f.v === r.input.toLowerCase()).map((f) => f.id))]
  }

  // Phones
  const phones = byKind('phone')
  for (const [n, part] of chunks(phones).entries()) {
    progress(`phones ${n * BATCH + 1} to ${n * BATCH + part.length} of ${phones.length}`)
    const keys = part.flatMap((r) => phoneKeys(r.input))
    const digits = "REGEXP_REPLACE(COALESCE(ssot__TelephoneNumber__c, ''), '[^0-9]', '', 'g')"
    const e164 = "REGEXP_REPLACE(COALESCE(ssot__FormattedE164PhoneNumber__c, ''), '[^0-9]', '', 'g')"
    const found = toObjects(await q(`SELECT ${digits} AS d1, ${e164} AS d2, ssot__PartyId__c AS id FROM ssot__ContactPointPhone__dlm WHERE ${digits} IN ${inList(keys)} OR ${e164} IN ${inList(keys)}`))
    for (const r of part) {
      const ks = new Set(phoneKeys(r.input))
      r.sourceIds = [...new Set(found.filter((f) => ks.has(f.d1) || ks.has(f.d2)).map((f) => f.id))]
    }
  }

  // IDs: source Individual IDs (and external record IDs), party identification numbers,
  // else unified IDs of the ruleset
  const ids = byKind('id')
  const ind = catalog.find((o) => o.name === INDIVIDUAL)
  const hasExternal = !!ind?.fields.some((f) => f.name === 'ssot__ExternalRecordId__c')
  const partyIdent = catalog.find((o) => o.name === 'ssot__PartyIdentification__dlm')
  const partyNumber = partyIdent?.fields.some((f) => f.name === 'ssot__IdentificationNumber__c') && partyIdent.fields.some((f) => f.name === 'ssot__PartyId__c')
  for (const [n, part] of chunks(ids).entries()) {
    progress(`IDs ${n * BATCH + 1} to ${n * BATCH + part.length} of ${ids.length}`)
    const list = inList(part.map((r) => r.input))
    const found = toObjects(await q(`SELECT ssot__Id__c AS id${hasExternal ? ', ssot__ExternalRecordId__c AS ext' : ''} FROM ${INDIVIDUAL} WHERE ssot__Id__c IN ${list}${hasExternal ? ` OR ssot__ExternalRecordId__c IN ${list}` : ''}`))
    for (const r of part) {
      if (found.some((f) => f.id === r.input)) r.sourceIds = [r.input]
      else {
        const ext = found.filter((f) => f.ext === r.input).map((f) => f.id)
        if (ext.length) { r.sourceIds = [...new Set(ext)]; r.note = 'External record ID' }
      }
    }
    let rest = part.filter((r) => !r.sourceIds.length)
    if (rest.length && partyNumber) {
      const nums = toObjects(await q(`SELECT ssot__IdentificationNumber__c AS v, ssot__PartyId__c AS id FROM ssot__PartyIdentification__dlm WHERE ssot__IdentificationNumber__c IN ${inList(rest.map((r) => r.input))}`))
      for (const r of rest) {
        const mine = nums.filter((x) => String(x.v) === r.input).map((x) => x.id)
        if (mine.length) { r.sourceIds = [...new Set(mine)]; r.note = 'Party identification number' }
      }
      rest = rest.filter((r) => !r.sourceIds.length)
    }
    if (rest.length && ruleset?.link) {
      const links = toObjects(await q(`SELECT UnifiedRecordId__c AS u, SourceRecordId__c AS s FROM ${ruleset.link} WHERE UnifiedRecordId__c IN ${inList(rest.map((r) => r.input))}`))
      for (const r of rest) {
        const mine = links.filter((l) => l.u === r.input)
        if (mine.length) { r.sourceIds = mine.map((l) => l.s); r.note = 'Unified ID' }
      }
    }
  }

  // A field you picked (feedback #120): its value, and the field that leads to the Individual ID
  const byField = byKind('field')
  if (byField.length && field?.object && field?.field && field?.link) {
    for (const [n, part] of chunks(byField).entries()) {
      progress(`${field.field} ${n * BATCH + 1} to ${n * BATCH + part.length} of ${byField.length}`)
      const found = toObjects(await q(`SELECT CAST(${field.field} AS VARCHAR) AS v, ${field.link} AS id FROM ${field.object} WHERE CAST(${field.field} AS VARCHAR) IN ${inList(part.map((r) => r.input))}`))
      for (const r of part) r.sourceIds = [...new Set(found.filter((f) => String(f.v) === r.input).map((f) => f.id).filter(Boolean))]
    }
  }

  // Unified profiles of every source record found
  const allSources = [...new Set(rows.flatMap((r) => r.sourceIds))]
  const unifiedOf = new Map()
  if (ruleset?.link) {
    for (const [n, part] of chunks(allSources).entries()) {
      progress(`unified profiles ${n * BATCH + 1} to ${n * BATCH + part.length} of ${allSources.length}`)
      for (const l of toObjects(await q(`SELECT SourceRecordId__c AS s, UnifiedRecordId__c AS u FROM ${ruleset.link} WHERE SourceRecordId__c IN ${inList(part)}`))) unifiedOf.set(l.s, l.u)
    }
  }
  for (const r of rows) r.unifiedIds = [...new Set(r.sourceIds.map((s) => unifiedOf.get(s)).filter(Boolean))]

  // Segment membership and criteria
  if (segment) {
    const onUnified = ruleset && segment.on === ruleset.unified
    const keyOf = (r) => (onUnified ? r.unifiedIds : r.sourceIds)
    const keys = [...new Set(rows.flatMap(keyOf))]
    const members = new Set()
    const matching = new Set()
    const sql = segmentSql(segment, catalog)
    const pk = primaryKey(segment.on, catalog)
    for (const [n, part] of chunks(keys).entries()) {
      progress(`segment ${n * BATCH + 1} to ${n * BATCH + part.length} of ${keys.length}`)
      if (latestTable) for (const m of toObjects(await q(`SELECT Id__c AS id FROM ${latestTable} WHERE Segment_Id__c = '${segment.id15}' AND Id__c IN ${inList(part)}`))) members.add(m.id)
      if (!sql.error) for (const m of toObjects(await q(`SELECT s.${pk} AS id FROM ${segment.on} s WHERE s.${pk} IN ${inList(part)} AND ${sql.where}`))) matching.add(m.id)
    }
    for (const r of rows) {
      const k = keyOf(r)
      if (!k.length) continue
      r.member = k.some((x) => members.has(x))
      r.matchesNow = sql.error ? null : k.some((x) => matching.has(x))
    }
  }
  for (const r of rows) if (!r.note && r.kind !== 'unknown' && !r.sourceIds.length) r.note = 'Not found'
  return rows
}

export function bulkSummary(rows) {
  return {
    total: rows.length,
    found: rows.filter((r) => r.sourceIds.length).length,
    notFound: rows.filter((r) => r.kind !== 'unknown' && !r.sourceIds.length).length,
    unknown: rows.filter((r) => r.kind === 'unknown').length,
    unified: rows.filter((r) => r.unifiedIds.length).length,
    members: rows.filter((r) => r.member).length,
    severalProfiles: rows.filter((r) => r.unifiedIds.length > 1).length,
  }
}

export function bulkCsv(rows, { segment = null } = {}) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  const head = ['input', 'kind', 'found', 'source_ids', 'unified_ids', ...(segment ? ['segment_member', 'matches_criteria_now'] : []), 'note']
  const yn = (v) => (v == null ? '' : v ? 'yes' : 'no')
  return [head.join(','), ...rows.map((r) => [r.input, r.kind, yn(r.sourceIds.length > 0), r.sourceIds.join(' '), r.unifiedIds.join(' '), ...(segment ? [yn(r.member), yn(r.matchesNow)] : []), r.note].map(esc).join(','))].join('\r\n')
}
