// One calculated insight's definition (GET ssot/calculated-insights/<apiName>, checked on a
// live org): status, schedule, last run and errors, the SQL (`expression`, its own dialect:
// it does not always run as is in the query API) and dimensions and measures with formulas.

import { decodeHtml } from './segments.js'
import { lit } from './profile.js'

/** The API name to ask for: granularity variants (…__cio_DAY) are not valid API names. */
export function baseInsightName(name) {
  return String(name || '').replace(/__cio_[A-Z]+$/, '__cio')
}

export function normalizeInsight(d) {
  const field = (f) => ({
    name: f.apiName,
    label: f.displayName || f.apiName,
    role: (f.fieldRole || '').toLowerCase(),
    type: f.dataType || '',
    formula: decodeHtml(f.formula || ''),
    granularity: f.dateGranularity || '',
    aggregation: f.fieldAggregationType || '',
    source: f.dataSource?.sourceApiName || '',
  })
  return {
    name: d.apiName,
    label: d.displayName || d.apiName,
    description: d.description || '',
    status: d.calculatedInsightStatus || '',
    definitionStatus: d.definitionStatus || '',
    type: d.definitionType || '',
    enabled: d.isEnabled !== false,
    fromPackage: !!d.isFromPackage,
    dialect: d.queryDialect || '',
    schedule: d.publishScheduleInterval || '',
    scheduleStart: d.publishScheduleStartDateTime || '',
    lastRun: d.lastRunDateTime || '',
    lastRunStatus: d.lastRunStatus || '',
    lastRunError: d.lastRunStatusErrorCode || '',
    lastStatusError: d.lastCalcInsightStatusErrorCode || '',
    sql: decodeHtml(d.expression || ''),
    dimensions: (d.dimensions || []).map(field),
    measures: (d.measures || []).map(field),
  }
}

const cache = new Map()
export async function loadInsight(call, version, name) {
  const api = baseInsightName(name)
  const key = `${call.dataSpace || ''}|${api}`
  if (cache.has(key)) return cache.get(key)
  const res = await call(`/services/data/v${version}/ssot/calculated-insights/${encodeURIComponent(api)}`)
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
  const ci = normalizeInsight(res.data || {})
  cache.set(key, ci)
  return ci
}

/** Most values a Data tab filter takes (feedback #1040). */
export const FILTER_MAX = 1000

/**
 * SQL for the Data tab filtered to rows whose `column` is one of `values` (feedback #1040):
 * `{ sql, count }`, or `{ error }`. Numbers go in unquoted when the column is numeric and every
 * value is a number; everything else is quoted text.
 */
export function filterSql(table, column, values, { numeric = false, limit = 2000 } = {}) {
  if (!column) return { error: 'Pick a column.' }
  if (!values.length) return { error: 'Enter at least one value.' }
  if (values.length > FILTER_MAX) return { error: `At most ${FILTER_MAX.toLocaleString()} values at a time (${values.length.toLocaleString()} entered).` }
  const asNumbers = numeric && values.every((v) => /^-?\d+(\.\d+)?$/.test(v))
  const list = values.map((v) => (asNumbers ? v : lit(v))).join(', ')
  const where = values.length === 1 ? `${column} = ${list}` : `${column} IN (${list})`
  return { sql: `SELECT *\nFROM ${table}\nWHERE ${where}\nLIMIT ${limit}`, count: values.length }
}
