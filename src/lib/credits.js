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
// Field lists confirmed on a production org (feedback #1047 to #1053, 2026-10-29):
// - TenantEnrichedUsageEvent: eventtime__c, unitsconsumed__c (credits), usagevalue__c,
//   resourcetype__c, resourceidorapiname__c, rootresourcetype__c, rootresourceidorapiname__c,
//   usagetypedevelopername__c, carddefinitiondevelopername__c, cardname__c, multiplier__c,
//   usagebusinessenvtype__c, usagereportingorgid__c. Credits per resource come from here.
// - TenantBillingUsageEvent: EventTime__c, UsageValue__c (raw usage), ResourceIdOrApiName__c,
//   ResourceType__c, UsageQualifiedName__c, BusinessEnvType__c (no credits).
// - TenantHourlyEntitlementConsumption: usagehourbucket__c, unitsconsumed__c, resourcetype__c,
//   resourceidorapiname__c, usagetypedevelopername__c, rowdetail__c, businessenvtype__c.
// - TenantEntitlementTransaction: quantity__c, entitlementcarddefdevlname__c, startdate__c, enddate__c.
// - TenantUsageTypeMultiplier: multiplier__c and tier2..5 multipliers per usagetypedef__c.

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
  // Day-of-week pattern (feedback #1058): how far each weekday usually sits above or below the
  // trend line, from at least four weeks of history, averaging 1 so the totals stay the same.
  const weekday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay()
  const trendAt = (x) => intercept + slope * x
  let factors = null
  if (fit.length >= 28) {
    const sums = Array(7).fill(0)
    const counts = Array(7).fill(0)
    fit.forEach((p, i) => { const t = trendAt(i); if (t > 0) { sums[weekday(p.day)] += p.total / t; counts[weekday(p.day)]++ } })
    if (counts.every((c) => c > 0)) {
      const raw = sums.map((x, w) => x / counts[w])
      const mean = sum(raw) / 7
      if (mean > 0) factors = raw.map((x) => x / mean)
    }
  }
  const projected = []
  const last = past.length ? new Date(`${past[past.length - 1].day}T00:00:00Z`) : new Date(`${today}T00:00:00Z`)
  for (let i = 1; i <= horizon; i++) {
    const day = ISO(new Date(last.getTime() + i * 86400000))
    const t = Math.max(0, trendAt(base - 1 + i))
    projected.push({ day, total: factors ? t * factors[weekday(day)] : t })
  }
  const next = (n) => sum(projected.slice(0, n).map((p) => p.total))
  const monthEnd = ISO(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)))
  const yearEnd = `${now.getUTCFullYear()}-12-31`
  const until = (end) => sum(projected.filter((p) => p.day <= end).map((p) => p.total))
  const runOutDays = remaining != null && avg30 > 0 ? Math.floor(remaining / avg30) : null
  return {
    avg7, avg30, slope, weekly: !!factors,
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

// ---- resources (feedback #1046) ----
// Which data stream, data transform, segment or other resource used the credits: summed from
// the enriched usage events, which carry the credits (unitsconsumed__c) per resource.

const RES_CANDIDATES = {
  date: ['eventtime', 'usagehourbucket'],
  amount: ['unitsconsumed'],
  type: ['resourcetype'],
  name: ['resourceidorapiname'],
  usage: ['usagetypedevelopername', 'usagequalifiedname'],
  card: ['carddefinitiondevelopername', 'cardname'],
  env: ['usagebusinessenvtype', 'businessenvtype'],
}
const exact = (object, list) => (object?.fields || []).find((f) => list.includes(bare(f.name)))?.name || ''

/** The object and fields to sum credits per resource from, or null when the org has none. */
export function resourceSource(objects = []) {
  const found = findCreditObjects(objects)
  for (const id of ['enriched', 'hourly']) {
    const object = found.find((x) => x.role.id === id)?.object
    if (!object) continue
    const f = Object.fromEntries(Object.entries(RES_CANDIDATES).map(([k, list]) => [k, exact(object, list)]))
    if (f.date && f.amount && f.type && f.name) return { object: object.name, fields: { ...f, status: id === 'hourly' ? exact(object, ['rowdetail']) : '' } }
  }
  return null
}

/** Credits per resource over the period. Columns: type, name, usage, card, env, credits. */
export function resourcesSql(src, { days = 180, now = new Date() } = {}) {
  const f = src.fields
  return [
    `SELECT ${f.type} AS type, ${f.name} AS name, ${f.usage || `''`} AS usage, ${f.card || `''`} AS card, ${f.env || `''`} AS env, SUM(${f.amount}) AS credits`,
    `FROM ${src.object}`,
    `WHERE ${f.date} >= CAST('${cutoffDate(days, now)} 00:00:00' AS timestamp)${processed(f)}`,
    `GROUP BY 1, 2, 3, 4, 5`,
    `ORDER BY 6 DESC`,
    `LIMIT 5000`,
  ].join('\n')
}

/** Credits per resource and day over the last `days` (the chart's hover). Columns: day, type, name, env, credits. */
export function resourceDaysSql(src, { days = 90, now = new Date() } = {}) {
  const f = src.fields
  return [
    `SELECT DATE_TRUNC('day', ${f.date}) AS day, ${f.type} AS type, ${f.name} AS name, ${f.env || `''`} AS env, SUM(${f.amount}) AS credits`,
    `FROM ${src.object}`,
    `WHERE ${f.date} >= CAST('${cutoffDate(days, now)} 00:00:00' AS timestamp)${processed(f)}`,
    `GROUP BY 1, 2, 3, 4`,
  ].join('\n')
}

/** Credits per card and resource type over all the rows (used to date, feedback #1054). Columns: card, type, credits. */
export function cardTypesSql(src) {
  const f = src.fields
  return [
    `SELECT ${f.card || `''`} AS card, ${f.type} AS type, SUM(${f.amount}) AS credits`,
    `FROM ${src.object}`,
    f.status ? `WHERE ${f.status} = 'PROCESSED'` : '',
    `GROUP BY 1, 2`,
  ].filter(Boolean).join('\n')
}

/** Rows [card, type, credits] into `{ [card]: [{ type, credits }] }`, most first. */
export function shapeCardTypes(rows = []) {
  const by = {}
  for (const [card, type, credits] of rows) {
    const list = (by[card || '(none)'] ||= [])
    const t = type || '(none)'
    const hit = list.find((x) => x.type === t)
    if (hit) hit.credits += num(credits)
    else list.push({ type: t, credits: num(credits) })
  }
  for (const list of Object.values(by)) list.sort((a, b) => b.credits - a.credits)
  return by
}

/**
 * One row per card for the card view (feedback #1054): purchased, used to date, left and the
 * share used, for cards bought or used; most used first.
 */
export function cardRows(entitlements = [], consumed = []) {
  const out = new Map()
  for (const e of entitlements || []) out.set(e.name, { name: e.name, purchased: e.total, used: 0 })
  for (const g of consumed || []) {
    const r = out.get(g.name) || { name: g.name, purchased: null, used: 0 }
    r.used += g.total
    out.set(g.name, r)
  }
  return [...out.values()].map((r) => ({
    ...r,
    left: r.purchased == null ? null : r.purchased - r.used,
    share: r.purchased ? r.used / r.purchased : null,
  })).sort((a, b) => b.used - a.used || (b.purchased || 0) - (a.purchased || 0))
}

/** Rows [type, name, usage, card, env, credits] into resources, most credits first, with each environment's share. */
export function shapeResources(rows = []) {
  const by = new Map()
  for (const [type, name, usage, card, env, credits] of rows) {
    const key = `${type}|${name}`
    const r = by.get(key) || { key, type: type || '(none)', name: name || '(none)', usages: new Set(), cards: new Set(), envs: {}, credits: 0 }
    const c = num(credits)
    r.credits += c
    if (usage) r.usages.add(String(usage))
    if (card) r.cards.add(String(card))
    const e = envName(env)
    r.envs[e] = (r.envs[e] || 0) + c
    by.set(key, r)
  }
  return [...by.values()].map((r) => ({ ...r, usages: [...r.usages], cards: [...r.cards] })).sort((a, b) => b.credits - a.credits)
}

/**
 * Rows [day, type, name, env, credits] into `{ [day]: { [env]: [{ type, name, credits }] } }`, the
 * top `keep` per day and environment (the rest summed as "Other"), small enough to store.
 */
export function shapeResourceDays(rows = [], { keep = 40 } = {}) {
  const by = {}
  for (const [day, type, name, env, credits] of rows) {
    const k = dayKey(day)
    if (!k) continue
    const e = envName(env)
    ;((by[k] ||= {})[e] ||= []).push({ type: type || '(none)', name: name || '(none)', credits: num(credits) })
  }
  for (const envs of Object.values(by)) {
    for (const [e, list] of Object.entries(envs)) {
      list.sort((a, b) => b.credits - a.credits)
      const rest = list.slice(keep).reduce((n, x) => n + x.credits, 0)
      envs[e] = rest ? [...list.slice(0, keep), { type: '', name: `${list.length - keep} other resources`, credits: rest, other: true }] : list
    }
  }
  return by
}

/** One day's resources for an environment, or every environment together ('all'). */
export function resourcesForDay(byDay, day, env = 'all') {
  const envs = byDay?.[day]
  if (!envs) return []
  if (env !== 'all') return envs[env] || []
  const merged = new Map()
  for (const list of Object.values(envs)) {
    for (const r of list) {
      const k = r.other ? 'other' : `${r.type}|${r.name}`
      const m = merged.get(k) || { ...r, credits: 0 }
      m.credits += r.credits
      merged.set(k, m)
    }
  }
  const out = [...merged.values()].sort((a, b) => (a.other ? 1 : 0) - (b.other ? 1 : 0) || b.credits - a.credits)
  return out
}

// ---- numbers people read (feedback #1046) ----

const UNITS = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]

/** "~512 million", "~3.5 million", "~84 thousand", "843"; exact value under 1,000. */
export function approx(v) {
  if (v == null || v === '' || !Number.isFinite(Number(v))) return '—'
  const n = Number(v)
  const a = Math.abs(n)
  for (const [size, word] of UNITS) {
    if (a >= size) {
      const x = a / size
      const t = x >= 100 ? String(Math.round(x)) : String(Math.round(x * 10) / 10)
      return `${n < 0 ? '−' : ''}~${t} ${word}`
    }
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: a < 10 ? 2 : 0 })
}

// ---- money (feedback #1042) ----
// Salesforce does not expose what a credit costs, so the price comes from the user (their
// contract), kept per org in this browser.

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

/** Credits as money text ("$1,234", "~$12.3 million"), or '' without a price. Small amounts keep cents. */
export function moneyText(credits, p) {
  if (!p || credits == null || !Number.isFinite(Number(credits))) return ''
  const v = Number(credits) * p.price
  if (Math.abs(v) >= 1e6) {
    let sym = `${p.currency} `
    try { sym = new Intl.NumberFormat(undefined, { style: 'currency', currency: p.currency }).formatToParts(0).find((x) => x.type === 'currency')?.value || sym } catch { /* unknown code */ }
    return `${v < 0 ? '−' : ''}~${sym}${approx(Math.abs(v)).slice(1)}`
  }
  try {
    return v.toLocaleString(undefined, { style: 'currency', currency: p.currency, maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 })
  } catch {
    return `${p.currency} ${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }
}
