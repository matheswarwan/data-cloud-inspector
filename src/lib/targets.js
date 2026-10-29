// Data targets (feedback #1064): the activation targets an activation sends to, from the
// ActivationTarget object with SOQL. Fields from the user's org (API v66.0, 2026-10-29):
// MasterLabel, Description, RunStatus, LastPublishStatusDate, LastPublishStatusErrorMessage,
// ConnectionType, TargetType, ExportToDirectory, ExportToEndpoint, TargetStatus,
// LastTargetStatusDateTime, LastTargetStatusErrorCode, OutputFormat, DataSpaceId, PlatformName,
// PlatformPrivacyType, IsCommunicationCappingEnabled, OwnedByOrg, IsRemote,
// AudienceHistoryDmoName, AudienceLatestDmoName, AuditDmoName.

export const TARGET_FIELDS = [
  'Id', 'MasterLabel', 'Description', 'RunStatus', 'LastPublishStatusDate', 'LastPublishStatusErrorMessage',
  'ConnectionType', 'TargetType', 'ExportToDirectory', 'ExportToEndpoint', 'TargetStatus', 'LastTargetStatusDateTime',
  'LastTargetStatusErrorCode', 'OutputFormat', 'DataSpaceId', 'PlatformName', 'PlatformPrivacyType',
  'IsCommunicationCappingEnabled', 'OwnedByOrg', 'IsRemote', 'AudienceHistoryDmoName', 'AudienceLatestDmoName',
  'AuditDmoName', 'CreatedDate', 'LastModifiedDate',
]

// Every field the org has (FIELDS(ALL) allows up to 200 rows); the named fields if that is refused.
export const targetsSoql = () => 'SELECT FIELDS(ALL) FROM ActivationTarget ORDER BY MasterLabel LIMIT 200'
export const targetsSoqlNamed = (fields = TARGET_FIELDS) => `SELECT ${fields.join(', ')} FROM ActivationTarget ORDER BY MasterLabel LIMIT 2000`

const str = (v) => (v == null ? '' : String(v))

/** One record in plain names. */
export function normalizeTarget(r) {
  return {
    id: str(r.Id), label: str(r.MasterLabel || r.Name || r.DeveloperName || r.Id), description: str(r.Description),
    platform: str(r.PlatformName), connection: str(r.ConnectionType), targetType: str(r.TargetType), outputFormat: str(r.OutputFormat),
    status: str(r.TargetStatus), statusAt: str(r.LastTargetStatusDateTime), statusError: str(r.LastTargetStatusErrorCode),
    runStatus: str(r.RunStatus), publishAt: str(r.LastPublishStatusDate), publishError: str(r.LastPublishStatusErrorMessage),
    directory: str(r.ExportToDirectory), endpoint: str(r.ExportToEndpoint), dataSpaceId: str(r.DataSpaceId),
    privacyType: str(r.PlatformPrivacyType), capping: r.IsCommunicationCappingEnabled === true, ownedBy: str(r.OwnedByOrg), remote: r.IsRemote === true,
    latestDmo: str(r.AudienceLatestDmoName), historyDmo: str(r.AudienceHistoryDmoName), auditDmo: str(r.AuditDmoName),
    created: str(r.CreatedDate), modified: str(r.LastModifiedDate), raw: r,
  }
}

/** Status like Health's: fail (an error recorded), idle (not active), running (publishing), ok. */
export function targetHealth(t) {
  if (t.statusError || t.publishError || /error|fail/i.test(t.status)) return { level: 'fail', reason: t.publishError || t.statusError || `Target is ${t.status.toLowerCase()}` }
  if (t.status && !/^active$/i.test(t.status)) return { level: 'idle', reason: `Target is ${t.status.toLowerCase()}` }
  if (/publish|progress|running|processing/i.test(t.runStatus)) return { level: 'running', reason: `Run status ${t.runStatus.toLowerCase()}` }
  return { level: 'ok', reason: t.status ? 'Active' : 'No status' }
}

/** Targets in the selected data space (all when the data space ID is unknown). */
export function inDataSpace(targets, dataSpaceId) {
  if (!dataSpaceId) return targets
  const id = dataSpaceId.slice(0, 15)
  return targets.filter((t) => !t.dataSpaceId || t.dataSpaceId.slice(0, 15) === id)
}

/** The activations that send to a target, by its ID or, when the list has no ID, its name. */
export function activationsFor(target, activations = []) {
  const id = target.id.slice(0, 15)
  return activations.filter((a) => (a.targetId ? a.targetId.slice(0, 15) === id : a.target && a.target === target.label))
}

export async function loadTargets(call, version) {
  const run = async (soql) => {
    const res = await call(`/services/data/v${version}/query?q=${encodeURIComponent(soql)}`)
    if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
    return res.data?.records || []
  }
  let rows
  try { rows = await run(targetsSoql()) } catch { rows = await run(targetsSoqlNamed()) }
  return rows.map(normalizeTarget)
}

/** A target as Markdown for Download. */
export function targetMarkdown(t, { activations = [], host = '', counts = {} } = {}) {
  const kv = [['Platform', t.platform], ['Connection type', t.connection], ['Target type', t.targetType], ['Output format', t.outputFormat],
    ['Status', t.status], ['Status changed', t.statusAt], ['Status error code', t.statusError], ['Run status', t.runStatus],
    ['Last publish', t.publishAt], ['Last publish error', t.publishError], ['Export directory', t.directory], ['Export endpoint', t.endpoint],
    ['Owned by', t.ownedBy], ['Remote', t.remote ? 'yes' : 'no'], ['Communication capping', t.capping ? 'on' : 'off'], ['Privacy type', t.privacyType],
    ['Latest audience', t.latestDmo], ['Audience history', t.historyDmo], ['Audit', t.auditDmo], ['Record ID', t.id]].filter(([, v]) => v)
  const lines = [`# ${t.label}`, '', host ? `${host}.` : '', t.description, '', '| Field | Value |', '| --- | --- |', ...kv.map(([k, v]) => `| ${k} | ${String(v).replace(/\|/g, '\\|')} |`)]
  if (Object.keys(counts).length) lines.push('', '## Audience rows', '', ...Object.entries(counts).map(([k, v]) => `- ${k}: ${typeof v === 'number' ? v.toLocaleString() : v}`))
  lines.push('', `## Activations (${activations.length})`, '', ...(activations.length ? activations.map((a) => `- ${a.name} (${a.segment || 'segment'}), last publish ${String(a.lastPublishStatus || 'never').toLowerCase()}`) : ['None found in this data space.']))
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}
