// Health: one status per data stream, identity resolution ruleset, calculated insight,
// segment and activation, problems first. Fields checked on a live org (API v68.0,
// 2026-10-22):
// - data streams: status, lastRunStatus (NONE = never ran), lastRefreshDate, totalRecords,
//   lastProcessedRecords, refreshConfig.frequency.frequencyType;
// - GET identity-resolutions/<record id>: lastJobStatus, lastJobCompleted, sourceProfiles,
//   totalUnifiedProfiles, matchedSourceProfiles, consolidationRate, anonymousUnifiedProfiles;
// - calculated-insights (collection.items): calculatedInsightStatus, lastRunStatus,
//   lastRunDateTime, lastRunStatusErrorCode, publishScheduleInterval;
// - segments: segmentStatus, publishStatus, lastPublishedEndDateTime, publishInterval;
// - activations: status, lastPublishStatus, lastPublishDate, activationTargetName, segmentApiName.

import { loadStreams } from './lineage.js'
import { loadSegments } from './segments.js'
import { parseRulesets } from './profile.js'
import { SETUP_QUERIES } from './personalization.js'
import { inSpace } from './dataSpace.js'
import { problemCounts, withProblems } from './problems.js'
import { loadFlows, isMarketingFlow } from './flows.js'
import { isOn } from './features.js'
import { healthSectionListed } from './optionalPages.js'
import { runQuery } from './query.js'
import { eventTimeField, toObjects } from './profile.js'

export const LEVELS = ['fail', 'warn', 'running', 'idle', 'ok']
export const LEVEL_TEXT = { fail: 'Failed', warn: 'Needs a look', running: 'Running', idle: 'Inactive', ok: 'OK' }

const NOT_SET_UP = /sObject type '[^']*' is not supported/i
const RUNNING = /progress|processing|running|pending|queued|publishing/i
const FAILED = /fail|error|abort|cancel/i

function runLevel(status) {
  const s = String(status || '')
  if (!s || s === 'NONE') return null
  if (FAILED.test(s)) return 'fail'
  if (RUNNING.test(s)) return 'running'
  if (/success|complete|succeeded/i.test(s)) return 'ok'
  return 'warn'
}

// publishInterval values seen or documented: NO_REFRESH, ONE, FOUR, TWELVE, TWENTY_FOUR (hours).
const HOURS = { ONE: 1, FOUR: 4, SIX: 6, TWELVE: 12, TWENTY_FOUR: 24, DAILY: 24, WEEKLY: 168 }
export function intervalHours(interval) {
  const s = String(interval || '').toUpperCase().replace(/_HOURS?$/, '')
  if (HOURS[s]) return HOURS[s]
  const n = Number(s.replace(/\D/g, ''))
  return n > 0 && /\d/.test(s) ? n : null
}

const ZERO_COPY = /bigquery|snowflake|databricks|redshift|federat|zero.?copy|external.?data/i
export const isZeroCopy = (s) => ZERO_COPY.test(`${s.connector || ''} ${s.dataSource || ''}`)
const hasSchedule = (s) => !!s.frequency && !/^(none|no_?refresh|manual)$/i.test(s.frequency)

export function streamHealth(s) {
  const base = { kind: 'Data stream', name: s.name, label: s.label, recordId: s.recordId, lastRun: s.lastRefreshDate || null, dlo: s.dlo, problemDlo: s.problemDlo || '' }
  const details = [`${s.connector || 'stream'}${s.sourceObject ? `: ${s.sourceObject}` : ''}`, s.totalRecords != null ? `${s.totalRecords.toLocaleString()} records` : null, s.lastProcessedRecords != null ? `last run processed ${s.lastProcessedRecords.toLocaleString()}` : null].filter(Boolean).join(', ')
  if (s.status && s.status !== 'ACTIVE') return { ...base, level: 'idle', reason: `Stream is ${s.status.toLowerCase()}`, details }
  const level = runLevel(s.lastRunStatus)
  // Zero copy (feedback #116): a federated stream (BigQuery, Snowflake, Databricks, Redshift)
  // is queried live, so it never "runs". Only with acceleration (a refresh schedule) does it.
  if (!level && isZeroCopy(s) && !hasSchedule(s)) return { ...base, level: 'ok', reason: 'Zero copy: queried live from the source, no refresh runs', details }
  if (!level) return { ...base, level: 'warn', reason: isZeroCopy(s) ? 'Zero copy with acceleration: has never refreshed' : 'Has never run', details }
  return { ...base, level, reason: level === 'ok' ? 'Last run succeeded' : `Last run: ${s.lastRunStatus.toLowerCase()}`, details }
}

export function rulesetHealth(r, stats = {}) {
  const base = { kind: 'Identity resolution', name: r.id, label: r.label, recordId: r.recordId, lastRun: stats.lastJobCompleted || r.lastJobCompleted || null }
  const src = stats.sourceProfiles
  const uni = stats.totalUnifiedProfiles
  // consolidationRate was 0 on the only org seen; read values up to 1 as a fraction.
  const rate = stats.consolidationRate == null ? null : stats.consolidationRate <= 1 ? stats.consolidationRate * 100 : stats.consolidationRate
  const details = src != null
    ? `${src.toLocaleString()} source profiles into ${(uni ?? 0).toLocaleString()} unified, consolidation rate ${rate != null ? `${Math.round(rate * 10) / 10}%` : 'unknown'}${stats.anonymousUnifiedProfiles ? `, ${stats.anonymousUnifiedProfiles.toLocaleString()} anonymous` : ''}`
    : ''
  if (r.status && r.status !== 'PUBLISHED') return { ...base, level: 'idle', reason: `Ruleset is ${r.status.toLowerCase()}`, details }
  const level = runLevel(stats.lastJobStatus || r.lastJobStatus)
  if (!level) return { ...base, level: 'warn', reason: 'Has never run', details }
  if (level === 'ok' && src === 0) return { ...base, level: 'warn', reason: 'Last run had no source profiles (did it run before the data arrived?)', details }
  return { ...base, level, reason: level === 'ok' ? 'Last run succeeded' : `Last run: ${String(stats.lastJobStatus || r.lastJobStatus).toLowerCase()}`, details }
}

export function insightHealth(ci) {
  const base = { kind: 'Calculated insight', name: ci.apiName, label: ci.displayName || ci.apiName, lastRun: ci.lastRunDateTime || null }
  const details = [ci.definitionType?.replace(/_/g, ' ').toLowerCase(), ci.publishScheduleInterval ? `schedule ${ci.publishScheduleInterval.replace(/_/g, ' ').toLowerCase()}` : null].filter(Boolean).join(', ')
  if (ci.isEnabled === false || (ci.calculatedInsightStatus && ci.calculatedInsightStatus !== 'ACTIVE')) return { ...base, level: 'idle', reason: `Insight is ${String(ci.calculatedInsightStatus || 'disabled').toLowerCase()}`, details }
  const level = runLevel(ci.lastRunStatus)
  if (!level) return { ...base, level: 'warn', reason: 'Has never run', details }
  const err = ci.lastRunStatusErrorCode || ci.lastCalcInsightStatusErrorCode
  return { ...base, level, reason: level === 'ok' ? 'Last run succeeded' : `Last run: ${String(ci.lastRunStatus).toLowerCase()}${err ? ` (${err})` : ''}`, details }
}

export function segmentHealth(s, now = Date.now()) {
  const base = { kind: 'Segment', name: s.apiName, label: s.label, recordId: s.id, lastRun: s.lastPublished || null }
  const details = [`${s.lastCount != null ? s.lastCount.toLocaleString() : '?'} members`, s.publishInterval ? `schedule ${s.publishInterval.replace(/_/g, ' ').toLowerCase()}` : null].filter(Boolean).join(', ')
  if (s.status && s.status !== 'ACTIVE') return { ...base, level: 'idle', reason: `Segment is ${s.status.toLowerCase()}`, details }
  const level = runLevel(s.publishStatus)
  if (!level || !s.lastPublished) return { ...base, level: 'warn', reason: 'Has never been published', details }
  if (level !== 'ok') return { ...base, level, reason: `Last publish: ${s.publishStatus.toLowerCase()}`, details }
  const hours = intervalHours(s.publishInterval)
  if (hours && now - Date.parse(s.lastPublished) > 2 * hours * 3600 * 1000) {
    return { ...base, level: 'warn', reason: `Overdue: scheduled every ${hours} h, last published ${Math.round((now - Date.parse(s.lastPublished)) / 3600000)} h ago`, details }
  }
  return { ...base, level: 'ok', reason: 'Last publish succeeded', details }
}

export function activationHealth(a) {
  const base = { kind: 'Activation', name: a.developerName || a.name, label: a.name, recordId: a.id, lastRun: a.lastPublishDate || null }
  const details = `${a.segmentApiName || 'segment'} to ${a.activationTargetName || a.activationTarget?.name || 'target'}${a.refreshType ? `, ${a.refreshType.toLowerCase()}` : ''}`
  if (a.status && a.status !== 'ACTIVE') return { ...base, level: 'idle', reason: `Activation is ${a.status.toLowerCase()}`, details }
  const level = runLevel(a.lastPublishStatus)
  if (!level) return { ...base, level: 'warn', reason: 'Has never been published', details }
  return { ...base, level, reason: level === 'ok' ? 'Last publish succeeded' : `Last publish: ${String(a.lastPublishStatus).toLowerCase()}`, details }
}

export function recommenderHealth(r) {
  const base = { kind: 'Recommender', name: r.Id, label: r.Name, recordId: r.Id, lastRun: r.LastRefresh || null }
  const details = [r.Goal ? `goal ${r.Goal}` : '', r.LastSuccessfulRefresh ? `last success ${r.LastSuccessfulRefresh}` : ''].filter(Boolean).join(', ')
  if (r.Status && !/^(active|ready|enabled)$/i.test(r.Status)) return { ...base, level: 'idle', reason: `Recommender is ${String(r.Status).toLowerCase()}`, details }
  const level = runLevel(r.LatestRefreshedStatus)
  if (!level) return { ...base, level: 'warn', reason: 'Has never refreshed', details }
  return { ...base, level, reason: level === 'ok' ? 'Last refresh succeeded' : `Last refresh: ${String(r.LatestRefreshedStatus).toLowerCase()}`, details }
}

// Marketing Cloud Next (analysis doc 2026-10-27): marketing flows that are switched off,
// and engagement objects that stopped getting rows.
export function marketingFlowHealth(f) {
  const base = { kind: 'Marketing flow', name: f.ApiName || f.Id, label: f.Label || f.ApiName, recordId: f.ActiveVersionId || f.LatestVersionId || f.Id, lastRun: f.LastModifiedDate || null, details: [f.ProcessType, f.TriggerType].filter(Boolean).join(', ') }
  return f.IsActive ? { ...base, level: 'ok', reason: 'Active' } : { ...base, level: 'idle', reason: 'Flow is inactive' }
}

export const ENGAGEMENT_STALE_DAYS = 7

export function engagementHealth(obj, latest, now = Date.now()) {
  const base = { kind: 'Engagement data', name: obj.name, label: obj.label || obj.name, lastRun: latest || null, details: obj.timeField ? `newest ${obj.timeField}` : '' }
  if (!latest) return { ...base, level: 'warn', reason: 'No rows' }
  const days = Math.floor((now - Date.parse(latest)) / 86400000)
  return days > ENGAGEMENT_STALE_DAYS ? { ...base, level: 'warn', reason: `No new rows in ${days} days` } : { ...base, level: 'ok', reason: 'Rows in the last week' }
}

export async function offsetPages(call, path, key) {
  const out = []
  for (let offset = 0; offset < 5000; offset += 100) {
    const res = await call(`${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${offset}`)
    if (!res.ok) { if (!out.length) throw new Error(res.error || `HTTP ${res.status}`); break }
    const page = res.data?.[key] || []
    out.push(...page)
    if (page.length < 100) break
  }
  return out
}

export async function insightPages(call, version) {
  const out = []
  let path = `/services/data/v${version}/ssot/calculated-insights`
  for (let i = 0; path && i < 50; i++) {
    const res = await call(path)
    if (!res.ok) { if (!out.length) throw new Error(res.error || `HTTP ${res.status}`); break }
    out.push(...(res.data?.collection?.items || []))
    path = res.data?.collection?.nextPageUrl || null
  }
  return out
}

/**
 * Every section, each `{ title, items, error }`; a section that fails to load says so
 * and the others still show.
 */
export async function loadHealth(call, version, { now = Date.now(), onProgress = () => {}, segments: loadSegs = null, objects: loadObjects = null } = {}) {
  const v = `/services/data/v${version}/ssot`
  let done = 0
  const MCN = isOn('mcnHealth')
  // Personalization and Marketing flows only when their pages are turned on (Settings > Pages).
  const P13N = healthSectionListed('Personalization recommenders')
  const FLOWS = MCN && healthSectionListed('Marketing flows')
  const TOTAL = 5 + (P13N ? 1 : 0) + (MCN ? 1 : 0) + (FLOWS ? 1 : 0)
  const section = async (title, fn) => {
    let out
    try { out = { title, items: sortItems(await fn()), error: '' } } catch (err) {
      // An org without Personalization answers "sObject type ... is not supported" (feedback #114).
      out = NOT_SET_UP.test(err.message) ? { title, items: [], error: '', notice: 'Not set up in this org.' } : { title, items: [], error: err.message }
    }
    onProgress(`${++done} of ${TOTAL} areas checked (last: ${title})`)
    return out
  }
  return Promise.all([
    section('Data streams', async () => {
      const items = (await loadStreams(call, version)).map(streamHealth)
      const counts = await problemCounts(call, version, items.map((i) => i.problemDlo))
      return items.map((i) => withProblems(i, counts.get(i.problemDlo)))
    }),
    section('Identity resolution', async () => {
      const res = await call(`${v}/identity-resolutions`)
      if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
      const rulesets = parseRulesets(inSpace(res.data?.identityResolutions, call.dataSpace))
      return Promise.all(rulesets.map(async (r) => {
        const one = r.recordId ? await call(`${v}/identity-resolutions/${r.recordId}`) : null
        return rulesetHealth(r, one?.ok ? one.data : {})
      }))
    }),
    section('Calculated insights', async () => (await insightPages(call, version)).map(insightHealth)),
    section('Segments', async () => (await (loadSegs ? loadSegs() : loadSegments(call, version))).map((s) => segmentHealth(s, now))),
    section('Activations', async () => inSpace(await offsetPages(call, `${v}/activations`, 'activations'), call.dataSpace).map(activationHealth)),
    ...(P13N ? [section('Personalization recommenders', async () => {
      const res = await call(`/services/data/v${version}/query?q=${encodeURIComponent(SETUP_QUERIES.recommenders)}`)
      if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
      return (res.data?.records || []).filter((r) => !call.dataSpaceId || !r.DataSpaceId || r.DataSpaceId.slice(0, 15) === call.dataSpaceId.slice(0, 15)).map(recommenderHealth)
    })] : []),
    ...(FLOWS ? [section('Marketing flows', async () => (await loadFlows(call, version)).filter(isMarketingFlow).map(marketingFlowHealth))] : []),
    ...(MCN ? [section('Engagement data', async () => {
      const objects = loadObjects ? await loadObjects() : []
      const engagement = (objects || []).filter((o) => o.kind === 'DMO' && o.category === 'Engagement').map((o) => ({ ...o, timeField: eventTimeField(o) })).filter((o) => o.timeField)
      return Promise.all(engagement.map(async (o) => {
        const [row] = toObjects(await runQuery(call, version, `SELECT MAX(${o.timeField}) AS latest FROM ${o.name}`, { rowLimit: 1 }))
        return engagementHealth(o, row?.latest, now)
      }))
    })] : []),
  ])
}

export function sortItems(items) {
  return [...items].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.label.localeCompare(b.label))
}

export function countLevels(items) {
  const c = Object.fromEntries(LEVELS.map((l) => [l, 0]))
  for (const i of items) c[i.level]++
  return c
}

export function healthMarkdown(sections, { host, at = new Date() } = {}) {
  const all = sections.flatMap((s) => s.items)
  const c = countLevels(all)
  const lines = [
    `# Data Cloud health${host ? `: ${host}` : ''}`, '',
    `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC. ${c.fail} failed, ${c.warn} need a look, ${c.running} running, ${c.idle} inactive, ${c.ok} OK.`, '',
  ]
  for (const s of sections) {
    lines.push(`## ${s.title}`, '')
    if (s.error) { lines.push(`Could not load: ${s.error}`, ''); continue }
    if (s.notice) { lines.push(s.notice, ''); continue }
    if (!s.items.length) { lines.push('None.', ''); continue }
    lines.push(...itemTable(s.items), '')
  }
  return lines.join('\n')
}

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
function itemTable(items) {
  return ['| Status | Name | Why | Last run | Details |', '| --- | --- | --- | --- | --- |',
    ...items.map((i) => `| ${LEVEL_TEXT[i.level]} | ${cell(i.label)} | ${cell(i.reason)} | ${cell(i.lastRun)} | ${cell(i.details)} |`)]
}

/** Failed and needs-a-look items only (feedback #1044). */
export const problemItems = (items) => (items || []).filter((i) => i.level === 'fail' || i.level === 'warn')

/**
 * One Health section as Markdown, to copy or download on its own (feedback #1044): `items` are
 * the rows chosen (all, or problemItems), `which` says which in the heading line.
 */
export function sectionMarkdown(title, items, { host = '', at = new Date(), which = '' } = {}) {
  const c = countLevels(items)
  return [
    `# ${title}${which ? `: ${which}` : ''}${host ? ` (${host})` : ''}`, '',
    `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC. ${items.length} item${items.length === 1 ? '' : 's'}: ${c.fail} failed, ${c.warn} need a look.`, '',
    ...(items.length ? itemTable(items) : ['None.']),
    '',
  ].join('\n')
}
