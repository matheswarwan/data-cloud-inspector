// Activations page (GET ssot/activations and ssot/activations/<id>, checked live): the segment,
// target, refresh type and last publish; the attributes sent and their output names; contact
// points; filters; and the latest and history audience DMOs.

import { decodeHtml } from './segments.js'
import { offsetPages } from './health.js'
import { inSpace } from './dataSpace.js'

export async function loadActivations(call, version) {
  return inSpace(await offsetPages(call, `/services/data/v${version}/ssot/activations`, 'activations'), call.dataSpace)
    .map((a) => ({ id: a.id, name: a.name, developerName: a.developerName, segment: a.segmentApiName || '', segmentId: a.segmentId || a.marketSegmentId || '', target: a.activationTargetName || a.activationTarget?.name || '', status: a.status || '', lastPublish: a.lastPublishDate || '', lastPublishStatus: a.lastPublishStatus || '', refreshType: a.refreshType || '' }))
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
