// Marketing flows (Marketing Cloud Next, analysis doc 2026-10-27): flows are Flow Builder
// flows, listed from FlowDefinitionView with SOQL; one version's steps come from the
// Tooling API Flow record's Metadata. Which ProcessType and TriggerType values mark a
// marketing flow is not yet seen on an org with Marketing Cloud Next, so the page lists
// every flow and filters by type, with a loose "marketing" guess.
import { soqlAll } from './personalization.js'

const FULL = 'SELECT Id, ApiName, Label, Description, ProcessType, TriggerType, TriggerObjectOrEventLabel, IsActive, ActiveVersionId, LatestVersionId, LastModifiedDate FROM FlowDefinitionView ORDER BY Label'
const MINIMAL = 'SELECT Id, ApiName, Label, ProcessType, TriggerType, IsActive, ActiveVersionId, LatestVersionId, LastModifiedDate FROM FlowDefinitionView ORDER BY Label'

/** Every flow definition; a field the org's API version lacks falls back to the minimal list. */
export async function loadFlows(call, version) {
  try { return await soqlAll(call, version, FULL) } catch (e) {
    if (!/INVALID_FIELD|No such column/i.test(e.message)) throw e
    return soqlAll(call, version, MINIMAL)
  }
}

const MARKETING = /segment|marketing|journey|activation|datacloud|data_cloud|broadcast|engagement|automationevent|campaign|ondemand/i

/** A loose guess that a flow is a marketing flow, from its type and trigger. */
export const isMarketingFlow = (f) => MARKETING.test(`${f.ProcessType || ''} ${f.TriggerType || ''}`)

/** `[{ type, count }]` of ProcessType, most first. */
export function flowTypes(flows) {
  const m = new Map()
  for (const f of flows) m.set(f.ProcessType || 'Unknown', (m.get(f.ProcessType || 'Unknown') || 0) + 1)
  return [...m].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
}

const RECORD_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/

/** One flow version's metadata from the Tooling API. */
export async function loadFlowVersion(call, version, versionId) {
  if (!RECORD_ID.test(String(versionId || ''))) throw new Error('This flow has no version to read.')
  const res = await call(`/services/data/v${version}/tooling/sobjects/Flow/${versionId}`)
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
  return res.data
}

const ELEMENTS = [
  ['actionCalls', 'Action'], ['decisions', 'Decision'], ['waits', 'Wait'], ['assignments', 'Assignment'],
  ['recordLookups', 'Get records'], ['recordCreates', 'Create records'], ['recordUpdates', 'Update records'],
  ['recordDeletes', 'Delete records'], ['loops', 'Loop'], ['subflows', 'Subflow'], ['screens', 'Screen'],
  ['collectionProcessors', 'Collection'], ['transforms', 'Transform'], ['customErrors', 'Error'],
]

const nextOf = (el) => [
  ...(el.rules || []).map((r) => r.connector?.targetReference),
  ...(el.waitEvents || []).map((w) => w.connector?.targetReference),
  el.connector?.targetReference, el.nextValueConnector?.targetReference, el.noMoreValuesConnector?.targetReference,
  el.defaultConnector?.targetReference, el.faultConnector?.targetReference,
].filter(Boolean)

/**
 * The start and every element of a version's metadata, in run order where it can be
 * followed from the start: `{ start, steps: [{ name, label, type, detail, next }] }`.
 */
export function flowSteps(metadata) {
  const md = metadata?.Metadata || metadata || {}
  const all = []
  for (const [key, type] of ELEMENTS) {
    for (const el of md[key] || []) {
      const detail = type === 'Action' ? [el.actionType, el.actionName].filter(Boolean).join(': ')
        : type === 'Decision' ? (el.rules || []).map((r) => r.label || r.name).join(', ')
          : type === 'Wait' ? (el.waitEvents || []).map((w) => w.label || w.name).join(', ')
            : el.object || el.flowName || ''
      all.push({ name: el.name, label: el.label || el.name, type, detail, next: nextOf(el) })
    }
  }
  const byName = new Map(all.map((s) => [s.name, s]))
  const start = md.start || null
  const order = []
  const seen = new Set()
  const queue = [start?.connector?.targetReference, ...(start?.scheduledPaths || []).map((p) => p.connector?.targetReference)].filter(Boolean)
  while (queue.length) {
    const n = queue.shift()
    if (seen.has(n) || !byName.has(n)) continue
    seen.add(n)
    order.push(byName.get(n))
    queue.push(...byName.get(n).next)
  }
  for (const s of all) if (!seen.has(s.name)) order.push(s)
  return { start, steps: order }
}

/** The start in words: trigger, object or segment, activation or data graph, schedule. */
export function startSummary(start) {
  if (!start) return ''
  const name = (v) => (v && typeof v === 'object' ? v.name || v.developerName || v.label || '' : v)
  const parts = [start.triggerType, start.object, name(start.segment) || start.segmentName, start.recordTriggerType,
    name(start.activation) && `activation ${name(start.activation)}`, name(start.dataGraph) && `data graph ${name(start.dataGraph)}`,
    start.schedule?.frequency && `${start.schedule.frequency.toLowerCase()} from ${start.schedule.startDate || ''}`.trim()]
  return parts.filter(Boolean).join(' · ') || 'No trigger: runs from a screen, a button or another flow'
}
