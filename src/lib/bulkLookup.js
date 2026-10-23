// Bulk lookup: a pasted list of emails, phones or IDs, checked in batches of 200 per query:
// found or not, the source records, the unified profile under a ruleset, and (optionally)
// membership of a segment and whether the person matches its criteria now.

import { searchKind, toObjects, inList, INDIVIDUAL } from './profile.js'
import { segmentSql, primaryKey } from './segments.js'

const BATCH = 200
export const MAX_INPUTS = 1000

/** Unique values from pasted text (lines, commas, semicolons or tabs), with their kind. */
export function parseInputs(text) {
  const seen = new Set()
  const out = []
  for (const raw of String(text || '').split(/[\n,;\t]+/)) {
    const v = raw.trim().replace(/^["']|["']$/g, '')
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const kind = searchKind(v)
    out.push({ input: v, kind: kind === 'name' ? 'unknown' : kind })
  }
  return out
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
export async function bulkLookup(q, items, { ruleset = null, segment = null, catalog = [], latestTable = null, progress = () => {} } = {}) {
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

  // IDs: source Individual IDs, else unified IDs of the ruleset
  const ids = byKind('id')
  for (const [n, part] of chunks(ids).entries()) {
    progress(`IDs ${n * BATCH + 1} to ${n * BATCH + part.length} of ${ids.length}`)
    const found = new Set(toObjects(await q(`SELECT ssot__Id__c AS id FROM ${INDIVIDUAL} WHERE ssot__Id__c IN ${inList(part.map((r) => r.input))}`)).map((f) => f.id))
    for (const r of part) if (found.has(r.input)) r.sourceIds = [r.input]
    const rest = part.filter((r) => !r.sourceIds.length)
    if (rest.length && ruleset?.link) {
      const links = toObjects(await q(`SELECT UnifiedRecordId__c AS u, SourceRecordId__c AS s FROM ${ruleset.link} WHERE UnifiedRecordId__c IN ${inList(rest.map((r) => r.input))}`))
      for (const r of rest) {
        const mine = links.filter((l) => l.u === r.input)
        if (mine.length) { r.sourceIds = mine.map((l) => l.s); r.note = 'Unified ID' }
      }
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
