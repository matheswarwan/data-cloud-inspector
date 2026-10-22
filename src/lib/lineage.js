// Where an object's data comes from: data streams feed DLOs, DLOs map to DMOs.

import { fetchAllPages } from './pages.js'

export async function loadStreams(call, version) {
  const raw = await fetchAllPages(call, `/services/data/v${version}/ssot/data-streams?limit=50`, 'dataStreams')
  return raw.map((s) => ({
    name: s.name,
    label: s.label || s.name,
    dlo: s.dataLakeObjectInfo?.name || '',
    status: s.status || '',
    lastRunStatus: s.lastRunStatus || '',
    lastRefreshDate: s.lastRefreshDate || '',
    totalRecords: s.totalRecords ?? null,
    lastProcessedRecords: s.lastProcessedRecords ?? null,
    dataSource: s.dataSource || '',
    connector: s.connectorInfo?.connectorType || '',
    sourceObject: s.connectorInfo?.connectorDetails?.sourceObject || '',
    frequency: s.refreshConfig?.frequency?.frequencyType || '',
    recordId: s.recordId || '',
  }))
}

/** The DLO (or CRM object) to DMO mappings of one DMO. */
export async function loadMappings(call, version, dmoName, dataspace = 'default') {
  const res = await call(`/services/data/v${version}/ssot/data-model-object-mappings?dataspace=${encodeURIComponent(dataspace)}&dmoDeveloperName=${encodeURIComponent(dmoName)}`)
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
  return (res.data?.objectSourceTargetMaps || []).map((m) => ({
    name: m.developerName,
    source: m.sourceEntityDeveloperName,
    target: m.targetEntityDeveloperName,
    status: m.status || '',
    fields: (m.fieldMappings || []).map((f) => ({ source: f.sourceFieldDeveloperName, target: f.targetFieldDeveloperName })),
  }))
}

/**
 * Every DMO's mappings, a few at a time, for "which DMOs does this DLO feed?".
 * Returns a flat list; DMOs whose call failed are skipped.
 */
export async function loadAllMappings(call, version, dmoNames, { concurrency = 5, onProgress = () => {} } = {}) {
  const out = []
  let done = 0
  for (let i = 0; i < dmoNames.length; i += concurrency) {
    const batch = dmoNames.slice(i, i + concurrency)
    const lists = await Promise.all(batch.map((n) => loadMappings(call, version, n).catch(() => [])))
    lists.forEach((l) => out.push(...l))
    done += batch.length
    onProgress(done, dmoNames.length)
  }
  return out
}
