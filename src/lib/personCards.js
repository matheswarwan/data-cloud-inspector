// The People > One person page as cards (design "Option D – People (cards)", 2026-10-29).
// The design was drawn from one person in one org; these rules make it work on any org:
// - a card shows a row's name, a few short values as chips and its first filled fields;
//   Table on the section shows every field.
// - a related row that holds a contact point's ID shows on that contact point's card.
// - true/false fields on the Individual that are true show as indicator chips.

const SYSTEM = /^KQ_|DataSourceObject|InternalOrganization|^ssot__CreatedDate|LastModified|LastProcessed|^cdp_sys_|SourceRecordId|^ssot__Id__c$|^Id__c$/i
const NAME = /(^|_)(Name|Title|Label|Subject)(__c)?$|Name__c$/i
const SHORT_CHIP = /Status|Type|Category|Code|Role|Market|Segment|Tier|Brand|LOB|Kind|Flag|Primary|Rank/i
const DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

const filled = (v) => v != null && v !== ''
const text = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** "ssot__ContractEndDate__c" -> "Contract end date", "RATE_PLAN_CD__c" -> "Rate plan cd". */
export function fieldLabel(name) {
  const base = String(name || '').replace(/^ssot__|^KQ_/, '').replace(/__c$/, '')
  const words = base.replace(/_+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim()
  if (!words) return String(name || '')
  const lower = words.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export const isDate = (v) => typeof v === 'string' && DATE.test(v)
/** A date value as YYYY-MM-DD (time left off). */
export const shortDate = (v) => (isDate(v) ? v.slice(0, 10) : text(v))
const isIdLike = (k, v) => /Id(__c)?$|Identifier|Key(__c)?$|Number(__c)?$/i.test(k) || (/^\d{5,}$/.test(text(v)))

/**
 * One related row as a card: `{ title, mono, chips: [{ text, tone, mono }], fields: [{ label, value, mono }], more, date }`.
 * `skip` names fields to leave out (for example the field that points back at the person).
 */
export function rowCard(row, { skip = [], maxFields = 6, maxChips = 3 } = {}) {
  const leave = new Set(skip)
  const entries = Object.entries(row || {}).filter(([k, v]) => filled(v) && !leave.has(k) && !SYSTEM.test(k))
  const nameHit = entries.find(([k]) => NAME.test(k) && !/Id__c$/i.test(k))
  const id = row?.ssot__Id__c ?? row?.Id__c
  // No name field: the row's own ID, else its first ID-like field ("Service id 7000001").
  const idHit = !nameHit && !filled(id) ? entries.find(([k]) => /Id(__c)?$/i.test(k) && k !== 'ssot__DataSourceId__c') : null
  const title = nameHit ? text(nameHit[1]) : filled(id) ? text(id) : idHit ? `${fieldLabel(idHit[0])} ${text(idHit[1])}` : ''
  const titleMono = !nameHit
  const chips = []
  const ds = row?.ssot__DataSourceId__c
  if (filled(ds)) chips.push({ text: text(ds), tone: 'blue', mono: true })
  const rest = []
  for (const [k, v] of entries) {
    if ((nameHit && k === nameHit[0]) || (idHit && k === idHit[0])) continue
    if (k === 'ssot__DataSourceId__c') continue
    const t = text(v)
    if (chips.length < maxChips && SHORT_CHIP.test(k) && t.length <= 18 && !isDate(t)) chips.push({ text: `${fieldLabel(k)} ${t}`, tone: 'grey' })
    else rest.push([k, v])
  }
  const date = rest.find(([k, v]) => isDate(text(v)) && !/Birth/i.test(k))
  const fields = rest.slice(0, maxFields).map(([k, v]) => ({ key: k, label: fieldLabel(k), value: isDate(text(v)) ? shortDate(v) : text(v), mono: isIdLike(k, v) }))
  return { title, titleMono, chips, fields, more: Math.max(0, rest.length - maxFields), date: date ? { label: fieldLabel(date[0]), value: text(date[1]) } : null, id: filled(id) ? text(id) : idHit ? text(idHit[1]) : '' }
}

/** True/false fields that are true on the person's record, as labels ("Preferred", "Do not call"). */
export function indicators(row) {
  const out = []
  for (const [k, v] of Object.entries(row || {})) {
    if (SYSTEM.test(k)) continue
    const t = text(v).toLowerCase()
    const yes = v === true || t === 'true' || (/(Flag|Ind|Indicator|^Is[A-Z_]|^ssot__Is|^Has)/.test(k.replace(/^ssot__/, '')) && (t === '1' || t === 'y' || t === 'yes'))
    if (yes) out.push(fieldLabel(k).replace(/ (flag|ind|indicator)$/i, '').replace(/^is /i, ''))
  }
  return [...new Set(out)].map((s) => s.charAt(0).toUpperCase() + s.slice(1))
}

const ATTRS = /Language|Locale|EntityType|Gender|Country|Salutation|BirthDate|Occupation/i
/** A few short facts about the person for the header: `[{ label, value }]`. */
export function personFacts(row) {
  return Object.entries(row || {})
    .filter(([k, v]) => filled(v) && ATTRS.test(k) && !/Id__c$/i.test(k) && text(v).length <= 24)
    .slice(0, 4)
    .map(([k, v]) => ({ label: fieldLabel(k), value: shortDate(v) }))
}

// ---- contact points ----

/** 'email', 'phone', 'address', or 'other' from a contact point object's name. */
export function contactKind(objectName) {
  const n = String(objectName || '')
  if (/Email/i.test(n)) return 'email'
  if (/Phone/i.test(n)) return 'phone'
  if (/Address/i.test(n)) return 'address'
  return 'other'
}

const pick = (row, re) => {
  const hit = Object.entries(row || {}).find(([k, v]) => re.test(k) && filled(v) && !/Id__c$/i.test(k))
  return hit ? text(hit[1]) : ''
}

/** The address a contact point row holds, by kind. */
export function contactValue(row, kind) {
  if (kind === 'email') return pick(row, /EmailAddress|Email/i)
  if (kind === 'phone') return pick(row, /FormattedE164|E164|TelephoneNumber|PhoneNumber|Phone/i)
  if (kind === 'address') {
    return [pick(row, /AddressLine1|Street/i), pick(row, /CityName|City/i), pick(row, /StateProvince|State/i), pick(row, /PostalCode|Zip/i), pick(row, /CountryName|Country/i)].filter(Boolean).join(', ')
  }
  return pick(row, /Name|Value|Address|Number/i)
}
const normValue = (v, kind) => (kind === 'phone' ? v.replace(/[^\d+]/g, '') : v.trim().toLowerCase())
const isPrimary = (row) => Object.entries(row || {}).some(([k, v]) => /Primary|Preferred/i.test(k) && /^(true|1|y|yes)$/i.test(text(v)))

/**
 * Contact point rows from every object, one entry per address found in any source:
 * `[{ kind, value, primary, sources: [{ object, dataSource, id, row }], ids }]`, emails first.
 */
export function groupContacts(entries) {
  const byKey = new Map()
  for (const e of entries) {
    const kind = contactKind(e.object)
    for (const row of e.rows || []) {
      const value = contactValue(row, kind)
      const key = `${kind}|${value ? normValue(value, kind) : `id:${row.ssot__Id__c ?? Math.random()}`}`
      const g = byKey.get(key) || { kind, value, primary: false, sources: [], ids: new Set() }
      g.sources.push({ object: e.object, dataSource: text(row.ssot__DataSourceId__c), id: text(row.ssot__Id__c), row })
      if (filled(row.ssot__Id__c)) g.ids.add(text(row.ssot__Id__c))
      g.primary = g.primary || isPrimary(row)
      byKey.set(key, g)
    }
  }
  const order = { email: 0, phone: 1, address: 2, other: 3 }
  return [...byKey.values()].sort((a, b) => order[a.kind] - order[b.kind] || Number(b.primary) - Number(a.primary))
}

/** The domain of an email address. */
export const emailDomain = (v) => (String(v).includes('@') ? String(v).split('@').pop().toLowerCase() : '')

/**
 * Which related rows hold a contact point's ID: Map(contact index -> [{ entry, row }]) plus
 * the set of linked rows (so their own section can say they are shown above).
 * Values shorter than 4 characters and the person's own IDs never link.
 */
export function linkRows(contacts, entries, personIds = []) {
  const own = new Set(personIds.map(text))
  const idTo = new Map()
  contacts.forEach((c, i) => { for (const id of c.ids) if (id.length >= 4 && !own.has(id)) idTo.set(id, i) })
  const byContact = new Map()
  const linked = new Set()
  if (!idTo.size) return { byContact, linked }
  for (const e of entries) {
    for (const row of e.rows || []) {
      for (const [k, v] of Object.entries(row)) {
        if (k === e.otherField) continue
        const i = idTo.get(text(v))
        if (i === undefined) continue
        if (!byContact.has(i)) byContact.set(i, [])
        byContact.get(i).push({ entry: e, row })
        linked.add(row)
        break
      }
    }
  }
  return { byContact, linked }
}

// ---- segment membership ----

const SEG_ID = /Segment_?Id/i
const SNAPSHOT = /Snapshot_?Type|Delta_?Type|Change_?Type/i
const STAMP = /Timestamp|Version_?Stamp|Snapshot_?Date|DateTime|Date/i
const PARENT = /Parent/i

/** A membership row's facts: `{ segment, kind, since, parent }`. */
export function membershipFacts(row) {
  return { segment: pick(row, SEG_ID) || text(Object.entries(row || {}).find(([k]) => SEG_ID.test(k))?.[1] ?? ''), kind: pick(row, SNAPSHOT).toLowerCase(), since: pick(row, STAMP), parent: pick(row, PARENT) }
}
export const isHistory = (objectName) => /History|_SMH_/i.test(String(objectName || ''))

/**
 * Recent changes from the membership history rows: per segment, its add and remove events
 * (newest segments first) and how many snapshots came after the last one.
 * `[{ segment, events: [{ kind: 'added' | 'removed' | 'added back', when }], since }]`
 */
export function membershipChanges(rows, limit = 3) {
  const bySeg = new Map()
  for (const r of rows) {
    const f = membershipFacts(r)
    if (!f.segment) continue
    if (!bySeg.has(f.segment)) bySeg.set(f.segment, [])
    bySeg.get(f.segment).push(f)
  }
  const out = []
  for (const [segment, list] of bySeg) {
    list.sort((a, b) => a.since.localeCompare(b.since))
    const events = []
    let after = 0
    let removed = false
    for (const f of list) {
      if (/new|add|insert/.test(f.kind)) { events.push({ kind: removed ? 'added back' : 'added', when: f.since, parent: f.parent }); removed = false; after = 0 }
      else if (/remov|delete|drop/.test(f.kind)) { events.push({ kind: 'removed', when: f.since }); removed = true; after = 0 }
      else after++
    }
    if (events.length) out.push({ segment, events: events.slice(-3), since: after, last: events[events.length - 1].when })
  }
  return out.sort((a, b) => b.last.localeCompare(a.last)).slice(0, limit)
}

// ---- engagement ----

const TITLE = /Name|Subject|Campaign|Title|Activity|Journey|Message|Url|Page/i
/** A line to show for an engagement row: a name-like value, else ''. */
export function engagementTitle(row) {
  const hit = Object.entries(row || {}).find(([k, v]) => TITLE.test(k) && filled(v) && !/Id__c$|DataSource|Organization/i.test(k) && text(v).length > 2)
  return hit ? text(hit[1]) : ''
}

/** Events grouped by month, newest first: `[{ month: 'October 2026', items }]`. */
export function byMonth(events) {
  const out = []
  let last = null
  for (const ev of events) {
    const d = ev.time ? new Date(ev.time) : null
    const month = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'No date'
    if (!last || last.month !== month) { last = { month, items: [] }; out.push(last) }
    last.items.push(ev)
  }
  return out
}

/** "service" plural for a tile: "8 services". Labels come from the object label. */
export function plural(label, n) {
  const l = String(label || '').toLowerCase()
  if (n === 1 || /s$/.test(l)) return l
  if (/[^aeiou]y$/.test(l)) return l.slice(0, -1) + 'ies'
  return l + 's'
}
