// Profile inspector: one person across identity resolution.
//
// Everything follows the org's metadata instead of fixed names:
// - rulesets (GET /ssot/identity-resolutions) name their unified and link DMOs per entity;
// - the link DMO maps SourceRecordId__c (a source Individual) to UnifiedRecordId__c;
// - every DMO with a relationship to the source Individual or the unified Individual
//   (contact points, engagement, segment membership, accounts) is followed by that key.
//
// Queries go through `q(sql)`, which resolves to `{ columns: [{ name }], rows: [[...]] }`.

export const INDIVIDUAL = 'ssot__Individual__dlm'
const EMAIL_DMO = 'ssot__ContactPointEmail__dlm'
const PHONE_DMO = 'ssot__ContactPointPhone__dlm'
const MAX_IDS = 200
const RELATED_LIMIT = 100

// ---- SQL helpers ----

export function lit(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

export function inList(values) {
  const unique = [...new Set(values.filter((v) => v != null && v !== ''))].slice(0, MAX_IDS)
  return unique.length ? `(${unique.map(lit).join(', ')})` : null
}

export function toObjects({ columns, rows }) {
  return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c.name, r[i]])))
}

// ---- rulesets ----

/** Individual rulesets with the DMO names they write to. */
export function parseRulesets(list) {
  return (list || [])
    .filter((r) => !r.configurationType || r.configurationType === 'individual')
    .map((r) => {
      const entities = {}
      for (const rec of r.reconciliationRules || []) {
        entities[rec.entityName] = { unified: rec.unifiedDmoName, link: rec.linkDmoName, ruleType: rec.ruleType }
      }
      return {
        id: r.rulesetId,
        recordId: r.id || '',
        label: r.label || r.rulesetId,
        status: r.rulesetStatus || '',
        lastJobStatus: r.lastJobStatus || '',
        lastJobCompleted: r.lastJobCompleted || '',
        unified: entities[INDIVIDUAL]?.unified || '',
        link: entities[INDIVIDUAL]?.link || '',
        entities,
        rules: (r.matchRules || []).map((m) => ({
          label: m.label || '',
          criteria: (m.criteria || []).map((c) => ({
            entity: c.entityName,
            field: c.fieldName,
            method: String(c.matchMethodType || '').toLowerCase(),
            caseSensitive: !!c.caseSensitiveMatch,
            matchOnBlank: !!c.shouldMatchOnBlank,
          })),
        })),
      }
    })
}

// ---- search ----

/** What the search text looks like: email, phone, id or name. */
export function searchKind(text) {
  const t = String(text ?? '').trim()
  if (!t) return null
  if (t.includes('@')) return 'email'
  if (/^\+?[\d\s().-]{6,}$/.test(t) && t.replace(/\D/g, '').length >= 6) return 'phone'
  if (!/\s/.test(t) && t.length >= 12 && /\d/.test(t) && /^[\w-]+$/.test(t)) return 'id'
  return 'name'
}

function likePattern(t) {
  // `%` typed by the user is a wildcard; otherwise match anywhere for names, exactly for emails.
  return t.replace(/\*/g, '%')
}

/** SQL that returns source Individual IDs for the search text (column `id`). */
export function searchSql(text) {
  const t = String(text ?? '').trim()
  const kind = searchKind(t)
  if (kind === 'email') {
    const p = likePattern(t)
    const op = p.includes('%') ? `ILIKE ${lit(p)}` : `= ${lit(p.toLowerCase())}`
    const field = p.includes('%') ? 'ssot__EmailAddress__c' : 'LOWER(ssot__EmailAddress__c)'
    return { kind, sql: `SELECT DISTINCT ssot__PartyId__c AS id FROM ${EMAIL_DMO} WHERE ${field} ${op} LIMIT ${MAX_IDS}` }
  }
  if (kind === 'phone') {
    // Digits only on both sides. Numbers are often stored without the country code, so a
    // search for +1 415 555 also tries 415 555.
    const digits = t.replace(/\D/g, '')
    const tries = [digits]
    if (/^\+/.test(t) || digits.length > 10) {
      for (const cc of [1, 2, 3]) if (digits.length - cc >= 6) tries.push(digits.slice(cc))
    }
    const field = "REGEXP_REPLACE(COALESCE(ssot__TelephoneNumber__c, '') || '|' || COALESCE(ssot__FormattedE164PhoneNumber__c, ''), '[^0-9|]', '', 'g')"
    return { kind, sql: `SELECT DISTINCT ssot__PartyId__c AS id FROM ${PHONE_DMO} WHERE ${[...new Set(tries)].map((d) => `${field} LIKE ${lit(`%${d}%`)}`).join(' OR ')} LIMIT ${MAX_IDS}` }
  }
  if (kind === 'id') {
    return { kind, sql: `SELECT ssot__Id__c AS id FROM ${INDIVIDUAL} WHERE ssot__Id__c = ${lit(t)} LIMIT 1` }
  }
  const p = `%${likePattern(t)}%`
  return { kind, sql: `SELECT ssot__Id__c AS id FROM ${INDIVIDUAL} WHERE (COALESCE(ssot__FirstName__c, '') || ' ' || COALESCE(ssot__LastName__c, '')) ILIKE ${lit(p)} OR ssot__PersonName__c ILIKE ${lit(p)} LIMIT ${MAX_IDS}` }
}

/**
 * Search results grouped by unified profile under `ruleset` (null: no ruleset).
 * `[{ unifiedId, sources: [{ id, name, dataSource, dataSourceObject }] }]`; source
 * records that are not unified come as their own group with `unifiedId: null`.
 * An ID that is a unified ID (not a source ID) finds that profile too.
 */
export async function search(q, text, ruleset) {
  const { kind, sql } = searchSql(text)
  let ids = toObjects(await q(sql)).map((r) => r.id).filter(Boolean)
  if (kind === 'id' && !ids.length && ruleset?.link) {
    // Not a source ID: maybe a unified one.
    const links = toObjects(await q(`SELECT SourceRecordId__c AS id FROM ${ruleset.link} WHERE UnifiedRecordId__c = ${lit(text.trim())} LIMIT ${MAX_IDS}`))
    ids = links.map((l) => l.id)
  }
  if (!ids.length) return { kind, groups: [] }
  const people = toObjects(await q(`SELECT ssot__Id__c AS id, ssot__FirstName__c AS first, ssot__LastName__c AS last, ssot__PersonName__c AS person, ssot__DataSourceId__c AS ds, ssot__DataSourceObjectId__c AS dso FROM ${INDIVIDUAL} WHERE ssot__Id__c IN ${inList(ids)}`))
  const unifiedOf = await unifiedIds(q, ruleset, ids)
  const groups = new Map()
  for (const p of people) {
    const uid = unifiedOf.get(p.id) || null
    const key = uid || `source:${p.id}`
    if (!groups.has(key)) groups.set(key, { unifiedId: uid, sources: [] })
    groups.get(key).sources.push({ id: p.id, name: displayName(p), dataSource: p.ds || '', dataSourceObject: p.dso || '' })
  }
  return { kind, groups: [...groups.values()] }
}

async function unifiedIds(q, ruleset, sourceIds) {
  const map = new Map()
  if (!ruleset?.link || !sourceIds.length) return map
  const rows = toObjects(await q(`SELECT SourceRecordId__c AS s, UnifiedRecordId__c AS u FROM ${ruleset.link} WHERE SourceRecordId__c IN ${inList(sourceIds)}`))
  for (const r of rows) map.set(r.s, r.u)
  return map
}

export function displayName(p) {
  const first = p.first ?? p.ssot__FirstName__c
  const last = p.last ?? p.ssot__LastName__c
  const person = p.person ?? p.ssot__PersonName__c
  return [first, last].filter(Boolean).join(' ') || person || '(no name)'
}

// ---- related objects ----

/**
 * The relationships that hang off `objectName`: `[{ object, objectField, otherField, category }]`
 * where rows of `object` have `otherField` equal to `objectName`'s `objectField`.
 * Deduplicated (the metadata lists a relationship on both objects).
 */
export function relatedTo(objectName, catalog) {
  const byName = new Map(catalog.map((o) => [o.name, o]))
  const seen = new Set()
  const out = []
  for (const o of catalog) {
    for (const r of o.relationships) {
      let other, objectField, otherField
      if (r.to === objectName && r.from !== objectName) { other = r.from; objectField = r.toField; otherField = r.fromField }
      else if (r.from === objectName && r.to !== objectName) { other = r.to; objectField = r.fromField; otherField = r.toField }
      else continue
      if (!other || !objectField || !otherField || !byName.has(other)) continue
      const key = `${other}|${objectField}|${otherField}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ object: other, objectField, otherField, category: byName.get(other).category || '' })
    }
  }
  return out.sort((a, b) => a.object.localeCompare(b.object))
}

/** A field to sort engagement by: the first date-time field that looks like the event time. */
export function eventTimeField(obj) {
  const dt = (obj?.fields || []).filter((f) => /DATE_?TIME/i.test(f.businessType || f.type))
  return (dt.find((f) => /EngagementDateTm|EventDateTime|DateTime|Timestamp/i.test(f.name)) ||
    dt.find((f) => !/LastModified|Created/i.test(f.name)) || dt[0])?.name || null
}

async function pool(items, size, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }))
  return out
}

/**
 * Rows related to the given profile rows of `objectName`. Each entry:
 * `{ object, objectField, otherField, category, sql, rows, more, error }`.
 * `onEntry` is called as each one lands (for progressive display).
 */
export async function loadRelated(q, objectName, profileRows, catalog, { skip = () => false, onEntry = () => {} } = {}) {
  const byName = new Map(catalog.map((o) => [o.name, o]))
  const rels = relatedTo(objectName, catalog).filter((r) => !skip(r))
  return pool(rels, 4, async (rel) => {
    const values = inList(profileRows.map((p) => p[rel.objectField]))
    const entry = { ...rel, sql: '', rows: [], more: false, error: '' }
    if (!values) { onEntry(entry); return entry }
    const orderBy = rel.category === 'Engagement' ? eventTimeField(byName.get(rel.object)) : null
    entry.sql = `SELECT * FROM ${rel.object} WHERE ${rel.otherField} IN ${values}${orderBy ? ` ORDER BY ${orderBy} DESC` : ''} LIMIT ${RELATED_LIMIT + 1}`
    try {
      const rows = toObjects(await q(entry.sql))
      entry.more = rows.length > RELATED_LIMIT
      entry.rows = rows.slice(0, RELATED_LIMIT)
    } catch (err) {
      entry.error = err.message
    }
    onEntry(entry)
    return entry
  })
}

// ---- the profile ----

/**
 * Loads a profile by unified ID (with a ruleset) or by source Individual ID.
 * `{ unifiedId, unified, links, sources }`; related data loads separately (loadRelated).
 */
export async function loadProfile(q, { unifiedId, sourceId, ruleset }) {
  let uid = unifiedId || null
  let links = []
  if (!uid && sourceId && ruleset?.link) {
    const l = toObjects(await q(`SELECT UnifiedRecordId__c AS u FROM ${ruleset.link} WHERE SourceRecordId__c = ${lit(sourceId)} LIMIT 1`))
    uid = l[0]?.u || null
  }
  if (uid && ruleset?.link) {
    links = toObjects(await q(`SELECT * FROM ${ruleset.link} WHERE UnifiedRecordId__c = ${lit(uid)} LIMIT ${MAX_IDS}`))
  }
  const sourceIds = links.length ? links.map((l) => l.SourceRecordId__c) : [sourceId].filter(Boolean)
  const [unified, sources] = await Promise.all([
    uid && ruleset?.unified ? q(`SELECT * FROM ${ruleset.unified} WHERE ssot__Id__c = ${lit(uid)} LIMIT 1`).then((r) => toObjects(r)[0] || null) : null,
    sourceIds.length ? q(`SELECT * FROM ${INDIVIDUAL} WHERE ssot__Id__c IN ${inList(sourceIds)}`).then(toObjects) : [],
  ])
  return { unifiedId: uid, unified, links, sources }
}

// ---- match explanation ----

export function normalize(value, method, field = '') {
  if (value == null) return ''
  let v = String(value).trim()
  if (method === 'exactnormalized') {
    v = v.toLowerCase()
    if (/phone/i.test(field)) v = v.replace(/\D/g, '')
    else v = v.replace(/\s+/g, ' ')
  }
  return v
}

/** Jaro-Winkler similarity, 0 to 1. */
export function similarity(a, b) {
  a = String(a ?? '').toLowerCase()
  b = String(b ?? '').toLowerCase()
  if (!a || !b) return 0
  if (a === b) return 1
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const am = new Array(a.length).fill(false)
  const bm = new Array(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; matches++; break }
    }
  }
  if (!matches) return 0
  let t = 0
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!am[i]) continue
    while (!bm[k]) k++
    if (a[i] !== b[k]) t++
    k++
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3
  let prefix = 0
  while (prefix < 4 && a[prefix] && a[prefix] === b[prefix]) prefix++
  return jaro + prefix * 0.1 * (1 - jaro)
}

export const FUZZY_THRESHOLD = 0.85

/** Does one criterion hold between two value lists? Fuzzy is an approximation. */
export function criterionMatches(criterion, aValues, bValues) {
  const norm = (v) => {
    const n = normalize(v, criterion.method, criterion.field)
    return criterion.caseSensitive || criterion.method === 'exactnormalized' ? n : n.toLowerCase()
  }
  const as = aValues.map(norm)
  const bs = bValues.map(norm)
  for (const x of as) {
    for (const y of bs) {
      if (!x || !y) {
        if (criterion.matchOnBlank && !x && !y) return true
        continue
      }
      if (criterion.method === 'fuzzy' ? similarity(x, y) >= FUZZY_THRESHOLD : x === y) return true
    }
  }
  return false
}

/**
 * For each source record, the values each criterion compares: fields of the Individual
 * itself, or of its related contact points (by party ID). `related` is the loadRelated
 * output for the source Individual.
 */
export function criterionValues(criterion, source, related) {
  if (criterion.entity === INDIVIDUAL) return [source[criterion.field]].filter((v) => v != null)
  return related
    .filter((r) => r.object === criterion.entity && r.objectField === 'ssot__Id__c')
    .flatMap((entry) => entry.rows.filter((row) => row[entry.otherField] === source.ssot__Id__c))
    .map((row) => row[criterion.field])
    .filter((v) => v != null)
}

/**
 * Per rule, which pairs of source records satisfy every criterion (by our approximation).
 * `[{ rule, pairs: [[idA, idB]], table: [{ criterion, values: { [sourceId]: [..] } }] }]`
 */
export function explainMatches(ruleset, sources, related) {
  return (ruleset?.rules || []).map((rule) => {
    const table = rule.criteria.map((c) => ({
      criterion: c,
      values: Object.fromEntries(sources.map((s) => [s.ssot__Id__c, criterionValues(c, s, related)])),
    }))
    const pairs = []
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const a = sources[i].ssot__Id__c
        const b = sources[j].ssot__Id__c
        if (table.every((row) => criterionMatches(row.criterion, row.values[a], row.values[b]))) pairs.push([a, b])
      }
    }
    return { rule, pairs, table }
  })
}

/**
 * Other people who share an email or phone with this profile but are not in it:
 * candidates for a missed match. `[{ id, name, shared }]`.
 */
export async function possibleMissedMatches(q, sourceIds, related) {
  const emails = related.filter((r) => r.object === EMAIL_DMO && r.objectField === 'ssot__Id__c').flatMap((r) => r.rows.map((row) => row.ssot__EmailAddress__c))
  const values = inList(emails.map((e) => String(e || '').toLowerCase()))
  const ids = inList(sourceIds)
  if (!values || !ids) return []
  const rows = toObjects(await q(`SELECT e.ssot__PartyId__c AS id, e.ssot__EmailAddress__c AS email, i.ssot__FirstName__c AS first, i.ssot__LastName__c AS last FROM ${EMAIL_DMO} e JOIN ${INDIVIDUAL} i ON i.ssot__Id__c = e.ssot__PartyId__c WHERE LOWER(e.ssot__EmailAddress__c) IN ${values} AND e.ssot__PartyId__c NOT IN ${ids} LIMIT 50`))
  return rows.map((r) => ({ id: r.id, name: displayName(r), shared: r.email }))
}

// ---- export ----

function fieldsTable(row) {
  return Object.entries(row || {})
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `| \`${k}\` | ${String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')} |`)
}

export function profileMarkdown({ ruleset, profile, related, explanation }) {
  const lines = [`# Profile ${profile.unifiedId || profile.sources[0]?.ssot__Id__c || ''}`, '']
  if (ruleset) lines.push(`Ruleset: ${ruleset.label} (\`${ruleset.id}\`)`, '')
  if (profile.unified) lines.push('## Unified record', '', '| Field | Value |', '| --- | --- |', ...fieldsTable(profile.unified), '')
  lines.push(`## Source records (${profile.sources.length})`, '')
  for (const s of profile.sources) {
    const link = profile.links.find((l) => l.SourceRecordId__c === s.ssot__Id__c)
    lines.push(`### ${displayName(s)} (\`${s.ssot__Id__c}\`)`, '', '| Field | Value |', '| --- | --- |', ...fieldsTable(s))
    if (link?.MatchKeys__c) lines.push(`| MatchKeys__c (link) | ${link.MatchKeys__c} |`)
    lines.push('')
  }
  for (const e of explanation || []) {
    lines.push(`## Match rule: ${e.rule.label}`, '')
    for (const row of e.table) lines.push(`- ${row.criterion.entity}.${row.criterion.field} (${row.criterion.method}): ${Object.entries(row.values).map(([id, v]) => `${id} = ${v.join(', ') || 'blank'}`).join('; ')}`)
    lines.push(`- Pairs that satisfy every criterion (approximation): ${e.pairs.map((p) => p.join(' + ')).join(', ') || 'none'}`, '')
  }
  for (const r of (related || []).filter((x) => x.rows.length)) {
    lines.push(`## ${r.object} (${r.rows.length}${r.more ? '+' : ''} rows, ${r.category})`, '')
    const cols = Object.keys(r.rows[0]).filter((k) => r.rows.some((row) => row[k] != null && row[k] !== ''))
    lines.push(`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`)
    for (const row of r.rows.slice(0, 20)) lines.push(`| ${cols.map((c) => String(row[c] ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')).join(' | ')} |`)
    lines.push('')
  }
  return lines.join('\n')
}
