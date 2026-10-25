// Credit prediction (feedback #145): Data Cloud's own consumption data, read with SQL, and a
// forecast from the recent daily burn. Salesforce documents these objects only in part, so
// the objects are found by name and the fields are guessed from what the org has; the page
// lets the user change each guess.
//
// Known from Salesforce's "credit feedback loop" article (2026): TenantDailyEntitlementConsumption
// (utilizationdate__c, carddefinitiondevelopername__c, unitsconsumed__c = credits,
// usageconsumed__c = raw usage, unit__c, multiplier__c), TenantHourlyEntitlementConsumption
// (usagehourbucket__c, resourcetype__c, rowdetail__c = 'PROCESSED'), TenantBillingUsageEvent
// (EventTime__c, RootResourceType__c), TenantEntitlementTransaction (quantity__c per card).
// TenantUsageTypeMultiplier holds the multipliers (Multiplier__c, Unit__c).

export const ROLES = [
  { id: 'daily', label: 'Daily consumption', match: /tenantdailyentitlementconsumption/i, use: 'consumption' },
  { id: 'hourly', label: 'Hourly consumption', match: /tenanthourlyentitlementconsumption/i, use: 'consumption' },
  { id: 'events', label: 'Billing usage events', match: /tenantbillingusageevent/i, use: 'consumption' },
  { id: 'enriched', label: 'Enriched usage events', match: /tenantenrichedusageevent/i, use: 'consumption' },
  { id: 'entitlements', label: 'Entitlement transactions', match: /tenantentitlementtransaction/i, use: 'entitlement' },
  { id: 'multipliers', label: 'Usage type multipliers', match: /tenantusagetypemultiplier/i, use: 'reference' },
]

/** The consumption objects the org has, best source first: `[{ role, object }]`. */
export function findCreditObjects(objects = []) {
  const found = []
  for (const role of ROLES) {
    const hits = objects.filter((o) => role.match.test(o.name))
    // A DLO holds the raw rows; prefer it over a DMO of the same data
    hits.sort((a, b) => (a.kind === 'DLO' ? 0 : 1) - (b.kind === 'DLO' ? 0 : 1) || a.name.localeCompare(b.name))
    for (const object of hits) found.push({ role, object })
  }
  return found
}

const DATE_TYPES = /date|time/i
const NUMBER_TYPES = /number|decimal|double|int|currency|percent|long|float/i

const CANDIDATES = {
  date: ['utilizationdate', 'usagehourbucket', 'eventtime', 'usagedate', 'transactiondate', 'effectivedate', 'startdate', 'activitydate', 'createddate'],
  amount: ['unitsconsumed', 'creditsconsumed', 'consumedunits', 'credits', 'usageconsumed', 'usagevalue', 'quantity', 'amount', 'value'],
  group: ['carddefinitiondevelopername', 'carddefinition', 'usagetype', 'eventtype', 'resourcetype', 'rootresourcetype', 'producttype', 'unit'],
  status: ['rowdetail'],
}

const bare = (name) => String(name || '').toLowerCase().replace(/^ssot__/, '').replace(/__c$/, '').replace(/_/g, '')
const typeOf = (f) => `${f.businessType || ''} ${f.type || ''}`

/** The field for `what` (date, amount, group, status) by known names, then by type. */
export function guessField(object, what) {
  const fields = object?.fields || []
  for (const c of CANDIDATES[what] || []) {
    const hit = fields.find((f) => bare(f.name) === c) || fields.find((f) => bare(f.name).includes(c))
    if (hit) return hit.name
  }
  if (what === 'date') return fields.find((f) => DATE_TYPES.test(typeOf(f)) && !/^(datasource|internal)/i.test(bare(f.name)))?.name || ''
  if (what === 'amount') return fields.find((f) => NUMBER_TYPES.test(typeOf(f)))?.name || ''
  return ''
}

export function guessFields(object) {
  return { date: guessField(object, 'date'), amount: guessField(object, 'amount'), group: guessField(object, 'group'), status: guessField(object, 'status') }
}

const ISO = (d) => d.toISOString().slice(0, 10)
export function cutoffDate(days, now = new Date()) {
  return ISO(new Date(now.getTime() - days * 86400000))
}

// Hourly rows are counted once processed (Salesforce: filter rowdetail__c = 'PROCESSED')
const processed = (f) => (f.status ? ` AND ${f.status} = 'PROCESSED'` : '')

/** Daily totals per group since `days` ago. Columns: day, grp, total. */
export function dailySql(objectName, f, { days = 180, now = new Date() } = {}) {
  const grp = f.group ? f.group : `'all'`
  return [
    `SELECT DATE_TRUNC('day', ${f.date}) AS day, ${grp} AS grp, SUM(${f.amount}) AS total`,
    `FROM ${objectName}`,
    `WHERE ${f.date} >= CAST('${cutoffDate(days, now)} 00:00:00' AS timestamp)${processed(f)}`,
    `GROUP BY 1, 2`,
    `ORDER BY 1`,
  ].join('\n')
}

/** Totals per group over all the rows (consumed to date). Columns: grp, total, first_day, last_day. */
export function totalsSql(objectName, f) {
  const grp = f.group ? f.group : `'all'`
  return [
    `SELECT ${grp} AS grp, SUM(${f.amount}) AS total${f.date ? `, MIN(${f.date}) AS first_day, MAX(${f.date}) AS last_day` : ''}`,
    `FROM ${objectName}`,
    f.status ? `WHERE ${f.status} = 'PROCESSED'` : '',
    `GROUP BY 1`,
    `ORDER BY 2 DESC`,
  ].filter(Boolean).join('\n')
}

const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0)
const dayKey = (v) => (v == null ? '' : String(v).slice(0, 10))

/** Query rows [day, grp, total] into a daily series (every day filled) and per-group totals. */
export function shapeDaily(rows = [], { days = 180, now = new Date() } = {}) {
  const byDay = new Map()
  const byGroup = new Map()
  for (const [day, grp, total] of rows) {
    const k = dayKey(day)
    if (!k) continue
    byDay.set(k, (byDay.get(k) || 0) + num(total))
    const g = grp == null || grp === '' ? '(none)' : String(grp)
    byGroup.set(g, (byGroup.get(g) || 0) + num(total))
  }
  const series = []
  const start = new Date(`${cutoffDate(days, now)}T00:00:00Z`)
  const end = new Date(`${ISO(now)}T00:00:00Z`)
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) series.push({ day: ISO(d), total: byDay.get(ISO(d)) || 0 })
  const groups = [...byGroup.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)
  return { series, groups }
}

const sum = (list) => list.reduce((n, x) => n + x, 0)

/**
 * The forecast: average daily use over the last 7 and 30 days, a straight-line trend over the
 * last `fitDays` days (least squares), and projections. Today's partial day is left out.
 * `remaining`: credits left, when known, for the day they run out at the 30-day rate.
 */
export function forecast(series = [], { fitDays = 90, horizon = 90, remaining = null, now = new Date() } = {}) {
  const today = ISO(now)
  const past = series.filter((p) => p.day < today)
  const tail = (n) => past.slice(-n).map((p) => p.total)
  const avg7 = past.length ? sum(tail(7)) / Math.min(7, past.length) : 0
  const avg30 = past.length ? sum(tail(30)) / Math.min(30, past.length) : 0
  const fit = past.slice(-fitDays)
  let slope = 0
  let intercept = avg30
  if (fit.length >= 2) {
    const n = fit.length
    const xs = fit.map((_, i) => i)
    const ys = fit.map((p) => p.total)
    const mx = sum(xs) / n
    const my = sum(ys) / n
    const sxx = sum(xs.map((x) => (x - mx) ** 2))
    slope = sxx ? sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sxx : 0
    intercept = my - slope * mx
  }
  const base = fit.length
  const projected = []
  const last = past.length ? new Date(`${past[past.length - 1].day}T00:00:00Z`) : new Date(`${today}T00:00:00Z`)
  for (let i = 1; i <= horizon; i++) {
    const day = ISO(new Date(last.getTime() + i * 86400000))
    projected.push({ day, total: Math.max(0, intercept + slope * (base - 1 + i)) })
  }
  const next = (n) => sum(projected.slice(0, n).map((p) => p.total))
  const monthEnd = ISO(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)))
  const yearEnd = `${now.getUTCFullYear()}-12-31`
  const until = (end) => sum(projected.filter((p) => p.day <= end).map((p) => p.total))
  const runOutDays = remaining != null && avg30 > 0 ? Math.floor(remaining / avg30) : null
  return {
    avg7, avg30, slope,
    trend: Math.abs(slope) < avg30 * 0.001 ? 'flat' : slope > 0 ? 'rising' : 'falling',
    last30: sum(tail(30)),
    next30: next(30), next90: next(90),
    toMonthEnd: until(monthEnd), toYearEnd: until(yearEnd),
    runOutDays,
    runOutDate: runOutDays != null ? ISO(new Date(now.getTime() + runOutDays * 86400000)) : null,
    projected,
  }
}

/** Purchased minus consumed per group, when both sides name the same groups. */
export function balances(entitlements = [], consumed = []) {
  const used = new Map(consumed.map((g) => [g.name, g.total]))
  return entitlements.map((e) => ({ name: e.name, purchased: e.total, consumed: used.get(e.name) ?? null, remaining: used.has(e.name) ? e.total - used.get(e.name) : null }))
}
