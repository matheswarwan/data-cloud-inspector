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
export async function comparePeople(q, ruleset, catalog, idA, idB) {
  const people = toObjects(await q(`SELECT * FROM ${INDIVIDUAL} WHERE ssot__Id__c IN ${inList([idA, idB])}`))
  const a = people.find((p) => p.ssot__Id__c === idA)
  const b = people.find((p) => p.ssot__Id__c === idB)
  if (!a || !b) throw new Error(`Could not read ${!a ? idA : idB} from ${INDIVIDUAL}.`)
  const needed = new Set(ruleset.rules.flatMap((r) => r.criteria.map((c) => c.entity)).filter((e) => e !== INDIVIDUAL))
  const related = await loadRelated(q, INDIVIDUAL, [a, b], catalog, { skip: (r) => !needed.has(r.object) || r.objectField !== 'ssot__Id__c' })
  const rules = ruleset.rules.map((rule) => {
    const rows = rule.criteria.map((c) => {
      const va = criterionValues(c, a, related)
      const vb = criterionValues(c, b, related)
      return { criterion: c, text: describeCriterion(c), a: va, b: vb, matches: criterionMatches(c, va, vb) }
    })
    return { label: rule.label, rows, matches: rows.length > 0 && rows.every((r) => r.matches) }
  })
  let sameProfile = null
  if (ruleset.link) {
    const links = toObjects(await q(`SELECT SourceRecordId__c AS s, UnifiedRecordId__c AS u FROM ${ruleset.link} WHERE SourceRecordId__c IN ${inList([idA, idB])}`))
    const ua = links.find((l) => l.s === idA)?.u
    const ub = links.find((l) => l.s === idB)?.u
    sameProfile = ua && ub ? { same: ua === ub, a: ua, b: ub } : { same: false, a: ua || null, b: ub || null }
  }
  return { a, b, rules, anyRuleMatches: rules.some((r) => r.matches), sameProfile }
}

