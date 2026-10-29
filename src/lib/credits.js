// Credit prediction (feedback #145): Data Cloud's own consumption data, read with SQL, and a
// forecast from the recent daily burn. The objects are found by name and the fields guessed
// from what the org has (known names first); the page lets the user change each guess.
//
// Field names from Salesforce Help's Digital Wallet DLO references (wallet_tdec, wallet_thec,
// wallet_teue, wallet_tbue, wallet_tet; checked 2026-10-25):
// - TenantDailyEntitlementConsumption: utilizationdate__c, carddefinitiondevelopername__c,
//   unitsconsumed__c (credits), usageconsumed__c (raw), usagebusinessenvtype__c.
// - TenantHourlyEntitlementConsumption: usagehourbucket__c, unitsconsumed__c, rowdetail__c
//   (count 'PROCESSED' only), businessenvtype__c, UsageReportingOrgId__c.
// - TenantEnrichedUsageEvent: eventtime__c, cardname__c, unitsconsumed__c,
//   usagebusinessenvtype__c, usagereportingorgid__c.
// - TenantBillingUsageEvent: EventTime__c, UsageValue__c (raw usage, no credits), businessenvtype__c.
// - TenantEntitlementTransaction: quantity__c per entitlementcarddefdevlname__c.
// The environment field (Production, Sandbox or Scratch) splits the figures (feedback 2026-10-25):
// the objects exist only in production but hold the sandboxes' usage too, which draws on the
// production cards. Usage Reporting Org ID names the org (production, sandbox or companion).
// Digital Wallet setup creates the streams and DLOs; they must be in a data space to be queried.

export const ROLES = [
  { id: 'daily', label: 'Daily consumption', match: /tenantdailyentitlementconsumption/i, use: 'consumption' },
  { id: 'hourly', label: 'Hourly consumption', match: /tenanthourlyentitlementconsumption/i, use: 'consumption' },
  { id: 'enriched', label: 'Enriched usage events', match: /tenantenrichedusageevent/i, use: 'consumption' },
  { id: 'events', label: 'Billing usage events (raw usage, not credits)', match: /tenantbillingusageevent/i, use: 'consumption', raw: true },
  { id: 'entitlements', label: 'Entitlement transactions', match: /tenantentitlementtransaction/i, use: 'entitlement' },
  { id: 'multipliers', label: 'Usage type multipliers', match: /tenantusagetypemultiplier/i, use: 'reference' },
]

// The DLOs Digital Wallet creates. The object list (catalog) is cached until Refresh, so
// DLOs added to the data space later were not seen (feedback #1011): when the catalog has
// none, each is probed with a one-row SQL read, which also proves SQL can read it.
export const WALLET_DLOS = ['TenantDailyEntitlementConsumption', 'TenantHourlyEntitlementConsumption', 'TenantEnrichedUsageEvent', 'TenantBillingUsageEvent', 'TenantEntitlementTransaction', 'TenantUsageTypeMultiplier']

/** `[{ name, label, kind: 'DLO', fields }]` for the Wallet DLOs SQL can read; `q(sql)` → `{ columns }`. */
export async function probeCreditObjects(q, names = WALLET_DLOS) {
  const results = await Promise.allSettled(names.map((n) => q(`SELECT * FROM ${n}__dll LIMIT 1`)))
  return results.flatMap((r, i) => (r.status === 'fulfilled'
    ? [{ name: `${names[i]}__dll`, label: names[i], kind: 'DLO', probed: true, fields: (r.value?.columns || []).map((c) => ({ name: c.name, type: c.type || '' })) }]
    : []))
}

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
  date: ['utilizationdate', 'usagehourbucket', 'eventtime', 'eventime', 'usagedate', 'transactiondate', 'effectivedate', 'startdate', 'activitydate', 'createddate'],
  amount: ['unitsconsumed', 'creditsconsumed', 'consumedunits', 'credits', 'usageconsumed', 'usagevalue', 'quantity', 'amount', 'value'],
  group: ['carddefinitiondevelopername', 'entitlementcarddefdevlname', 'cardname', 'carddefinition', 'usagetype', 'eventtype', 'resourcetype', 'rootresourcetype', 'producttype', 'unit'],
  status: ['rowdetail'],
  env: ['usagebusinessenvtype', 'businessenvtype'],
  org: ['usagereportingorgid'],
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
  const g = (what) => guessField(object, what)
  return { date: g('date'), amount: g('amount'), group: g('group'), status: g('status'), env: g('env'), org: g('org') }
}

const ISO = (d) => d.toISOString().slice(0, 10)
export function cutoffDate(days, now = new Date()) {
  return ISO(new Date(now.getTime() - days * 86400000))
}

// Hourly rows are counted once processed (Salesforce: filter rowdetail__c = 'PROCESSED')
const processed = (f) => (f.status ? ` AND ${f.status} = 'PROCESSED'` : '')

/** Daily totals per group and environment since `days` ago. Columns: day, grp, env, total. */
export function dailySql(objectName, f, { days = 180, now = new Date() } = {}) {
  return [
    `SELECT DATE_TRUNC('day', ${f.date}) AS day, ${f.group || `'all'`} AS grp, ${f.env || `''`} AS env, SUM(${f.amount}) AS total`,
    `FROM ${objectName}`,
    `WHERE ${f.date} >= CAST('${cutoffDate(days, now)} 00:00:00' AS timestamp)${processed(f)}`,
    `GROUP BY 1, 2, 3`,
    `ORDER BY 1`,
  ].join('\n')
}

/** Totals per group and environment over all the rows (consumed to date). Columns: grp, env, total, first_day, last_day. */
export function totalsSql(objectName, f) {
  return [
    `SELECT ${f.group || `'all'`} AS grp, ${f.env || `''`} AS env, SUM(${f.amount}) AS total${f.date ? `, MIN(${f.date}) AS first_day, MAX(${f.date}) AS last_day` : ''}`,
    `FROM ${objectName}`,
    f.status ? `WHERE ${f.status} = 'PROCESSED'` : '',
    `GROUP BY 1, 2`,
    `ORDER BY 3 DESC`,
  ].filter(Boolean).join('\n')
}

/** Totals per environment and org that used them (production, each sandbox). Columns: env, org, total, first_day, last_day. */
export function orgsSql(objectName, f) {
  return [
    `SELECT ${f.env || `''`} AS env, ${f.org} AS org, SUM(${f.amount}) AS total${f.date ? `, MIN(${f.date}) AS first_day, MAX(${f.date}) AS last_day` : ''}`,
    `FROM ${objectName}`,
    f.status ? `WHERE ${f.status} = 'PROCESSED'` : '',
    `GROUP BY 1, 2`,
    `ORDER BY 3 DESC`,
  ].filter(Boolean).join('\n')
}

const ENV_ORDER = ['Production', 'Sandbox', 'Scratch']
/** An environment value as shown: Production, Sandbox, Scratch, or "Not set". */
export function envName(v) {
  const t = v == null ? '' : String(v).trim()
  if (!t) return 'Not set'
  return ENV_ORDER.find((e) => e.toLowerCase() === t.toLowerCase()) || t
}
const envRank = (e) => (ENV_ORDER.includes(e) ? ENV_ORDER.indexOf(e) : ENV_ORDER.length)
export const sortEnvs = (list) => [...list].sort((a, b) => envRank(a) - envRank(b) || a.localeCompare(b))

const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0)
const dayKey = (v) => (v == null ? '' : String(v).slice(0, 10))

const ranked = (byGroup) => [...byGroup.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)

// Every day in the period; each day has its total and what used it (`groups`: card or usage
// type, most first; feedback #1042).
function fill(acc, days, now) {
  const series = []
  const start = new Date(`${cutoffDate(days, now)}T00:00:00Z`)
  const end = new Date(`${ISO(now)}T00:00:00Z`)
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    const k = ISO(d)
    series.push({ day: k, total: acc.byDay.get(k) || 0, groups: acc.byDayGroup.has(k) ? ranked(acc.byDayGroup.get(k)) : [] })
  }
  return series
}

/**
 * Query rows [day, grp, env, total] (or [day, grp, total]) into a daily series (every day
 * filled) and per-group totals, for all environments together and for each one in `envs`.
 */
export function shapeDaily(rows = [], { days = 180, now = new Date() } = {}) {
  const newAcc = () => ({ byDay: new Map(), byGroup: new Map(), byDayGroup: new Map() })
  const all = newAcc()
  const per = new Map()
  for (const row of rows) {
    const [day, grp, env, total] = row.length >= 4 ? row : [row[0], row[1], '', row[2]]
    const k = dayKey(day)
    if (!k) continue
    const e = envName(env)
    if (!per.has(e)) per.set(e, newAcc())
    const g = grp == null || grp === '' ? '(none)' : String(grp)
    for (const acc of [all, per.get(e)]) {
      acc.byDay.set(k, (acc.byDay.get(k) || 0) + num(total))
      acc.byGroup.set(g, (acc.byGroup.get(g) || 0) + num(total))
      if (!acc.byDayGroup.has(k)) acc.byDayGroup.set(k, new Map())
      const dg = acc.byDayGroup.get(k)
      dg.set(g, (dg.get(g) || 0) + num(total))
    }
  }
  const envs = {}
  for (const e of sortEnvs([...per.keys()])) envs[e] = { series: fill(per.get(e), days, now), groups: ranked(per.get(e).byGroup) }
  return { series: fill(all, days, now), groups: ranked(all.byGroup), envs }
}

/** Totals rows [grp, env, total, first, last] into per-group totals, with each environment's share. */
export function shapeTotals(rows = []) {
  const byGroup = new Map()
  for (const [grp, env, total, first, last] of rows) {
    const name = grp == null || grp === '' ? '(none)' : String(grp)
    const g = byGroup.get(name) || { name, total: 0, first: '', last: '', envs: {} }
    const t = num(total)
    g.total += t
    const e = envName(env)
    g.envs[e] = (g.envs[e] || 0) + t
    if (first && (!g.first || String(first) < String(g.first))) g.first = first
    if (last && String(last) > String(g.last)) g.last = last
    byGroup.set(name, g)
  }
  return [...byGroup.values()].sort((a, b) => b.total - a.total)
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

// ---- money (feedback #1042) ----
// Salesforce does not expose what a credit costs, so the price comes from the user (their
// contract), kept per org in this browser. The usage type multipliers (TenantUsageTypeMultiplier,
// the rate card that turns usage into credits) are read as they are.

const PRICE_KEY = (orgId) => `dci_credit_price_${String(orgId || '').slice(0, 15)}`

/** `{ price, currency }` saved for an org, or null. */
export function creditPrice(orgId) {
  try {
    const v = JSON.parse(localStorage.getItem(PRICE_KEY(orgId)) || 'null')
    return v && Number(v.price) > 0 ? { price: Number(v.price), currency: String(v.currency || 'USD') } : null
  } catch { return null }
}

export function setCreditPrice(orgId, price, currency = 'USD') {
  try {
    if (Number(price) > 0) localStorage.setItem(PRICE_KEY(orgId), JSON.stringify({ price: Number(price), currency }))
    else localStorage.removeItem(PRICE_KEY(orgId))
  } catch { /* private window */ }
}

/** Credits as money text ("$1,234"), or '' without a price. Small amounts keep cents. */
export function moneyText(credits, p) {
  if (!p || credits == null || !Number.isFinite(Number(credits))) return ''
  const v = Number(credits) * p.price
  try {
    return v.toLocaleString(undefined, { style: 'currency', currency: p.currency, maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 })
  } catch {
    return `${p.currency} ${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }
}

/** The usage type multipliers, as stored. */
export function multipliersSql(objectName) {
  return `SELECT *\nFROM ${objectName}\nLIMIT 500`
}
