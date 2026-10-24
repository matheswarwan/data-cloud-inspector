// Identity resolution page: rulesets in plain words, their stats, how big unified profiles
// are, the largest ones (where bad merges hide), where source records come from, and a
// side-by-side check of two people against the rules. SQL checked on a live org (R001).

import { toObjects, inList, INDIVIDUAL, loadRelated, criterionValues, criterionMatches } from './profile.js'

const RULE_TYPES = {
  lastupdated: 'most recently updated value',
  mostfrequent: 'most frequent value',
  sourcepriority: 'value from the highest-priority source',
  mostrecent: 'most recent value',
}
const METHODS = {
  exact: 'exactly the same',
  exactnormalized: 'the same after normalizing (case, spaces, phone formatting)',
  fuzzy: 'similar (fuzzy)',
}

const short = (n) => String(n || '').replace(/^ssot__/, '').replace(/__(c|dlm|dll)$/, '')

export function describeCriterion(c) {
  return `${short(c.entity)}.${short(c.field)} is ${METHODS[c.method] || c.method}${c.matchOnBlank ? ', blanks match blanks' : ''}`
}

const nameOf = (x) => (typeof x === 'string' ? x : x?.name || x?.fieldName || x?.developerName || x?.dataSourceObjectName || x?.sourceName || JSON.stringify(x))

export function describeReconciliation(rec) {
  const lines = [`${short(rec.entity)}: keep the ${RULE_TYPES[String(rec.ruleType).toLowerCase()] || rec.ruleType || 'default'}${rec.ignoreEmpty ? ', ignoring empty values' : ''}`]
  if (rec.sources?.length) lines.push(`Source order: ${rec.sources.map(nameOf).join(' > ')}`)
  for (const f of rec.fields || []) lines.push(`${nameOf(f)}: ${RULE_TYPES[String(f.ruleType || '').toLowerCase()] || f.ruleType || 'own rule'}${f.sources?.length ? ` (${f.sources.map(nameOf).join(' > ')})` : ''}`)
  return lines
}

export const IDENTITY_SQL = {
  sizes: (link) => `SELECT n AS sources, COUNT(*) AS profiles FROM (SELECT UnifiedRecordId__c, COUNT(*) AS n FROM ${link} GROUP BY UnifiedRecordId__c) t GROUP BY n ORDER BY n`,
  largest: (link) => `SELECT UnifiedRecordId__c AS unified, COUNT(*) AS sources FROM ${link} GROUP BY UnifiedRecordId__c HAVING COUNT(*) > 1 ORDER BY 2 DESC LIMIT 20`,
  sources: (link) => `SELECT ssot__DataSourceId__c AS source, ssot__DataSourceObjectId__c AS object, COUNT(*) AS n FROM ${link} GROUP BY 1, 2 ORDER BY 3 DESC`,
}

/** `{ stats, sizes, largest, sources, errors }` for one ruleset. */
export async function loadRulesetDetail(call, q, version, ruleset) {
  const errors = {}
  const safe = (k, p) => p.catch((err) => { errors[k] = err.message; return [] })
  const statsCall = ruleset.recordId ? call(`/services/data/v${version}/ssot/identity-resolutions/${ruleset.recordId}`) : Promise.resolve(null)
  const [statsRes, sizes, largest, sources] = await Promise.all([
    statsCall,
    ruleset.link ? safe('sizes', q(IDENTITY_SQL.sizes(ruleset.link)).then(toObjects)) : [],
    ruleset.link ? safe('largest', q(IDENTITY_SQL.largest(ruleset.link)).then(toObjects)) : [],
    ruleset.link ? safe('sources', q(IDENTITY_SQL.sources(ruleset.link)).then(toObjects)) : [],
  ])
  if (statsRes && !statsRes.ok) errors.stats = statsRes.error
  const st = statsRes?.ok ? statsRes.data : {}
  const rate = st.consolidationRate == null ? null : st.consolidationRate <= 1 ? st.consolidationRate * 100 : st.consolidationRate
  return {
    stats: {
      sourceProfiles: st.sourceProfiles ?? null,
      unifiedProfiles: st.totalUnifiedProfiles ?? null,
      matchedSourceProfiles: st.matchedSourceProfiles ?? null,
      knownUnifiedProfiles: st.knownUnifiedProfiles ?? null,
      anonymousUnifiedProfiles: st.anonymousUnifiedProfiles ?? null,
      consolidationRate: rate,
      lastJobStatus: st.lastJobStatus || ruleset.lastJobStatus,
      lastJobCompleted: st.lastJobCompleted || ruleset.lastJobCompleted,
    },
    sizes: sizes.map((r) => ({ sources: Number(r.sources), profiles: Number(r.profiles) })),
    largest: largest.map((r) => ({ unified: r.unified, sources: Number(r.sources) })),
    sources: sources.map((r) => ({ source: r.source, object: r.object, n: Number(r.n) })),
    errors,
  }
}

/**
 * Two source Individuals side by side against a ruleset: per rule, per criterion, each
 * person's values and whether they match; plus whether the ruleset has them in one profile.
 */
export const MAX_COMPARE = 10

/**
 * Compares 2 to MAX_COMPARE source records (feedback #111): every criterion's values per person,
 * for each pair the rules that join them and whether they share a unified profile, and the
 * groups the rules would form (joins follow chains: A~B and B~C put A, B, C together) next to
 * the unified profiles they are in now.
 */
export async function compareMany(q, ruleset, catalog, ids) {
  ids = [...new Set(ids)].slice(0, MAX_COMPARE)
  if (ids.length < 2) throw new Error('Pick at least two people.')
  const found = toObjects(await q(`SELECT * FROM ${INDIVIDUAL} WHERE ssot__Id__c IN ${inList(ids)}`))
  const people = ids.map((id) => found.find((p) => p.ssot__Id__c === id))
  const missing = ids.filter((_, k) => !people[k])
  if (missing.length) throw new Error(`Could not read ${missing.join(', ')} from ${INDIVIDUAL}.`)
  const needed = new Set(ruleset.rules.flatMap((r) => r.criteria.map((c) => c.entity)).filter((e) => e !== INDIVIDUAL))
  const related = await loadRelated(q, INDIVIDUAL, people, catalog, { skip: (r) => !needed.has(r.object) || r.objectField !== 'ssot__Id__c' })
  const pairsOf = (n) => { const out = []; for (let x = 0; x < n; x++) for (let y = x + 1; y < n; y++) out.push([x, y]); return out }
  const pairs = pairsOf(people.length)
  const rules = ruleset.rules.map((rule) => {
    const rows = rule.criteria.map((c) => {
      const values = people.map((p) => criterionValues(c, p, related))
      const pairMatch = pairs.map(([x, y]) => criterionMatches(c, values[x], values[y]))
      // A person's value "matches" when it matches someone else's.
      const matchesSomeone = people.map((_, k) => pairs.some(([x, y], n) => (x === k || y === k) && pairMatch[n]))
      return { criterion: c, text: describeCriterion(c), values, pairMatch, matchesSomeone }
    })
    const pairRule = pairs.map((_, n) => rows.length > 0 && rows.every((r) => r.pairMatch[n]))
    return { label: rule.label, rows, pairRule }
  })
  let unified = people.map(() => null)
  if (ruleset.link) {
    const links = toObjects(await q(`SELECT SourceRecordId__c AS s, UnifiedRecordId__c AS u FROM ${ruleset.link} WHERE SourceRecordId__c IN ${inList(ids)}`))
    unified = ids.map((id) => links.find((l) => l.s === id)?.u || null)
  }
  const pairResults = pairs.map(([x, y], n) => ({
    a: x, b: y,
    rules: rules.map((r, k) => (r.pairRule[n] ? r.label || `Rule ${k + 1}` : null)).filter(Boolean),
    sameProfile: unified[x] && unified[y] ? unified[x] === unified[y] : null,
  }))
  // Groups the rules would form: connected components over matching pairs.
  const parent = people.map((_, k) => k)
  const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])))
  for (const p of pairResults) if (p.rules.length) parent[find(p.a)] = find(p.b)
  const groupsBy = (keyOf) => {
    const m = new Map()
    people.forEach((_, k) => { const key = keyOf(k); (m.get(key) || m.set(key, []).get(key)).push(k) })
    return [...m.values()]
  }
  const ruleGroups = groupsBy(find)
  const profileGroups = ruleset.link ? groupsBy((k) => unified[k] || `none:${k}`) : null
  const sig = (gs) => gs.map((g) => g.join(',')).sort().join('|')
  return { people, unified, rules, pairs: pairResults, ruleGroups, profileGroups, agrees: profileGroups ? sig(ruleGroups) === sig(profileGroups) : null }
}

/** Two people: the shape the first version of this page used. */
export async function comparePeople(q, ruleset, catalog, idA, idB) {
  const m = await compareMany(q, ruleset, catalog, [idA, idB])
  const rules = m.rules.map((r) => ({ label: r.label, rows: r.rows.map((row) => ({ criterion: row.criterion, text: row.text, a: row.values[0], b: row.values[1], matches: row.pairMatch[0] })), matches: r.pairRule[0] }))
  const sameProfile = m.unified[0] || m.unified[1] || ruleset.link ? { same: !!m.unified[0] && m.unified[0] === m.unified[1], a: m.unified[0], b: m.unified[1] } : null
  return { a: m.people[0], b: m.people[1], rules, anyRuleMatches: rules.some((r) => r.matches), sameProfile }
}

