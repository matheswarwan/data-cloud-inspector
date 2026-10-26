// Lineage downstream of an object: which calculated insights, segments and activations use
// it, and which of its fields. Calculated insight SQL names objects in full on the live org
// (ssot__PersonalizationLog__dlm.ssot__RequestDateTime__c); aliases from FROM/JOIN are
// followed too. Segment criteria name objectApiName and fieldApiName per rule.

import { insightPages, offsetPages } from './health.js'
import { loadSegments, decodeHtml } from './segments.js'
import { inSpace } from './dataSpace.js'

const OBJ = String.raw`\w+__(?:dlm|dll|cio)`
const KEYWORDS = new Set(['on', 'where', 'join', 'left', 'right', 'inner', 'outer', 'full', 'cross', 'group', 'order', 'limit', 'union', 'having', 'using', 'as', 'and', 'or'])

/** `{ [object]: Set(fields) }` referenced by a SQL text. An object with no field use has an empty set. */
export function sqlRefs(sql) {
  const text = decodeHtml(sql)
  const refs = {}
  const add = (obj, field) => { (refs[obj] ||= new Set()); if (field) refs[obj].add(field) }
  const alias = {}
  for (const m of text.matchAll(new RegExp(String.raw`\b(?:FROM|JOIN)\s+(${OBJ})(?:\s+(?:AS\s+)?(\w+))?`, 'gi'))) {
    add(m[1])
    if (m[2] && !KEYWORDS.has(m[2].toLowerCase())) alias[m[2]] = m[1]
  }
  for (const m of text.matchAll(new RegExp(String.raw`\b(${OBJ})\b`, 'g'))) add(m[1])
  for (const m of text.matchAll(/\b(\w+)\.(\w+__c)\b/g)) {
    const obj = /__(dlm|dll|cio)$/.test(m[1]) ? m[1] : alias[m[1]]
    if (obj) add(obj, m[2])
  }
  return refs
}

/** `{ [object]: Set(fields) }` used by segment criteria. */
export function criteriaRefs(node, refs = {}) {
  if (!node || typeof node !== 'object') return refs
  for (const k of ['filters', 'criteria', 'children']) if (Array.isArray(node[k])) node[k].forEach((n) => criteriaRefs(n, refs))
  const subj = node.subject
  if (subj?.objectApiName) {
    (refs[subj.objectApiName] ||= new Set())
    if (subj.fieldApiName) refs[subj.objectApiName].add(subj.fieldApiName)
  }
  return refs
}

/** `segments` loads the segment list (the app passes its shared, progressive one). */
export async function loadUsage(call, version, { segments: loadSegs = null } = {}) {
  const [insights, segments, activations] = await Promise.all([
    insightPages(call, version).catch(() => []),
    (loadSegs ? loadSegs() : loadSegments(call, version)).catch(() => []),
    offsetPages(call, `/services/data/v${version}/ssot/activations`, 'activations').then((a) => inSpace(a, call.dataSpace)).catch(() => []),
  ])
  // Field sets become arrays so the result can be cached in chrome.storage.session.
  const plain = (refs) => Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, [...v]]))
  return {
    insights: insights.map((ci) => ({ name: ci.apiName, label: ci.displayName || ci.apiName, refs: plain(sqlRefs(ci.expression || '')) })),
    segments: segments.map((s) => {
      const refs = criteriaRefs(s.criteria)
      criteriaRefs(s.excludeCriteria, refs)
      return { name: s.apiName, label: s.label, id: s.id, on: s.on, refs: plain(refs) }
    }),
    activations: activations.map((a) => ({ name: a.name, id: a.id, segmentId: a.segmentId || a.marketSegmentId, target: a.activationTargetName || a.activationTarget?.name || '', status: a.lastPublishStatus || a.status || '' })),
  }
}

/** What uses `object`: `{ insights: [{ name, label, fields }], segments: [{ ..., fields, isOn, activations }] }` */
export function usageOf(object, usage) {
  if (!usage) return null
  const insights = usage.insights
    .filter((ci) => ci.refs[object])
    .map((ci) => ({ name: ci.name, label: ci.label, fields: [...ci.refs[object]].sort() }))
  const segments = usage.segments
    .filter((s) => s.on === object || s.refs[object])
    .map((s) => ({
      name: s.name, label: s.label, id: s.id, isOn: s.on === object,
      fields: [...(s.refs[object] || [])].sort(),
      activations: usage.activations.filter((a) => a.segmentId && s.id && a.segmentId.slice(0, 15) === s.id.slice(0, 15)),
    }))
  return { insights, segments }
}

/** `Map(field -> [labels of what uses it])` for the Fields tab. */
export function fieldUsage(object, usage) {
  const map = new Map()
  const u = usageOf(object, usage)
  if (!u) return map
  const add = (f, label) => { if (!map.has(f)) map.set(f, []); map.get(f).push(label) }
  for (const ci of u.insights) ci.fields.forEach((f) => add(f, `${ci.label} (insight)`))
  for (const s of u.segments) s.fields.forEach((f) => add(f, `${s.label} (segment)`))
  return map
}
