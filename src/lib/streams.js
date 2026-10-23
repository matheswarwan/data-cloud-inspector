// Data streams page: one stream's settings and fields (GET ssot/data-streams/<name>, checked
// live): connector and source object, refresh mode and schedule, record counts, source
// fields with types, and the DLO fields they land in.

export async function loadStream(call, version, name) {
  const res = await call(`/services/data/v${version}/ssot/data-streams/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
  return normalizeStream(res.data || {})
}

export function normalizeStream(s) {
  const rc = s.refreshConfig || {}
  const freq = rc.frequency || {}
  const dlo = s.dataLakeObjectInfo || {}
  const dloFields = (dlo.dataLakeFieldInfoRepresentation || dlo.fields || []).map((f) => ({ name: f.name, label: f.label || f.name, type: f.dataType || f.type || '', primaryKey: !!f.isPrimaryKey }))
  return {
    name: s.name,
    label: s.label || s.name,
    status: s.status || '',
    enabled: s.isEnabled !== false,
    type: s.dataStreamType || '',
    accessMode: s.dataAccessMode || '',
    dataSource: s.dataSource || '',
    connector: s.connectorInfo?.connectorType || '',
    connectorName: s.connectorInfo?.connectorDetails?.name || '',
    sourceObject: s.connectorInfo?.connectorDetails?.sourceObject || '',
    lastRunStatus: s.lastRunStatus || '',
    lastRefresh: s.lastRefreshDate || '',
    totalRecords: s.totalRecords ?? null,
    lastAdded: s.lastAddedRecords ?? null,
    lastProcessed: s.lastProcessedRecords ?? null,
    frequency: freq.frequencyType || '',
    hours: freq.hours || [],
    days: freq.refreshDayOfMonth || [],
    refreshMode: rc.refreshMode || '',
    fullRefresh: rc.fullRefreshIntervalDays || '',
    fetchImmediately: !!rc.shouldFetchImmediately,
    acceleration: !!rc.isAccelerationEnabled,
    recordId: s.recordId || '',
    problemDlo: s.problemRecordDataLakeObjectName || '',
    dlo: { name: dlo.name || '', label: dlo.label || dlo.name || '', category: dlo.category || '', fields: dloFields },
    sourceFields: (s.sourceFields || []).map((f) => ({ name: f.name, type: f.datatype || f.dataType || '' })),
  }
}

/** Source fields with the DLO field each lands in (same name, or the name with __c). */
export function fieldMap(stream) {
  const byName = new Map(stream.dlo.fields.map((f) => [f.name.toLowerCase(), f]))
  return stream.sourceFields.map((f) => {
    const hit = byName.get(f.name.toLowerCase()) || byName.get(`${f.name.toLowerCase()}__c`) || byName.get(f.name.toLowerCase().replace(/__c$/, '_c'))
    return { ...f, dloField: hit?.name || '', dloLabel: hit?.label || '' }
  })
}

const FREQ = { BATCH: 'when the source changes (batch)', STREAMING: 'streaming', HOURLY: 'every hour', DAILY: 'every day', WEEKLY: 'every week', MONTHLY: 'every month', NONE: 'not scheduled' }
export function describeSchedule(s) {
  const parts = [FREQ[s.frequency] || s.frequency.toLowerCase() || 'unknown']
  if (s.hours.length) parts.push(`at ${s.hours.map((h) => `${h}:00`).join(', ')}`)
  if (s.days.length) parts.push(`on day ${s.days.join(', ')}`)
  if (s.refreshMode) parts.push(`${s.refreshMode.toLowerCase().replace(/_/g, ' ')} mode`)
  if (s.fullRefresh && s.fullRefresh !== 'NONE') parts.push(`full refresh every ${s.fullRefresh.replace(/^DAYS_/, '')} days`)
  return parts.join(', ')
}
