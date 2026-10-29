// Activations page (GET ssot/activations and ssot/activations/<id>, checked live): the segment,
// target, refresh type and last publish; the attributes sent and their output names; contact
// points; filters; and the latest and history audience DMOs.

import { decodeHtml } from './segments.js'
import { offsetPages } from './health.js'
import { inSpace } from './dataSpace.js'

export async function loadActivations(call, version) {
  return inSpace(await offsetPages(call, `/services/data/v${version}/ssot/activations`, 'activations'), call.dataSpace)
    .map((a) => ({ id: a.id, name: a.name, developerName: a.developerName, segment: a.segmentApiName || '', segmentId: a.segmentId || a.marketSegmentId || '', target: a.activationTargetName || a.activationTarget?.name || '', targetId: a.activationTargetId || a.activationTarget?.id || '', status: a.status || '', lastPublish: a.lastPublishDate || '', lastPublishStatus: a.lastPublishStatus || '', refreshType: a.refreshType || '' }))
    .sort((x, y) => x.name.localeCompare(y.name))
}

function parsePath(raw) {
  if (!raw) return []
  try {
    const v = typeof raw === 'string' ? JSON.parse(decodeHtml(raw)) : raw
    return (Array.isArray(v) ? v.flat(3) : [v]).filter((x) => x && typeof x === 'object')
  } catch { return [] }
}

export function normalizeActivation(a) {
  const attrs = a.attributesConfig?.attributes || []
  const cps = a.contactPointsConfig?.contactPoints || []
  const filters = [...(a.directDmoFiltersConfig?.filters || []), ...(a.relatedDmoFiltersConfig?.filters || [])]
  return {
    id: a.id,
    name: a.name,
    developerName: a.developerName || '',
    status: a.status || '',
    enabled: a.isEnabled !== false && a.enabled !== false,
    type: a.activationType || '',
    processing: a.processingType || '',
    refreshType: a.refreshType || '',
    segment: a.segmentApiName || '',
    segmentId: a.segmentId || a.marketSegmentId || '',
    target: a.activationTargetName || a.activationTarget?.name || '',
    targetId: a.activationTargetId || a.activationTarget?.id || '',
    subject: a.activationTargetSubjectConfig?.developerName || '',
    subjectLabel: a.activationTargetSubjectConfig?.masterLabel || '',
    membership: a.membershipName || '',
    lastPublish: a.lastPublishDate || '',
    lastPublishStatus: a.lastPublishStatus || '',
    excludeDeletes: !!a.shouldExcludeDeletes,
    excludeUpdates: !!a.shouldExcludeUpdates,
    latestAudience: a.latestAudienceDmoApiName || '',
    historyAudience: a.historyAudienceDmoApiName || '',
    latestAudienceRun: a.latestAudienceDmoLastRunTimestamp || '',
    attributes: attrs.map((x) => ({ name: x.name, label: x.label || x.name, entity: x.entityName || '', output: x.referenceAttributeName || x.name, type: x.dataSourceType || x.type || '', source: x.source || '' })),
    contactPoints: cps.map((c) => ({ entity: c.contactPointEntityName || '', path: parsePath(c.contactPointPath).map((p) => `${p.objectApiName || p.objectName || ''}.${p.fieldApiName || p.fieldName || ''}`).filter((x) => x !== '.') })),
    filters: filters.map((f) => (typeof f === 'string' ? decodeHtml(f) : JSON.stringify(f))),
  }
}

export async function loadActivation(call, version, id) {
  const res = await call(`/services/data/v${version}/ssot/activations/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
  return normalizeActivation(res.data || {})
}

// ---- filters in plain words (feedback #115) ----

const shortName = (n) => String(n || '').replace(/^ssot__/, '').replace(/__(c|dlm|dll|cio)$/, '')
const OP_WORDS = { equal: 'is', equals: 'is', notequal: 'is not', in: 'is one of', notin: 'is not one of', contains: 'contains', notcontains: 'does not contain', startswith: 'starts with', endswith: 'ends with', greaterthan: '>', greaterthanorequal: '≥', lessthan: '<', lessthanorequal: '≤', 'has value': 'has a value', 'has no value': 'has no value', isnull: 'is empty', isnotnull: 'has a value', 'in the last number of days': 'is in the last', 'in the next number of days': 'is in the next' }

function subjectText(f) {
  const s = f.subject || {}
  if (s.fieldName) return `${shortName(s.objectName)}.${shortName(s.fieldName)}`
  const path = f.path?.subjects?.[0]?.labeledSubjects || s.labeledSubjects
  if (Array.isArray(path) && path.length) return path.map((p) => `${shortName(p.objectName)}.${shortName(p.fieldName)}`).join(' via ')
  return '?'
}

function leafText(f, type) {
  const op = String(f.operator || '').toLowerCase()
  const words = OP_WORDS[op] || op || '?'
  let vals = Array.isArray(f.values) ? f.values : f.value != null ? [f.value] : []
  if (/RelativeToNow/i.test(type || '') && vals.length) return `${subjectText(f)} ${words} ${vals[0]} days`
  if (/has (no )?value/.test(words) || /empty/.test(words)) vals = []
  return `${subjectText(f)} ${words}${vals.length ? ` ${vals.map((v) => JSON.stringify(v)).join(', ')}` : ''}`
}

function walk(node, depth, out) {
  if (!node || typeof node !== 'object') return
  const inner = node.filter && typeof node.filter === 'object' ? node.filter : node
  const type = node.type || inner.type || ''
  const kids = Array.isArray(inner.filters) ? inner.filters : []
  if (/Logical/i.test(type) || (kids.length && !inner.subject && !inner.path)) {
    const op = String(inner.operator || 'and').toUpperCase()
    out.push({ depth, text: `${op === 'OR' ? 'Any' : 'All'} of these (${op}):` })
    for (const k of kids) walk(k, depth + 1, out)
    return
  }
  out.push({ depth, text: leafText(inner, type) })
  for (const k of kids) walk(k, depth + 1, out) // a leaf can carry nested filters
}

/**
 * An activation filter (a JSON text) as plain lines `[{ depth, text }]`, or null when it is
 * not JSON or not a shape this reads. Two shapes: an entity filter (conditions on an object)
 * and a limit on related rows (keep the top N by a field).
 */
export function describeActivationFilter(text) {
  let f
  try { f = typeof text === 'string' ? JSON.parse(text) : text } catch { return null }
  if (!f || typeof f !== 'object') return null
  const out = []
  if (f.entityFilter) {
    const e = f.entityFilter
    const where = e.entityName ? ` on ${shortName(e.entityName)}` : ''
    out.push({ depth: 0, text: `${e.attributeSource === 'RELATED' ? 'Related' : 'Direct'} filter${where}:` })
    if (e.condition) walk(e.condition, 1, out)
    return out
  }
  if (f.filterLimit != null || f.maxNumberOfValues != null) {
    const n = f.maxNumberOfValues ?? f.filterLimit
    out.push({ depth: 0, text: `Keep at most ${n} ${shortName(f.entityName)} ${n === 1 ? 'row' : 'rows'}${f.attributeName ? `, ordered by ${shortName(f.attributeName)} ${String(f.order || '').toLowerCase() === 'asc' ? 'ascending' : 'descending'}` : ''}` })
    return out
  }
  if (f.condition || f.filters || f.filter) { walk(f.condition || f, 0, out); return out }
  return null
}

/** An activation as a Markdown document (feedback #115): details, attributes, contact points, filters, audience. */
export function activationMarkdown(act, { counts = {}, host = '' } = {}) {
  const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const when = (v) => (v ? new Date(v).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'never')
  const out = [`# Activation: ${act.name}`, '', `\`${act.developerName}\`${host ? ` in ${host}` : ''}`, '',
    '| | |', '| --- | --- |',
    `| Segment | ${cell(act.segment)} |`, `| Target | ${cell(act.target)} |`,
    `| Status | ${cell(act.status.toLowerCase())}${act.enabled ? '' : ', disabled'} |`,
    `| Last publish | ${cell(act.lastPublishStatus.toLowerCase() || 'never')}, ${when(act.lastPublish)} |`,
    `| Refresh | ${cell([act.refreshType, act.processing].filter(Boolean).join(', ').toLowerCase())} |`,
    `| Activates | ${cell(act.subjectLabel || act.subject)} (\`${act.subject}\`) |`, '',
    `## Attributes sent (${act.attributes.length})`, '', '| Field | Label | Sent as | Type |', '| --- | --- | --- | --- |',
    ...act.attributes.map((x) => `| \`${x.entity}.${x.name}\` | ${cell(x.label)} | \`${x.output}\` | ${cell(x.type)} |`), '',
    '## Contact points', '', ...(act.contactPoints.length ? act.contactPoints.map((c) => `- \`${c.entity}\`${c.path.length ? ` through ${c.path.map((p) => `\`${p}\``).join(' → ')}` : ''}`) : ['None.']), '',
    '## Filters', '']
  if (!act.filters.length) out.push('None: every segment member is activated.', '')
  act.filters.forEach((f, i) => {
    const lines = describeActivationFilter(f)
    out.push(`### Filter ${i + 1}`, '')
    if (lines) out.push(...lines.map((l) => `${'  '.repeat(l.depth)}- ${l.text}`), '')
    let pretty = f
    try { pretty = JSON.stringify(JSON.parse(f), null, 2) } catch { /* keep the text */ }
    out.push('```json', pretty, '```', '')
  })
  out.push('## Audience', '')
  for (const [label, t] of [['Latest', act.latestAudience], ['History', act.historyAudience]]) if (t) out.push(`- ${label}: \`${t}\`${counts[t] != null ? `, ${Number(counts[t]).toLocaleString()} rows` : ''}`)
  if (act.latestAudienceRun) out.push(`- Latest audience built ${when(act.latestAudienceRun)}`)
  return `${out.join('\n')}\n`
}
