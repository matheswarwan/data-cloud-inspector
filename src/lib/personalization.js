// Salesforce Personalization (on Data Cloud), read only.
// Setup comes from sObjects with SOQL (fields from their describe on a live org, API v68.0,
// 2026-10-22); activity from the ssot__PersonalizationLog__dlm DMO with Data Cloud SQL (queries
// validated on that org, which had no requests yet).

import { toObjects } from './profile.js'

export const LOG = 'ssot__PersonalizationLog__dlm'

export const SETUP_QUERIES = {
  points: 'SELECT Id, Name, DeveloperName, Status, Source, MaxItemsCount, IsAuthenticationRequired, PersonalizationSchemaId, PersonalizationSchemaEnum, AbnExperimentId, Description, LastModifiedDate, DataSpaceId FROM PersonalizationPoint ORDER BY Name',
  decisions: 'SELECT Id, Name, DeveloperName, PersonalizationPointId, PersonalizerId, State, Priority, ActiveAbnExperimentId, Description, DataSpaceId FROM PersonalizationDecision ORDER BY Priority',
  recommenders: 'SELECT Id, Name, Status, State, LatestRefreshedStatus, LastRefresh, LastSuccessfulRefresh, Goal, ObjectiveId, ScheduleFrequencyInMinutes, PersonalizationSchemaId, PersonalizationSchemaEnum, IsRemote, Description, DataSpaceId FROM PersonalizationRecommender ORDER BY Name',
  experiments: 'SELECT Id, Name, DeveloperName, Status, State, StartedDate, StoppedDate, WinnerSelectionMode, WinnerSelectionOutcome, LastAnalyzed, MinimumDurationInMinutes, MaximumDurationInMinutes, Description, DataSpaceId FROM AbnExperiment ORDER BY Name',
  experimentDecisions: 'SELECT AbnExperimentId, PersonalizationDecisionId, ExperimentStatus, ExperimentState FROM AbnExperimentPersnlDcsn',
  schemas: 'SELECT Id, Name, DeveloperName, PersonalizationType, Description, DataSpaceId FROM PersonalizationSchema ORDER BY Name',
  objectives: 'SELECT Id, Name, DeveloperName, Description, DataSpaceId FROM PersonalizationObjective ORDER BY Name',
}

async function soqlAll(call, version, query) {
  const records = []
  let path = `/services/data/v${version}/query?q=${encodeURIComponent(query)}`
  for (let i = 0; path && i < 20; i++) {
    const res = await call(path)
    if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
    records.push(...(res.data?.records || []).map(({ attributes, ...r }) => r))
    path = res.data?.nextRecordsUrl || null
  }
  return records
}

/** `{ points, decisions, recommenders, experiments, experimentDecisions, schemas, objectives, errors }` */
export async function loadSetup(call, version) {
  const keys = Object.keys(SETUP_QUERIES)
  const results = await Promise.all(keys.map((k) => soqlAll(call, version, SETUP_QUERIES[k]).then((r) => ({ r }), (e) => ({ e: e.message }))))
  const out = { errors: {} }
  // Records name their data space by record ID; keep the selected one (and those with none).
  const id15 = String(call.dataSpaceId || '').slice(0, 15)
  const keep = (r) => !id15 || !r.DataSpaceId || r.DataSpaceId.slice(0, 15) === id15
  keys.forEach((k, i) => {
    out[k] = (results[i].r || []).filter(keep)
    if (results[i].e) out.errors[k] = results[i].e
  })
  return out
}

/** Record IDs come as 18 characters from SOQL and may be 15 in Data Cloud: index both. */
export function byId(list) {
  const m = new Map()
  for (const r of list || []) if (r.Id) { m.set(r.Id, r); m.set(r.Id.slice(0, 15), r) }
  return m
}

/** Points with their decisions (by priority), schema and experiment names. */
export function pointTree(setup) {
  const schemas = byId(setup.schemas)
  const recs = byId(setup.recommenders)
  const exps = byId(setup.experiments)
  return (setup.points || []).map((p) => ({
    ...p,
    schemaName: schemas.get(p.PersonalizationSchemaId)?.Name || p.PersonalizationSchemaEnum || '',
    experimentName: exps.get(p.AbnExperimentId)?.Name || '',
    decisions: (setup.decisions || [])
      .filter((d) => d.PersonalizationPointId && (d.PersonalizationPointId === p.Id || d.PersonalizationPointId.slice(0, 15) === p.Id.slice(0, 15)))
      .sort((a, b) => (a.Priority ?? 999) - (b.Priority ?? 999))
      .map((d) => ({ ...d, personalizerName: recs.get(d.PersonalizerId)?.Name || '', experimentName: exps.get(d.ActiveAbnExperimentId)?.Name || '' })),
  }))
}

export function experimentTree(setup) {
  const decisions = byId(setup.decisions)
  return (setup.experiments || []).map((e) => ({
    ...e,
    decisions: (setup.experimentDecisions || [])
      .filter((x) => x.AbnExperimentId && x.AbnExperimentId.slice(0, 15) === e.Id.slice(0, 15))
      .map((x) => ({ ...x, decisionName: decisions.get(x.PersonalizationDecisionId)?.Name || x.PersonalizationDecisionId })),
  }))
}

export const ACTIVITY_SQL = {
  daily: (days) => `SELECT CAST(ssot__RequestDateTime__c AS DATE) AS day, COUNT(*) AS requests, COUNT(DISTINCT ssot__IndividualId__c) AS people, AVG(ssot__ResponseTimeMillisecond__c) AS avg_ms FROM ${LOG} WHERE ssot__RequestDateTime__c >= CURRENT_TIMESTAMP - INTERVAL '${days}' DAY GROUP BY 1 ORDER BY 1`,
  byStatus: (days) => `SELECT ssot__StatusCode__c AS status, COUNT(*) AS n FROM ${LOG} WHERE ssot__RequestDateTime__c >= CURRENT_TIMESTAMP - INTERVAL '${days}' DAY GROUP BY 1 ORDER BY 2 DESC`,
  byDecision: (days) => `SELECT ssot__PersonalizationPointId__c AS point, ssot__PersonalizationDecisionId__c AS decision, ssot__PersonalizerId__c AS personalizer, COUNT(*) AS requests, COUNT(DISTINCT ssot__IndividualId__c) AS people FROM ${LOG} WHERE ssot__RequestDateTime__c >= CURRENT_TIMESTAMP - INTERVAL '${days}' DAY GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 50`,
  recent: () => `SELECT ssot__RequestDateTime__c AS at, ssot__PersonalizationPointId__c AS point, ssot__PersonalizationDecisionId__c AS decision, ssot__PersonalizerId__c AS personalizer, ssot__IndividualId__c AS individual, ssot__StatusCode__c AS status, ssot__ResponseTimeMillisecond__c AS ms, ssot__PersnlRequestChannel__c AS channel, ssot__ContentObjectLabelText__c AS content, ssot__ContentItemsQuantity__c AS items FROM ${LOG} ORDER BY ssot__RequestDateTime__c DESC LIMIT 50`,
}

/** `{ daily, byStatus, byDecision, recent, errors }` for the last `days` days. */
export async function loadActivity(q, { days = 30 } = {}) {
  const keys = Object.keys(ACTIVITY_SQL)
  const results = await Promise.all(keys.map((k) => q(ACTIVITY_SQL[k](days)).then((r) => ({ r: toObjects(r) }), (e) => ({ e: e.message }))))
  const out = { errors: {} }
  keys.forEach((k, i) => {
    out[k] = results[i].r || []
    if (results[i].e) out.errors[k] = results[i].e
  })
  return out
}

/** Names for IDs in the log, from the setup. */
export function nameOf(setup, id) {
  if (!id) return ''
  for (const list of [setup?.points, setup?.decisions, setup?.recommenders]) {
    const hit = (list || []).find((r) => r.Id === id || r.Id?.slice(0, 15) === String(id).slice(0, 15))
    if (hit) return hit.Name
  }
  return id
}

const NOT_SUPPORTED = /INVALID_TYPE|sObject type '[^']*' is not supported/i
const NO_TABLE = /table "?[^"\s]*"? does not exist/i

/**
 * Whether Personalization is there at all (feedback #114). An org without it answers every setup
 * query with "sObject type ... is not supported" and every log query with "table ... does not
 * exist"; those become one plain message, with the errors kept as details.
 */
export function personalizationStatus(setup, activity) {
  const setupErrors = Object.entries(setup?.errors || {})
  const logErrors = Object.entries(activity?.errors || {})
  const anyRecords = ['points', 'decisions', 'recommenders', 'experiments', 'schemas', 'objectives'].some((k) => setup?.[k]?.length)
  const setupMissing = setupErrors.length > 0 && !anyRecords && setupErrors.every(([, e]) => NOT_SUPPORTED.test(String(e)))
  const logMissing = logErrors.length > 0 && logErrors.every(([, e]) => NO_TABLE.test(String(e)))
  const details = [
    ...(setupMissing ? setupErrors.map(([k, e]) => ({ area: k, error: String(e) })) : []),
    ...(logMissing ? logErrors.map(([k, e]) => ({ area: `log: ${k}`, error: String(e) })) : []),
  ]
  return { setupMissing, logMissing, details }
}
