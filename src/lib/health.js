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

export const LEVELS = ['fail', 'warn', 'running', 'idle', 'ok']
export const LEVEL_TEXT = { fail: 'Failed', warn: 'Needs a look', running: 'Running', idle: 'Inactive', ok: 'OK' }

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

export function streamHealth(s) {
  const base = { kind: 'Data stream', name: s.name, label: s.label, recordId: s.recordId, lastRun: s.lastRefreshDate || null, dlo: s.dlo }
  const details = [`${s.connector || 'stream'}${s.sourceObject ? `: ${s.sourceObject}` : ''}`, s.totalRecords != null ? `${s.totalRecords.toLocaleString()} records` : null, s.lastProcessedRecords != null ? `last run processed ${s.lastProcessedRecords.toLocaleString()}` : null].filter(Boolean).join(', ')
  if (s.status && s.status !== 'ACTIVE') return { ...base, level: 'idle', reason: `Stream is ${s.status.toLowerCase()}`, details }
  const level = runLevel(s.lastRunStatus)
  if (!level) return { ...base, level: 'warn', reason: 'Has never run', details }
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
export async function loadHealth(call, version, { now = Date.now() } = {}) {
  const v = `/services/data/v${version}/ssot`
  const section = async (title, fn) => {
    try { return { title, items: sortItems(await fn()), error: '' } } catch (err) { return { title, items: [], error: err.message } }
  }
  return Promise.all([
    section('Data streams', async () => (await loadStreams(call, version)).map(streamHealth)),
    section('Identity resolution', async () => {
      const res = await call(`${v}/identity-resolutions`)
      if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
      const rulesets = parseRulesets(res.data?.identityResolutions)
      return Promise.all(rulesets.map(async (r) => {
        const one = r.recordId ? await call(`${v}/identity-resolutions/${r.recordId}`) : null
        return rulesetHealth(r, one?.ok ? one.data : {})
      }))
    }),
    section('Calculated insights', async () => (await insightPages(call, version)).map(insightHealth)),
    section('Segments', async () => (await loadSegments(call, version)).map((s) => segmentHealth(s, now))),
    section('Activations', async () => (await offsetPages(call, `${v}/activations`, 'activations')).map(activationHealth)),
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
    if (!s.items.length) { lines.push('None.', ''); continue }
    lines.push('| Status | Name | Why | Last run | Details |', '| --- | --- | --- | --- | --- |')
    for (const i of s.items) lines.push(`| ${LEVEL_TEXT[i.level]} | ${i.label} | ${i.reason} | ${i.lastRun || ''} | ${(i.details || '').replace(/\|/g, '\\|')} |`)
    lines.push('')
  }
  return lines.join('\n')
}
