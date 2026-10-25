// Compare two orgs (for example a sandbox and production): objects, fields, segments,
// calculated insights and data streams that exist in only one, and field type changes.

import { latestVersion } from './api.js'
import { loadCatalog } from './catalog.js'
import { loadSegments } from './segments.js'
import { loadStreams } from './lineage.js'
import { insightPages } from './health.js'
import { withDataSpace } from './dataSpace.js'

/** Everything compared, for one org: `{ version, objects, segments, insights, streams, errors }`. */
export async function loadSnapshot(sfFn, orgId, { dataSpace = 'default' } = {}) {
  const call = (path, opts) => sfFn(orgId, withDataSpace(path, dataSpace), opts)
  call.dataSpace = dataSpace
  const v = await call('/services/data/')
  if (!v.ok) throw new Error(v.error || `HTTP ${v.status}`)
  const version = latestVersion(v.data)
  const errors = []
  const safe = (p, label) => p.catch((err) => { errors.push(`${label}: ${err.message}`); return [] })
  const [catalog, segments, insights, streams] = await Promise.all([
    loadCatalog(call, version),
    safe(loadSegments(call, version), 'segments'),
    safe(insightPages(call, version), 'calculated insights'),
    safe(loadStreams(call, version), 'data streams'),
  ])
  errors.push(...catalog.errors)
  return {
    version,
    objects: catalog.objects,
    segments: segments.map((s) => s.apiName),
    insights: insights.map((i) => i.apiName),
    streams: streams.map((s) => s.name),
    errors,
  }
}

function onlyIn(a, b) {
  const sb = new Set(b)
  return [...new Set(a)].filter((x) => !sb.has(x)).sort()
}

/** The differences between snapshots `a` and `b`. */
export function compareSnapshots(a, b) {
  const objA = new Map(a.objects.map((o) => [o.name, o]))
  const objB = new Map(b.objects.map((o) => [o.name, o]))
  const changed = []
  for (const [name, oa] of objA) {
    const ob = objB.get(name)
    if (!ob) continue
    const fa = new Map(oa.fields.map((f) => [f.name, f]))
    const fb = new Map(ob.fields.map((f) => [f.name, f]))
    const fieldsOnlyA = onlyIn([...fa.keys()], [...fb.keys()])
    const fieldsOnlyB = onlyIn([...fb.keys()], [...fa.keys()])
    const typeChanges = [...fa.keys()].filter((k) => fb.has(k) && (fa.get(k).businessType || fa.get(k).type) !== (fb.get(k).businessType || fb.get(k).type))
      .map((k) => ({ field: k, a: fa.get(k).businessType || fa.get(k).type, b: fb.get(k).businessType || fb.get(k).type }))
    if (fieldsOnlyA.length || fieldsOnlyB.length || typeChanges.length) changed.push({ name, label: oa.label, kind: oa.kind, fieldsOnlyA, fieldsOnlyB, typeChanges })
  }
  const list = (m, names) => names.map((n) => ({ name: n, label: m.get(n).label, kind: m.get(n).kind }))
  const result = {
    objectsOnlyA: list(objA, onlyIn([...objA.keys()], [...objB.keys()])),
    objectsOnlyB: list(objB, onlyIn([...objB.keys()], [...objA.keys()])),
    changed: changed.sort((x, y) => x.name.localeCompare(y.name)),
    segmentsOnlyA: onlyIn(a.segments, b.segments),
    segmentsOnlyB: onlyIn(b.segments, a.segments),
    insightsOnlyA: onlyIn(a.insights, b.insights),
    insightsOnlyB: onlyIn(b.insights, a.insights),
    streamsOnlyA: onlyIn(a.streams, b.streams),
    streamsOnlyB: onlyIn(b.streams, a.streams),
  }
  result.same = Object.values(result).every((v) => Array.isArray(v) && !v.length)
  return result
}

export function compareMarkdown(diff, { a = 'A', b = 'B', hosts = {}, at = new Date() } = {}) {
  const out = [`# Data Cloud comparison: ${a} and ${b}`, '', `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC.`, '']
  // Named orgs (feedback #140): say which domain each name stands for
  const named = [[a, hosts.a], [b, hosts.b]].filter(([n, h]) => h && n !== h)
  if (named.length) out.push(named.map(([n, h]) => `${n}: ${h}.`).join(' '), '')
  if (diff.same) return [...out, 'No differences in objects, fields, segments, calculated insights or data streams.'].join('\n')
  const names = (list) => list.map((x) => `\`${typeof x === 'string' ? x : x.name}\``).join(', ') || 'none'
  out.push('## Objects', '', `Only in ${a}: ${names(diff.objectsOnlyA)}`, '', `Only in ${b}: ${names(diff.objectsOnlyB)}`, '')
  if (diff.changed.length) {
    out.push('## Objects with field differences', '')
    for (const c of diff.changed) {
      out.push(`### ${c.label} (\`${c.name}\`)`, '')
      if (c.fieldsOnlyA.length) out.push(`- Fields only in ${a}: ${names(c.fieldsOnlyA)}`)
      if (c.fieldsOnlyB.length) out.push(`- Fields only in ${b}: ${names(c.fieldsOnlyB)}`)
      for (const t of c.typeChanges) out.push(`- \`${t.field}\`: ${t.a} in ${a}, ${t.b} in ${b}`)
      out.push('')
    }
  }
  for (const [title, ka, kb] of [['Segments', 'segmentsOnlyA', 'segmentsOnlyB'], ['Calculated insights', 'insightsOnlyA', 'insightsOnlyB'], ['Data streams', 'streamsOnlyA', 'streamsOnlyB']]) {
    out.push(`## ${title}`, '', `Only in ${a}: ${names(diff[ka])}`, '', `Only in ${b}: ${names(diff[kb])}`, '')
  }
  return out.join('\n')
}
