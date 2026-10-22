// The connection check: does the browser session reach the core API and the Data Cloud
// (ssot) endpoints of this org? Every request is a read. Endpoints whose shape we have
// not seen yet are probed here first, so the report tells us what the org returns.

import { latestVersion } from './api.js'
import { describeShape, summarize } from './shape.js'

// A tiny query that works in any Data Cloud org with the standard data model.
export const PROBE_SQL = 'SELECT ssot__Id__c FROM ssot__Individual__dlm LIMIT 1'

export function buildChecks(v) {
  const data = `/services/data/v${v}`
  const ssot = `${data}/ssot`
  return [
    { id: 'org', group: 'Core', label: 'Organization', path: `${data}/query?q=${encodeURIComponent('SELECT IsSandbox, OrganizationType, InstanceName FROM Organization')}` },
    { id: 'me', group: 'Core', label: 'Current user', path: `${data}/chatter/users/me` },
    { id: 'resources', group: 'Core', label: 'API resources (is ssot listed?)', path: `${data}/` },
    { id: 'data-spaces', group: 'Data Cloud', label: 'Data spaces', path: `${ssot}/data-spaces` },
    { id: 'metadata', group: 'Data Cloud', label: 'Metadata (DMOs)', path: `${ssot}/metadata?entityType=DataModelObject` },
    { id: 'dmos', group: 'Data Cloud', label: 'Data model objects', path: `${ssot}/data-model-objects` },
    { id: 'dlos', group: 'Data Cloud', label: 'Data lake objects', path: `${ssot}/data-lake-objects` },
    { id: 'streams', group: 'Data Cloud', label: 'Data streams', path: `${ssot}/data-streams` },
    { id: 'cis', group: 'Data Cloud', label: 'Calculated insights', path: `${ssot}/calculated-insights` },
    { id: 'segments', group: 'Data Cloud', label: 'Segments', path: `${ssot}/segments` },
    { id: 'identity', group: 'Data Cloud', label: 'Identity resolution rulesets', path: `${ssot}/identity-resolutions` },
    { id: 'activation-targets', group: 'Data Cloud', label: 'Activation targets', path: `${ssot}/activation-targets` },
    { id: 'data-graphs', group: 'Data Cloud', label: 'Data graphs', path: `${ssot}/data-graphs/metadata` },
    { id: 'query-sql', group: 'Query', label: 'Query API (query-sql)', method: 'POST', path: `${ssot}/query-sql`, body: { sql: PROBE_SQL } },
    { id: 'queryv2', group: 'Query', label: 'Query API (queryv2)', method: 'POST', path: `${ssot}/queryv2`, body: { sql: PROBE_SQL } },
  ]
}

/**
 * Runs the version lookup, then every check in turn. `call(path, { method, body })`
 * resolves to the SF_FETCH result. `onResult` gets each result as it lands.
 * Returns `{ version, results }`; version is null when the org was not reachable.
 */
export async function runChecks(call, onResult = () => {}) {
  const versions = await call('/services/data/')
  const version = versions.ok ? latestVersion(versions.data) : null
  const first = toResult({ id: 'versions', group: 'Core', label: 'API versions', method: 'GET', path: '/services/data/' }, versions)
  if (version) first.summary = `latest v${version}`
  onResult(first)
  const results = [first]
  if (!version) return { version: null, results }

  for (const check of buildChecks(version)) {
    const res = await call(check.path, { method: check.method, body: check.body })
    const result = toResult(check, res)
    if (check.id === 'resources' && res.ok) result.summary = res.data && 'ssot' in res.data ? 'ssot listed' : 'ssot not listed'
    results.push(result)
    onResult(result)
  }
  return { version, results }
}

function toResult(check, res) {
  return {
    id: check.id,
    group: check.group,
    label: check.label,
    method: check.method || 'GET',
    path: check.path,
    ok: !!res.ok,
    status: res.status,
    ms: res.ms,
    summary: res.ok ? summarize(res.data) : '',
    error: res.ok ? '' : res.error || `HTTP ${res.status}`,
    shape: res.data != null ? describeShape(res.data) : '',
    data: res.data,
  }
}

// Paths in the report lose the org-specific query string values (none today, but the
// Organization SOQL is shortened for readability).
function shortPath(path) {
  return path.replace(/^\/services\/data\/v\d+\.\d+/, '').replace(/\?q=.*/, '?q=…') || '/'
}

/** Markdown for sharing: statuses, errors and response shapes, no values. */
export function buildReport({ extensionVersion, version, results }) {
  const org = results.find((r) => r.id === 'org' && r.ok)?.data?.records?.[0]
  const lines = [
    '# Data Cloud Inspector connection check',
    '',
    `Extension ${extensionVersion}, API ${version ? `v${version}` : 'not reached'}` +
      (org ? `, ${org.OrganizationType}, ${org.IsSandbox ? 'sandbox' : 'production'}` : ''),
    '',
    '| Check | Request | Status | ms | Result |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const r of results) {
    const outcome = r.ok ? r.summary : `**${r.error.replace(/\s+/g, ' ').substring(0, 200)}**`
    lines.push(`| ${r.label} | ${r.method} ${shortPath(r.path)} | ${r.status || 'none'} | ${r.ms ?? ''} | ${outcome.replace(/\|/g, '\\|')} |`)
  }
  lines.push('', '## Response shapes (keys and types only)', '')
  for (const r of results) {
    if (!r.shape || r.id === 'org' || r.id === 'me') continue
    lines.push(`### ${r.label}`, '', '```', r.shape, '```', '')
  }
  return lines.join('\n')
}
