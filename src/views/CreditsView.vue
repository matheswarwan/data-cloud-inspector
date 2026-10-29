<script setup>
import PageHeader from '../components/PageHeader.vue'
// Credit prediction (feedback #145): how many Data Cloud credits the org used, per card or
// usage type, and a forecast from the recent daily burn. Reads the org's own consumption
// objects (Tenant...) with SQL, only when asked: each read is a query, which itself uses a
// few credits. The field guesses can be changed; nothing is written. The objects live in
// production but count sandbox usage too, so every figure can be split by environment and
// by the org that used it. Without the objects, the page says how to turn them on.
import { ref, computed, watch, onMounted } from 'vue'
import { Activity, AlertTriangle, CalendarRange, Check, Copy, Info, Layers, RefreshCw, TrendingUp, Wallet, X } from 'lucide-vue-next'
import HelpTip from '../components/HelpTip.vue'
import Loading from '../components/Loading.vue'
import DataTable from '../components/DataTable.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import SqlBlock from '../components/SqlBlock.vue'
import { useOrg, currentOrg, orgName, orgTitle } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { findCreditObjects, probeCreditObjects, guessFields, dailySql, totalsSql, orgsSql, shapeDaily, shapeTotals, sortEnvs, envName, forecast, balances, creditPrice, setCreditPrice, moneyText, approx, resourceSource, resourcesSql, resourceDaysSql, shapeResources, shapeResourceDays, resourcesForDay, cardTypesSql, shapeCardTypes, cardRows, cardInfo, shortNum, niceTicks, cardGrid, creditAlerts, topResources } from '../lib/credits.js'
import { cacheGet, cacheSet, orgCached } from '../lib/store.js'
import { metadataTtl } from '../lib/cacheAge.js'

const org = useOrg()
const catalog = useCatalog()
onMounted(() => ensureCatalog())

// Objects from the catalog, plus Wallet DLOs found by a SQL probe when the (cached) catalog
// has none (feedback #1011).
const probed = ref([])
const probing = ref(false)
const probedKey = ref('')
const objects = computed(() => [...catalog.objects, ...probed.value.filter((p) => !catalog.objects.some((o) => o.name === p.name))])
const found = computed(() => findCreditObjects(objects.value))
// The probe's answer is kept in this browser (feedback #1046: no queries when the page opens);
// Check again reads it fresh.
async function probe({ refresh = false } = {}) {
  const key = `${org.orgId}|${org.dataSpace}`
  probing.value = true
  try {
    const list = await orgCached(`dci_s_${org.orgId}_${org.dataSpace || 'default'}_creditObjects`, metadataTtl(),
      () => probeCreditObjects((sql) => runQuery(orgCall(), org.version, sql, { rowLimit: 1 })), { refresh })
    if (key === `${org.orgId}|${org.dataSpace}`) { probed.value = list; probedKey.value = key }
  } finally { probing.value = false }
}
watch([() => catalog.loading, () => org.orgId, () => org.dataSpace, () => org.version], () => {
  const key = `${org.orgId}|${org.dataSpace}`
  if (probedKey.value && probedKey.value !== key) probed.value = []
  if (org.version && !catalog.loading && !probing.value && probedKey.value !== key && !findCreditObjects(catalog.objects).some((x) => x.role.use === 'consumption')) probe()
}, { immediate: true })
// "Check again": the object list read fresh, then the probe.
async function checkAgain() {
  probedKey.value = ''
  await ensureCatalog({ refresh: true })
  await probe({ refresh: true })
}
const sources = computed(() => found.value.filter((x) => x.role.use === 'consumption'))
const entSources = computed(() => found.value.filter((x) => x.role.use === 'entitlement'))
const sandbox = computed(() => /\.sandbox\./i.test(currentOrg()?.host || ''))

// Choices: the object and its fields (guessed, changeable), and how many days to read
const source = ref('')
const fields = ref({ date: '', amount: '', group: '', status: '', env: '', org: '' })
const ent = ref('')
const entFields = ref({ amount: '', group: '' })
const days = ref(180)
const objectOf = (name) => objects.value.find((o) => o.name === name)
watch(sources, (list) => { if (!list.some((x) => x.object.name === source.value)) source.value = list[0]?.object.name || '' }, { immediate: true })
watch(entSources, (list) => { if (!list.some((x) => x.object.name === ent.value)) ent.value = list[0]?.object.name || '' }, { immediate: true })
watch(source, (n) => { fields.value = guessFields(objectOf(n)) }, { immediate: true })
watch(ent, (n) => { const g = guessFields(objectOf(n)); entFields.value = { amount: g.amount, group: g.group } }, { immediate: true })
const fieldList = (name) => (objectOf(name)?.fields || []).map((f) => f.name)
const sourceRole = computed(() => sources.value.find((x) => x.object.name === source.value)?.role)
const missing = computed(() => ['daily', 'entitlements'].filter((id) => !found.value.some((x) => x.role.id === id)))

// Reading
const busy = ref(false)
const error = ref('')
const result = ref(null) // { series, groups, envs, consumedAll, byOrg, entitlements, at }
const sqlShown = ref(false)
const ready = computed(() => source.value && fields.value.date && fields.value.amount)
// Setup (feedback #1019, was "Found in this org"): folded once the object and fields are set.
const setupOpen = ref(false)
watch(() => !!ready.value, (r) => { if (!r) setupOpen.value = true }, { immediate: true })
const setupSummary = computed(() => (ready.value
  ? `${source.value} · credits ${fields.value.amount} by day of ${fields.value.date}${fields.value.group ? ` per ${fields.value.group}` : ''} · last ${days.value} days`
  : 'choose the object and fields'))
const sqlText = computed(() => {
  if (!ready.value) return ''
  const parts = [dailySql(source.value, fields.value, { days: days.value })]
  parts.push(totalsSql(source.value, fields.value))
  if (fields.value.org) parts.push(orgsSql(source.value, fields.value))
  if (ent.value && entFields.value.amount) parts.push(totalsSql(ent.value, { ...entFields.value, date: '', status: '' }))
  if (resSrc.value) parts.push(resourcesSql(resSrc.value, { days: days.value }), resourceDaysSql(resSrc.value), cardTypesSql(resSrc.value))
  return parts.join(';\n\n')
})

// Which resource (data stream, data transform, segment...) used the credits (feedback #1046),
// from the enriched usage events when the org has them.
const resSrc = computed(() => resourceSource(objects.value))
// The last reading is kept in this browser and shown when the page opens; Read again reads now.
const storeKey = () => `dci_s_${org.orgId}_${org.dataSpace || 'default'}_credits`
async function loadStored() {
  const key = storeKey()
  const hit = org.orgId ? await cacheGet(key) : null
  if (key === storeKey() && hit?.value && !result.value) result.value = { ...hit.value, at: new Date(hit.at) }
}

async function read() {
  if (!ready.value) return
  busy.value = true; error.value = ''; result.value = null
  const call = orgCall()
  try {
    const run = (sql) => runQuery(call, org.version, sql, { rowLimit: 5000 })
    const [d, all, o, e] = await Promise.all([
      run(dailySql(source.value, fields.value, { days: days.value })),
      run(totalsSql(source.value, fields.value)),
      fields.value.org ? run(orgsSql(source.value, fields.value)).catch((err) => ({ error: err.message })) : null,
      ent.value && entFields.value.amount ? run(totalsSql(ent.value, { ...entFields.value, date: '', status: '', env: '' })).catch((err) => ({ error: err.message })) : null,
    ])
    const rs = resSrc.value
    const [res, resDays, ct] = rs ? await Promise.all([
      runQuery(call, org.version, resourcesSql(rs, { days: days.value }), { rowLimit: 5000 }).catch((err) => ({ error: err.message })),
      runQuery(call, org.version, resourceDaysSql(rs), { rowLimit: 50000 }).catch((err) => ({ error: err.message })),
      runQuery(call, org.version, cardTypesSql(rs), { rowLimit: 5000 }).catch((err) => ({ error: err.message })),
    ]) : [null, null, null]
    const shaped = shapeDaily(d.rows, { days: days.value })
    const consumedAll = shapeTotals(all.rows)
    const byOrg = o?.rows ? o.rows.map(([env, id, total, first, last]) => ({ env: envName(env), id: id || '', total: Number(total) || 0, first: first || '', last: last || '' })) : null
    const entitlements = e?.rows ? shapeTotals(e.rows).map(({ name, total }) => ({ name, total })) : null
    result.value = { ...shaped, consumedAll, byOrg, orgError: o?.error || '', entitlements, entError: e?.error || '',
      resources: res?.rows ? shapeResources(res.rows) : null, resError: res?.error || resDays?.error || '', resourceDays: resDays?.rows ? shapeResourceDays(resDays.rows) : null, resObject: rs?.object || '', cardTypes: ct?.rows ? shapeCardTypes(ct.rows) : null,
      at: new Date() }
    cacheSet(storeKey(), { at: Date.now(), value: JSON.parse(JSON.stringify({ ...result.value, at: undefined })) })
    if (!(view.value in shaped.envs)) view.value = 'all'
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}
watch(() => [org.orgId, org.dataSpace], () => { result.value = null; error.value = ''; loadStored() }, { immediate: true })

// Environment: 'all' (one chart, bars split by environment) or one environment on its own
const view = ref('all')
const envList = computed(() => (result.value ? Object.keys(result.value.envs) : []))
const shown = computed(() => (result.value && view.value !== 'all' && result.value.envs[view.value]) || result.value)
const ENV_FILL = { Production: 'fill-primary', Sandbox: 'fill-amber-500', Scratch: 'fill-slate-400' }
const envFill = (e, ahead = false) => (ahead ? 'fill-primary/35' : ENV_FILL[e] || 'fill-sky-400')
const ENV_DOT = { Production: 'bg-primary', Sandbox: 'bg-amber-500', Scratch: 'bg-slate-400' }
const envDot = (e) => ENV_DOT[e] || 'bg-sky-400'

// The org that used the credits: "this org", a saved org's name, or the bare ID
const same = (a, b) => String(a || '').slice(0, 15) === String(b || '').slice(0, 15)
function orgShown(id) {
  if (!id) return '(not set)'
  if (same(id, org.orgId)) return `${orgName(org.orgId)} (this org)`
  const known = [...Object.keys(org.saved || {}), ...org.orgs.map((x) => x.orgId)].find((k) => same(k, id))
  return known ? orgName(known) : ''
}

// What is left: purchased minus consumed per card, when the two sides line up
const left = computed(() => (result.value?.entitlements ? balances(result.value.entitlements, result.value.consumedAll) : []))
const remainingTotal = computed(() => {
  const known = left.value.filter((b) => b.remaining != null)
  if (known.length && known.length === left.value.length) return known.reduce((n, b) => n + b.remaining, 0)
  if (result.value?.entitlements?.length && result.value.consumedAll.length) {
    const bought = result.value.entitlements.reduce((n, x) => n + x.total, 0)
    const used = result.value.consumedAll.reduce((n, x) => n + x.total, 0)
    return bought - used
  }
  return null
})
// Credits left are shared: sandbox usage draws on the production cards
const fc = computed(() => (shown.value ? forecast(shown.value.series, { remaining: view.value === 'all' ? remainingTotal.value : null }) : null))
const envRows = computed(() => {
  if (!result.value) return []
  return envList.value.map((e) => {
    const f = forecast(result.value.envs[e].series)
    const toDate = result.value.consumedAll.reduce((n, g) => n + (g.envs[e] || 0), 0)
    return { env: e, last30: f.last30, avg30: f.avg30, trend: f.trend, next30: f.next30, toYearEnd: f.toYearEnd, toDate }
  })
})

// Price per credit (feedback #1042): from the user's contract, per org, for money estimates.
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'JPY']
const price = ref(creditPrice(org.orgId))
const priceInput = ref(price.value ? String(price.value.price) : '')
const currency = ref(price.value?.currency || 'USD')
watch(() => org.orgId, (id) => { price.value = creditPrice(id); priceInput.value = price.value ? String(price.value.price) : ''; currency.value = price.value?.currency || 'USD' })
function savePrice() {
  setCreditPrice(org.orgId, priceInput.value, currency.value)
  price.value = creditPrice(org.orgId)
}
// Money figures only while "Show in money" is on (design Option D); remembered in this browser.
const moneyOn = ref(false)
try { moneyOn.value = localStorage.getItem('dci_credit_money') === 'on' } catch { /* private window */ }
watch(moneyOn, (v) => { try { localStorage.setItem('dci_credit_money', v ? 'on' : 'off') } catch { /* ignore */ } })
const money = (credits) => (moneyOn.value ? moneyText(credits, price.value) : '')

// Chart: the last 90 days and 30 days ahead, one bar per day, with round gridlines, month
// labels and a Today line (design Option D).
const chart = computed(() => {
  if (!shown.value || !fc.value) return null
  const stacked = view.value === 'all' && envList.value.length > 1
  const perEnv = (day) => envList.value.map((e) => ({ env: e, total: result.value.envs[e].series.find((p) => p.day === day)?.total || 0 }))
  const past = shown.value.series.slice(-90).map((p) => ({ ...p, ahead: false, parts: stacked ? perEnv(p.day) : [{ env: view.value === 'all' ? envList.value[0] : view.value, total: p.total }] }))
  const ahead = fc.value.projected.slice(0, 30).map((p) => ({ ...p, ahead: true, parts: [{ env: '', total: p.total }] }))
  const bars = [...past, ...ahead]
  const { top, ticks } = niceTicks(Math.max(1, ...bars.map((b) => b.total)))
  const W = 900, H = 240, pad = 44
  const bw = (W - pad) / bars.length
  const y = (v) => H - (v / top) * H
  return {
    W, H, pad, max: top,
    ticks: ticks.map((v) => ({ v, y: y(v), label: shortNum(v) })),
    months: bars.map((b, i) => ({ b, i })).filter(({ b, i }) => i > 0 && b.day.endsWith('-01')).map(({ b, i }) => ({ x: pad + i * bw, label: new Date(`${b.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })),
    bars: bars.map((b, i) => {
      let t = H
      const segs = b.parts.filter((p) => p.total > 0).map((p) => { const h = (p.total / top) * H; t -= h; return { env: p.env, total: p.total, y: t, h } })
      return { ...b, x: pad + i * bw, w: Math.max(1, bw - 1.5), segs }
    }),
    stacked,
    split: pad + past.length * bw,
    // The day panel opens on the last full day (today is still counting).
    lastPast: Math.max(0, past.map((p) => p.day < new Date().toISOString().slice(0, 10)).lastIndexOf(true)),
  }
})
// The day under the pointer, with what used its credits (feedback #1042).
const hoverIdx = ref(-1)
// Click a bar to keep its card open, with Copy and every resource (feedback #1055).
const pinned = ref(-1)
const showAll = ref(false)
const copied = ref(false)
const activeIdx = computed(() => (pinned.value >= 0 ? pinned.value : hoverIdx.value >= 0 ? hoverIdx.value : chart.value ? chart.value.lastPast : -1))
const hoverBar = computed(() => chart.value?.bars[activeIdx.value] || null)
function togglePin(i) { pinned.value = pinned.value === i ? -1 : i; showAll.value = false }
function closePin() { pinned.value = -1; showAll.value = false }
watch([view, result], closePin)
const listed = (list) => (showAll.value ? list : list.slice(0, 8))
async function copyDay() {
  const b = hoverBar.value
  if (!b) return
  const lines = [`Data Cloud credits, ${b.day}${b.ahead ? ' (projected)' : ''}: ${exact(b.total)}${money(b.total) ? ` (${money(b.total)})` : ''}`]
  if (chart.value?.stacked && !b.ahead) for (const p of b.parts.filter((x) => x.total)) lines.push(`${p.env}: ${exact(p.total)}`)
  const rows = hoverResources.value.length
    ? hoverResources.value.map((r) => [r.name, r.type, exact(r.credits), money(r.credits)])
    : (b.groups || []).map((g) => [g.name, '', exact(g.total), money(g.total)])
  if (rows.length) lines.push('', ['Used by', 'Type', 'Credits', price.value ? `Approx ${price.value.currency}` : ''].filter(Boolean).join('\t'), ...rows.map((r) => r.filter((x, i) => i < 3 || price.value).join('\t')))
  await navigator.clipboard.writeText(lines.join('\n'))
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
const hoverResources = computed(() => (hoverBar.value && !hoverBar.value.ahead ? resourcesForDay(result.value?.resourceDays, hoverBar.value.day, view.value) : []))
const share = (part, total) => (total ? `${Math.round((part / total) * 100)}%` : '')

// On screen numbers read as words ("~512 million", feedback #1046), the exact value on hover;
// downloads keep exact values.
const n0 = approx
const n2 = approx
const exact = (v) => (v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }))
// Cards (feedback #1054): purchased, used to date and left per card, opening to the resource
// types that used it.
const cards = computed(() => (result.value ? cardRows(result.value.entitlements, result.value.consumedAll) : []))
const cardTypes = (name) => result.value?.cardTypes?.[name]?.parts || []
// The unit a card counts in (feedback #1059): storage cards are not credits, so no money for them.
const cardUnit = (name) => result.value?.cardTypes?.[name]?.unit || ''
const inCredits = (name) => !cardUnit(name) || /credit/i.test(cardUnit(name))
const unitWord = (name) => (inCredits(name) ? '' : ` ${cardUnit(name)}`)
const cardOpen = ref({})
const typesTotal = (name) => cardTypes(name).reduce((n, t) => n + t.credits, 0) || 1
const pct = (x) => (x == null ? '' : `${x < 0.001 && x > 0 ? '<0.1' : Math.round(x * 1000) / 10}%`)

// Top resources (feedback #1046): credits, share and money per data stream, transform...
const resRows = computed(() => {
  const list = result.value?.resources || []
  const rows = view.value === 'all' ? list : list.filter((r) => r.envs[view.value]).map((r) => ({ ...r, credits: r.envs[view.value] }))
  const total = rows.reduce((n, r) => n + r.credits, 0)
  return rows.sort((a, b) => b.credits - a.credits).map((r) => ({ ...r, share: total ? r.credits / total : 0 }))
})
const resCols = computed(() => [
  { key: 'name', label: 'Resource' },
  { key: 'type', label: 'Type' },
  { key: 'usages', label: 'Usage type', value: (r) => r.usages.join(', ') },
  { key: 'cards', label: 'Card', value: (r) => r.cards.join(', ') },
  { key: 'credits', label: 'Credits', kind: 'number', align: 'right' },
  { key: 'share', label: 'Share', kind: 'number', align: 'right', value: (r) => `${Math.round(r.share * 1000) / 10}%`, sortValue: (r) => r.share },
  ...(price.value && moneyOn.value ? [{ key: 'money', label: `Approx ${price.value.currency}`, kind: 'number', align: 'right', value: (r) => money(r.credits), sortValue: (r) => r.credits }] : []),
])

// Credits by card as a grid, alerts over the page, and the top resources list (design Option D).
const grid = computed(() => cardGrid(cards.value, result.value?.consumedAll))
const alerts = computed(() => creditAlerts(cards.value, envRows.value))
const tops = computed(() => topResources(resRows.value, 6))
const showAllRes = ref(false)
const aboutOpen = ref(false)
const openCard = (name) => { cardOpen.value = { ...cardOpen.value, [name]: true }; document.getElementById(`card-${name}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
const ring = (share) => {
  const deg = Math.min(360, Math.max(0, (share || 0) * 360))
  const c = share > 1 ? 'rgb(220 38 38)' : share > 0.8 ? 'rgb(245 158 11)' : 'hsl(var(--primary))'
  return { background: `conic-gradient(${c} 0deg ${deg}deg, hsl(var(--muted)) ${deg}deg 360deg)` }
}
const range = (a, b) => [a, b].filter(Boolean).map((d) => new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })).join(' – ')
// A line of the last 90 days per environment for its card.
const spark = (e) => {
  const today = new Date().toISOString().slice(0, 10)
  const pts = (result.value?.envs[e]?.series || []).filter((p) => p.day < today).slice(-90).map((p) => p.total)
  if (pts.length < 2) return ''
  const max = Math.max(1, ...pts)
  return pts.map((v, i) => `${(i / (pts.length - 1)) * 300},${40 - (v / max) * 36}`).join(' ')
}
const TREND_TONE = { rising: 'dci-badge-amber', falling: 'dci-badge-green', flat: '' }
const resName = (r) => (r.name === '(none)' ? 'Org-level usage' : r.name)

const groupCols = [
  { key: 'name', label: 'Card or usage type' },
  { key: 'total', label: `Used in the period`, kind: 'number', align: 'right' },
]
const allCols = [
  { key: 'name', label: 'Card or usage type' },
  { key: 'total', label: 'Used to date', kind: 'number', align: 'right' },
  { key: 'envs', label: 'By environment', value: (r) => envSplit(r.envs) },
  { key: 'first', label: 'From', value: (r) => String(r.first).slice(0, 10) },
  { key: 'last', label: 'To', value: (r) => String(r.last).slice(0, 10) },
]
const envSplit = (envs) => sortEnvs(Object.keys(envs || {})).map((e) => `${e} ${n2(envs[e])}`).join(', ')
const envCols = [
  { key: 'env', label: 'Environment' },
  { key: 'last30', label: 'Last 30 days', kind: 'number', align: 'right' },
  { key: 'avg30', label: 'A day (30 days)', kind: 'number', align: 'right' },
  { key: 'trend', label: 'Trend' },
  { key: 'next30', label: 'Next 30 days', kind: 'number', align: 'right' },
  { key: 'toYearEnd', label: 'To year end', kind: 'number', align: 'right' },
  { key: 'toDate', label: 'Used to date', kind: 'number', align: 'right' },
]
const orgCols = [
  { key: 'env', label: 'Environment' },
  { key: 'name', label: 'Org', value: (r) => orgShown(r.id) },
  { key: 'id', label: 'Org ID' },
  { key: 'total', label: 'Used to date', kind: 'number', align: 'right' },
  { key: 'first', label: 'From', value: (r) => String(r.first).slice(0, 10) },
  { key: 'last', label: 'To', value: (r) => String(r.last).slice(0, 10) },
]
function doc() {
  const r = result.value
  const v = shown.value
  const f = fc.value
  const scope = view.value === 'all' ? 'all environments' : `${view.value} only`
  const blocks = [
    { type: 'p', text: `${orgTitle(org.orgId)}, data space ${org.dataSpace || 'default'}. Read ${r.at.toLocaleString()} from ${source.value} (${fields.value.amount} by ${fields.value.date}${fields.value.group ? `, per ${fields.value.group}` : ''}${fields.value.env ? `, environment from ${fields.value.env}` : ''}), last ${days.value} days. Figures: ${scope}.` },
  ]
  if (envRows.value.length) blocks.push({ type: 'h', level: 2, text: 'By environment' }, { type: 'table', columns: ['Environment', 'Last 30 days', 'A day', 'Trend', 'Next 30 days', 'To year end', 'Used to date'], rows: envRows.value.map((x) => [x.env, exact(x.last30), exact(x.avg30), x.trend, exact(x.next30), exact(x.toYearEnd), exact(x.toDate)]) })
  if (r.byOrg?.length) blocks.push({ type: 'h', level: 2, text: 'By org' }, { type: 'table', columns: ['Environment', 'Org', 'Org ID', 'Used to date', 'From', 'To'], rows: r.byOrg.map((x) => [x.env, orgShown(x.id), x.id, exact(x.total), String(x.first).slice(0, 10), String(x.last).slice(0, 10)]) })
  blocks.push(
    { type: 'h', level: 2, text: `Forecast (${scope})` },
    { type: 'kv', rows: [
      ['Used, last 30 days', exact(f.last30)], ['Average per day (30 days)', exact(f.avg30)], ['Average per day (7 days)', exact(f.avg7)], ['Trend', f.trend],
      ['Next 30 days (projected)', exact(f.next30)], ['Next 90 days (projected)', exact(f.next90)], ['To the end of this month', exact(f.toMonthEnd)], ['To the end of this year', exact(f.toYearEnd)],
      ...(remainingTotal.value != null && view.value === 'all' ? [['Left (purchased minus used)', exact(remainingTotal.value)], ['Runs out (at the 30-day rate)', f.runOutDate ? `${f.runOutDate}, in ${f.runOutDays} days` : 'not at this rate']] : []),
    ] },
    { type: 'h', level: 2, text: 'By card or usage type, this period' },
    { type: 'table', columns: ['Card or usage type', 'Used'], rows: v.groups.map((g) => [g.name, exact(g.total)]) },
  )
  if (left.value.length) blocks.push({ type: 'h', level: 2, text: 'Purchased and left' }, { type: 'table', columns: ['Card', 'Purchased', 'Used', 'Left'], rows: left.value.map((b) => [b.name, exact(b.purchased), exact(b.consumed), exact(b.remaining)]) })
  const envCols2 = envList.value.length > 1 ? envList.value : []
  blocks.push({ type: 'h', level: 2, text: 'Daily use' }, { type: 'table', columns: ['Day', 'Used', ...envCols2], rows: r.series.map((p, i) => [p.day, exact(p.total), ...envCols2.map((e) => exact(r.envs[e].series[i]?.total))]) })
  blocks.push({ type: 'p', text: 'The forecast is the trend through the last 90 days of daily use, shaped by the usual day-of-week pattern. Sandbox usage draws on the production cards, so what is left is shared. It is an estimate, not a bill: Salesforce\'s Digital Wallet is the record.' })
  return { title: `Data Cloud credits: ${orgName(org.orgId)}`, blocks }
}
const sheets = () => [
  { name: 'Daily', columns: ['Day', 'Used', ...envList.value], rows: result.value.series.map((p, i) => [p.day, p.total, ...envList.value.map((e) => result.value.envs[e].series[i]?.total || 0)]) },
  { name: 'Projected', columns: ['Day', `Projected (${view.value === 'all' ? 'all' : view.value})`], rows: fc.value.projected.map((p) => [p.day, Math.round(p.total * 100) / 100]) },
  { name: 'By environment', columns: ['Environment', 'Last 30 days', 'A day', 'Trend', 'Next 30 days', 'To year end', 'Used to date'], rows: envRows.value.map((x) => [x.env, x.last30, x.avg30, x.trend, x.next30, x.toYearEnd, x.toDate]) },
  ...(result.value.byOrg?.length ? [{ name: 'By org', columns: ['Environment', 'Org', 'Org ID', 'Used to date', 'From', 'To'], rows: result.value.byOrg.map((x) => [x.env, orgShown(x.id), x.id, x.total, x.first, x.last]) }] : []),
  { name: 'By type', columns: ['Card or usage type', 'Used in period'], rows: shown.value.groups.map((g) => [g.name, g.total]) },
  { name: 'To date', columns: ['Card or usage type', 'Used to date', ...envList.value, 'From', 'To'], rows: result.value.consumedAll.map((g) => [g.name, g.total, ...envList.value.map((e) => g.envs[e] || 0), g.first, g.last]) },
  ...(left.value.length ? [{ name: 'Left', columns: ['Card', 'Purchased', 'Used', 'Left'], rows: left.value.map((b) => [b.name, b.purchased, b.consumed, b.remaining]) }] : []),
]

const sel = 'border rounded-md px-2 py-1 bg-background text-sm font-mono max-w-[16rem]'
const btn = 'dci-btn'
</script>

<template>
  <section class="max-w-[1240px] mx-auto space-y-5">
    <PageHeader path="/credits" title="Credit prediction" topic="credits">How many Data Cloud credits this org used, by card or usage type, and where the recent daily use is heading.
      <template v-if="sources.length" #actions>
        <span v-if="result" class="text-xs text-muted-foreground">Last read {{ result.at.toLocaleString() }}</span>
        <button class="dci-btn-primary" :disabled="busy || !ready" @click="read"><RefreshCw :class="['w-4 h-4', busy ? 'animate-spin' : '']" /> {{ result ? 'Read again' : 'Read consumption' }}</button>
        <template v-if="result && fc">
          <button type="button" :class="['dci-btn', moneyOn ? '!border-primary !bg-primary/10 !text-primary' : '']" :aria-pressed="moneyOn" @click="moneyOn = !moneyOn">$ Show in money</button>
          <DownloadMenu :get-doc="doc" :get-sheets="sheets" :file-name="`data-cloud-credits-${orgName(org.orgId)}`" />
          <button type="button" :class="['dci-btn w-[38px] !px-0 justify-center', aboutOpen ? '!border-primary !bg-primary/10 !text-primary' : '']" :aria-pressed="aboutOpen" aria-label="About this data: setup, SQL and more tables" title="About this data: setup, SQL and more tables" @click="aboutOpen = !aboutOpen"><Info class="w-4 h-4" /></button>
        </template>
      </template>
    </PageHeader>

    <p v-if="sandbox" class="text-sm p-3 border rounded-xl border-amber-400 bg-card">This is a sandbox. The consumption objects exist only in production, and production's copy includes this sandbox's usage (environment Sandbox, with this org's ID). Connect to the production org and split by environment there.</p>

    <Loading v-if="(catalog.loading && !catalog.objects.length) || (probing && !sources.length)" text="Looking for consumption objects" />
    <div v-else-if="!sources.length" class="text-sm p-3 border rounded-xl bg-card space-y-2">
      <div class="flex flex-wrap items-center gap-2"><p class="font-medium">No consumption objects in this org and data space ({{ org.dataSpace || 'default' }}).</p>
        <button class="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border hover:bg-accent text-xs" :disabled="probing || catalog.loading" @click="checkAgain"><RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': probing || catalog.loading }" /> Check again</button></div>
      <p>Credit prediction reads Salesforce's consumption data (Digital Wallet) with SQL: data lake objects such as <span class="font-mono">TenantBillingUsageEvent__dll</span>. To turn them on:</p>
      <ol class="list-decimal ml-5 space-y-1">
        <li>Use the <b>production</b> org that holds the Data Cloud contract. Sandboxes and scratch orgs don't get these objects; their usage is recorded in production, marked with its environment and org ID.</li>
        <li>In Setup, search for <b>Digital Wallet</b> and enable it (finish its setup if it asks).</li>
        <li>In Data Cloud, open <b>Data Streams</b>. Digital Wallet adds streams such as TenantBillingUsageEventStream, TenantEntitlementTransactionStream and TenantUsageTypeMultiplierStream. Select them and <b>Activate</b> them.</li>
        <li>They still say "Data stream not added to any data space". Open Data Cloud > <b>Data Spaces</b>, open the data space (usually default), click <b>Add Data Lake Objects</b>, select every DLO whose name starts with <b>Tenant</b> and add them.</li>
        <li>Check: in Data Cloud > <b>Query Editor</b>, under Data Lake Objects, find TenantBillingUsageEvent and run a query on it. Your user needs access to that data space (a Data Cloud permission set that includes it).</li>
        <li>Then click <b>Check again</b> here, with that data space picked in the connection menu. The data refreshes several times a day; the first load can take a while.</li>
      </ol>
      <p class="text-muted-foreground">More: <a class="text-link hover:underline" href="https://admin.salesforce.com/blog/2025/track-manage-and-optimize-data-cloud-usage-in-digital-wallet" target="_blank" rel="noopener">Track and optimize Data Cloud usage in Digital Wallet</a> (Salesforce Admins blog), <a class="text-link hover:underline" href="https://developer.salesforce.com/docs/data/data-cloud-dmo-mapping/guide/c360dm-si-tenantconsumptioninsightsdmo-dmo.html" target="_blank" rel="noopener">Tenant Consumption Insights DMO</a> (Salesforce Developers), and <a class="text-link hover:underline" href="https://medium.com/@marketingcloudtips/sfmc-tips-232-data-cloud-viewing-detailed-digital-wallet-consumption-data-436dc3bf4f13" target="_blank" rel="noopener">SFMC Tips #232: viewing detailed Digital Wallet consumption data</a> (step by step).</p>
    </div>

    <template v-else>
      <div v-if="!result || aboutOpen" class="border rounded-xl bg-card p-3 space-y-3 text-sm">
        <details :open="setupOpen" class="space-y-3" @toggle="setupOpen = $event.target.open">
        <summary class="cursor-pointer select-none"><span class="font-medium">Setup</span> <span class="text-xs text-muted-foreground">{{ setupSummary }}</span></summary>
        <div class="space-y-3 mt-2">
        <div class="text-xs text-muted-foreground">Consumption objects in this org and data space:</div>
        <ul class="text-xs space-y-0.5">
          <li v-for="x in found" :key="x.object.name"><span class="text-muted-foreground">{{ x.role.label }}:</span> <RouterLink :to="`/objects/${x.object.name}`" class="font-mono text-link hover:underline">{{ x.object.name }}</RouterLink></li>
        </ul>
        <details v-if="missing.length" class="text-xs">
          <summary class="cursor-pointer text-muted-foreground">Not found: {{ missing.map((id) => id === 'daily' ? 'daily consumption' : 'purchases (entitlement transactions)').join(' and ') }}. How to add them</summary>
          <div class="mt-2 space-y-2"><ol class="list-decimal ml-5 space-y-1">
        <li>Use the <b>production</b> org that holds the Data Cloud contract. Sandboxes and scratch orgs don't get these objects; their usage is recorded in production, marked with its environment and org ID.</li>
        <li>In Setup, search for <b>Digital Wallet</b> and enable it (finish its setup if it asks).</li>
        <li>In Data Cloud, open <b>Data Streams</b>. Digital Wallet adds streams such as TenantBillingUsageEventStream, TenantEntitlementTransactionStream and TenantUsageTypeMultiplierStream. Select them and <b>Activate</b> them.</li>
        <li>They still say "Data stream not added to any data space". Open Data Cloud > <b>Data Spaces</b>, open the data space (usually default), click <b>Add Data Lake Objects</b>, select every DLO whose name starts with <b>Tenant</b> and add them.</li>
        <li>Check: in Data Cloud > <b>Query Editor</b>, under Data Lake Objects, find TenantBillingUsageEvent and run a query on it. Your user needs access to that data space (a Data Cloud permission set that includes it).</li>
        <li>Then click <b>Check again</b> here, with that data space picked in the connection menu. The data refreshes several times a day; the first load can take a while.</li>
      </ol>
      <p class="text-muted-foreground">More: <a class="text-link hover:underline" href="https://admin.salesforce.com/blog/2025/track-manage-and-optimize-data-cloud-usage-in-digital-wallet" target="_blank" rel="noopener">Track and optimize Data Cloud usage in Digital Wallet</a> (Salesforce Admins blog), <a class="text-link hover:underline" href="https://developer.salesforce.com/docs/data/data-cloud-dmo-mapping/guide/c360dm-si-tenantconsumptioninsightsdmo-dmo.html" target="_blank" rel="noopener">Tenant Consumption Insights DMO</a> (Salesforce Developers), and <a class="text-link hover:underline" href="https://medium.com/@marketingcloudtips/sfmc-tips-232-data-cloud-viewing-detailed-digital-wallet-consumption-data-436dc3bf4f13" target="_blank" rel="noopener">SFMC Tips #232: viewing detailed Digital Wallet consumption data</a> (step by step).</p></div>
        </details>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-1.5">Use <select v-model="source" :class="sel" aria-label="Consumption object"><option v-for="x in sources" :key="x.object.name" :value="x.object.name">{{ x.object.name }}</option></select></label>
          <label class="flex items-center gap-1.5">credits <select v-model="fields.amount" :class="sel" aria-label="Credits field"><option value="">Field…</option><option v-for="n in fieldList(source)" :key="n" :value="n">{{ n }}</option></select></label>
          <label class="flex items-center gap-1.5">by day of <select v-model="fields.date" :class="sel" aria-label="Date field"><option value="">Field…</option><option v-for="n in fieldList(source)" :key="n" :value="n">{{ n }}</option></select></label>
          <label class="flex items-center gap-1.5">per <select v-model="fields.group" :class="sel" aria-label="Group field"><option value="">nothing</option><option v-for="n in fieldList(source)" :key="n" :value="n">{{ n }}</option></select></label>
          <label class="flex items-center gap-1.5">environment <select v-model="fields.env" :class="sel" aria-label="Environment field"><option value="">not split</option><option v-for="n in fieldList(source)" :key="n" :value="n">{{ n }}</option></select></label>
          <label class="flex items-center gap-1.5">org <select v-model="fields.org" :class="sel" aria-label="Org field"><option value="">not split</option><option v-for="n in fieldList(source)" :key="n" :value="n">{{ n }}</option></select></label>
          <label class="flex items-center gap-1.5">last <select v-model.number="days" :class="sel" aria-label="Days"><option :value="90">90 days</option><option :value="180">180 days</option><option :value="365">365 days</option></select></label>
        </div>
        <div v-if="entSources.length" class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-1.5">Purchased from <select v-model="ent" :class="sel" aria-label="Entitlement object"><option value="">not used</option><option v-for="x in entSources" :key="x.object.name" :value="x.object.name">{{ x.object.name }}</option></select></label>
          <template v-if="ent">
            <label class="flex items-center gap-1.5">quantity <select v-model="entFields.amount" :class="sel" aria-label="Purchased quantity field"><option value="">Field…</option><option v-for="n in fieldList(ent)" :key="n" :value="n">{{ n }}</option></select></label>
            <label class="flex items-center gap-1.5">per <select v-model="entFields.group" :class="sel" aria-label="Purchased group field"><option value="">nothing</option><option v-for="n in fieldList(ent)" :key="n" :value="n">{{ n }}</option></select></label>
          </template>
        </div>
        <p v-if="sourceRole?.raw" class="text-xs p-2 border rounded-md border-amber-400">This object holds raw usage (rows, requests), not credits. For credits use the daily, hourly or enriched consumption object.</p>
        <p v-if="!fields.env" class="text-xs text-muted-foreground">No environment field chosen: production, sandbox and scratch usage are counted together.</p>
        <p v-if="fields.status" class="text-xs text-muted-foreground">Only rows with <span class="font-mono">{{ fields.status }} = 'PROCESSED'</span> are counted, as Salesforce advises for hourly data.</p>
        </div>
        </details>
        <div class="flex flex-wrap items-center gap-2">
          <button :class="btn" :disabled="!ready" @click="sqlShown = !sqlShown">{{ sqlShown ? 'Hide SQL' : 'Show SQL' }}</button>
          <span class="text-xs text-muted-foreground">Runs 2 to 7 read-only queries, which use a few query credits themselves. The result is kept in this browser and shown next time without querying.</span>
        </div>
        <SqlBlock v-if="sqlShown" :code="sqlText" box-class="max-h-72" />
      </div>

      <Loading v-if="busy" text="Reading consumption" />
      <p v-if="error" class="text-sm text-destructive whitespace-pre-wrap">{{ error }}</p>

      <template v-if="result && fc">
        <!-- Price per credit, while "Show in money" is on -->
        <form v-if="moneyOn" class="dci-card px-4 py-3 flex flex-wrap items-center gap-3 text-sm" aria-label="Price per credit" @submit.prevent="savePrice">
          <label for="cr-price" class="text-[13px] font-semibold">Price per credit</label>
          <input id="cr-price" v-model="priceInput" inputmode="decimal" placeholder="e.g. 0.001" class="w-32 h-9 rounded-full border px-3.5 bg-background" @change="savePrice" />
          <select v-model="currency" class="h-9 rounded-full border px-3 bg-background text-sm" aria-label="Currency" @change="savePrice"><option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option></select>
          <span class="text-xs text-muted-foreground flex-1 min-w-60">{{ price ? `${price.price} ${price.currency} a credit (${moneyText(1000, price)} per 1,000 credits), saved for this org in this browser.` : 'From your Salesforce contract. Salesforce does not expose the price to the API, so it stays in this browser.' }}</span>
          <HelpTip topic="credits-price" />
        </form>

        <!-- Alerts -->
        <div v-if="alerts.length" class="flex flex-col gap-2">
          <div v-for="a in alerts" :key="a.kind + (a.card?.name || a.env?.env)" role="alert" :class="['flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border text-sm', a.kind === 'over' ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300' : 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300']">
            <component :is="a.kind === 'over' ? AlertTriangle : TrendingUp" class="w-4 h-4 shrink-0" aria-hidden="true" />
            <span v-if="a.kind === 'over'"><b>{{ a.card.name }} is over its purchase</b>: {{ approx(a.card.used) }}{{ unitWord(a.card.name) }} used of {{ approx(a.card.purchased) }} ({{ pct(a.card.share) }}), about {{ approx(-a.card.left) }} over.</span>
            <span v-else><b>{{ a.env.env }} use is rising</b>: {{ approx(a.env.last30) }} in the last 30 days, {{ approx(a.env.avg30) }} a day. It draws on the production cards.</span>
            <button v-if="a.kind === 'over'" type="button" class="ml-auto text-[13px] font-semibold underline-offset-2 hover:underline" @click="openCard(a.card.name)">See what used it</button>
          </div>
        </div>

        <!-- Tiles -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div v-for="t in [
            { label: 'Used, last 30 days', v: fc.last30, sub: `${n2(fc.avg30)} a day`, icon: Activity, tone: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
            { label: 'Next 30 days (projected)', v: fc.next30, sub: `next 90 days ${n0(fc.next90)} · trend ${fc.trend}`, icon: TrendingUp, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
            { label: 'To year end (projected)', v: fc.toYearEnd, sub: `this month ${n0(fc.toMonthEnd)} more`, icon: CalendarRange, tone: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
            { label: view === 'all' ? 'Left, all environments' : 'Left (shared)', v: remainingTotal, sub: remainingTotal == null ? (result.entError ? `could not read purchases: ${result.entError}` : 'no purchase data read') : 'purchased minus used', icon: Wallet, tone: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300', runOut: true },
          ]" :key="t.label" class="dci-card p-4 flex flex-col gap-2 min-w-0">
            <div class="flex items-center justify-between gap-2"><span class="text-[13px] text-muted-foreground">{{ t.label }}</span><span :class="['w-7 h-7 rounded-xl flex items-center justify-center shrink-0', t.tone]" aria-hidden="true"><component :is="t.icon" class="w-3.5 h-3.5" /></span></div>
            <span class="text-[28px] leading-8 font-bold tracking-tight break-words" :title="exact(t.v)">{{ t.v == null ? '—' : n0(t.v) }}</span>
            <span v-if="money(t.v)" class="text-sm font-medium">{{ money(t.v) }}</span>
            <span class="text-xs text-muted-foreground">{{ t.sub }}</span>
            <span v-if="t.runOut && remainingTotal != null" class="text-xs font-medium">{{ view !== 'all' ? 'Run-out date under All' : fc.runOutDate ? (fc.runOutDays > 36500 ? 'Lasts more than 100 years at this rate' : `Runs out around ${new Date(fc.runOutDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} · ${approx(fc.runOutDays)} days`) : 'Not used up at this rate' }}</span>
          </div>
        </div>

        <!-- Credits per day -->
        <section v-if="chart" class="dci-card px-5 py-[18px] flex flex-col gap-3.5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-base font-semibold">Credits per day</h2>
            <div class="flex flex-wrap items-center gap-3.5">
              <div class="flex flex-wrap gap-3.5 text-xs">
                <span v-for="e in (chart.stacked ? envList : [view === 'all' ? envList[0] : view]).filter(Boolean)" :key="e" class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-[3px]" :class="envDot(e)" />{{ e }}</span>
                <span class="inline-flex items-center gap-1.5"><svg class="w-2.5 h-2.5 rounded-[3px]" aria-hidden="true"><rect width="10" height="10" fill="url(#cr-hatch)" /></svg>Projected</span>
              </div>
              <div v-if="envList.length > 1" role="group" aria-label="Environment" class="inline-flex p-[3px] rounded-full border bg-card">
                <button v-for="e in ['all', ...envList]" :key="e" type="button" :class="['h-[30px] px-3 rounded-full text-[13px]', view === e ? 'bg-primary text-primary-foreground font-semibold' : 'font-medium hover:bg-accent']" :aria-pressed="view === e" @click="view = e">{{ e === 'all' ? 'All' : e }}</button>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-stretch gap-[18px]">
            <div class="flex-[999_1_560px] min-w-0 relative" @mouseleave="hoverIdx = -1" @keydown.esc="closePin">
              <svg :viewBox="`0 0 ${chart.W} ${chart.H + 22}`" class="w-full h-auto overflow-visible" role="img" :aria-label="`Daily credits, up to ${n0(chart.max)} a day; projected next 30 days ${n0(fc.next30)}`">
                <defs>
                  <pattern id="cr-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" class="fill-primary/15" /><rect width="2" height="4" class="fill-primary/50" /></pattern>
                </defs>
                <g v-for="t in chart.ticks" :key="t.v">
                  <line :x1="chart.pad" :x2="chart.W" :y1="t.y" :y2="t.y" class="stroke-border" :stroke-dasharray="t.v ? '3 3' : ''" />
                  <text :x="chart.pad - 6" :y="t.y + 4" text-anchor="end" class="fill-muted-foreground text-[11px]">{{ t.label }}</text>
                </g>
                <g v-for="(b, i) in chart.bars" :key="b.day">
                  <rect v-if="i === activeIdx" :x="b.x - 0.5" y="0" :width="b.w + 1" :height="chart.H" rx="2" class="fill-primary/10" />
                  <rect v-for="(sg, j) in b.segs" :key="j" :x="b.x" :y="sg.y" :width="b.w" :height="Math.max(0, sg.h)" rx="1" :fill="b.ahead ? 'url(#cr-hatch)' : undefined" :class="b.ahead ? '' : envFill(sg.env)" :opacity="activeIdx >= 0 && activeIdx !== i && pinned >= 0 ? 0.6 : 1" />
                  <rect :x="b.x - 0.75" y="0" :width="b.w + 1.5" :height="chart.H" fill="transparent" class="cursor-pointer" @mouseenter="hoverIdx = i" @click="togglePin(i)"><title>{{ b.day }}: {{ n2(b.total) }}</title></rect>
                </g>
                <line :x1="chart.split" :x2="chart.split" y1="-4" :y2="chart.H" class="stroke-foreground" stroke-width="1.5" stroke-dasharray="4 3" />
                <text :x="chart.split + 4" y="8" class="fill-foreground text-[11px] font-semibold">Today</text>
                <text :x="chart.pad" :y="chart.H + 16" class="fill-muted-foreground text-[11px]">{{ new Date(`${chart.bars[0].day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }}</text>
                <text v-for="m in chart.months" :key="m.x" :x="m.x" :y="chart.H + 16" text-anchor="middle" class="fill-muted-foreground text-[11px]">{{ m.label }}</text>
                <text :x="chart.W" :y="chart.H + 16" text-anchor="end" class="fill-muted-foreground text-[11px]">{{ new Date(`${chart.bars[chart.bars.length - 1].day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }}</text>
              </svg>
            </div>
            <aside v-if="hoverBar" aria-label="Day detail" aria-live="polite" class="flex-[1_1_260px] max-w-[300px] min-w-0 p-4 rounded-xl border bg-muted/30 flex flex-col gap-2.5 text-[13px]">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-muted-foreground">{{ new Date(`${hoverBar.day}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }}</span>
                <span class="flex items-center gap-1">
                  <button type="button" class="dci-btn dci-btn-sm" :title="'Copy this day'" @click="copyDay"><component :is="copied ? Check : Copy" class="w-3.5 h-3.5" /><span class="sr-only">{{ copied ? 'Copied' : 'Copy' }}</span></button>
                  <button v-if="pinned >= 0" type="button" class="dci-btn dci-btn-sm" aria-label="Back to today" title="Back to the last full day" @click="closePin"><X class="w-3.5 h-3.5" /></button>
                </span>
              </div>
              <span class="text-[22px] font-bold leading-7" :title="exact(hoverBar.total)">{{ n2(hoverBar.total) }} <span class="text-[13px] font-medium text-muted-foreground">credits</span></span>
              <span v-if="money(hoverBar.total)" class="font-medium">{{ money(hoverBar.total) }}</span>
              <span v-if="hoverBar.ahead" class="dci-badge dci-badge-blue self-start">Projected from the trend</span>
              <div v-if="chart.stacked && !hoverBar.ahead" class="flex flex-col gap-1.5">
                <span v-for="p in hoverBar.parts" :key="p.env" class="flex justify-between gap-2"><span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" :class="envDot(p.env)" />{{ p.env }}</span><span class="font-semibold tabular-nums">{{ n2(p.total) }}</span></span>
              </div>
              <div v-if="!hoverBar.ahead && (hoverResources.length || hoverBar.groups?.length)" class="flex flex-col gap-1.5 pt-2.5 border-t">
                <span class="text-xs font-semibold">{{ hoverResources.length || fields.group ? 'Used by' : 'Total' }}</span>
                <template v-if="hoverResources.length">
                  <span v-for="r in listed(hoverResources)" :key="`${r.type}|${r.name}`" class="flex justify-between gap-2 text-xs">
                    <span class="font-mono text-[11px] truncate min-w-0" :title="`${r.name}${r.type ? ` (${r.type})` : ''}`">{{ r.name }}</span>
                    <span class="font-medium whitespace-nowrap tabular-nums">{{ n2(r.credits) }}<template v-if="money(r.credits)"> · {{ money(r.credits) }}</template></span>
                  </span>
                  <button v-if="hoverResources.length > 8" type="button" class="self-start text-xs font-semibold text-link hover:underline" @click="pinned = activeIdx; showAll = !showAll">{{ showAll ? 'Show fewer' : `and ${hoverResources.length - 8} more` }}</button>
                </template>
                <template v-else>
                  <span v-for="g in listed(hoverBar.groups)" :key="g.name" class="flex justify-between gap-2 text-xs">
                    <span class="truncate min-w-0" :title="g.name">{{ g.name }}</span>
                    <span class="font-medium whitespace-nowrap tabular-nums">{{ n2(g.total) }} <span class="text-muted-foreground">{{ share(g.total, hoverBar.total) }}</span></span>
                  </span>
                  <button v-if="hoverBar.groups.length > 8" type="button" class="self-start text-xs font-semibold text-link hover:underline" @click="pinned = activeIdx; showAll = !showAll">{{ showAll ? 'Show fewer' : `and ${hoverBar.groups.length - 8} more` }}</button>
                </template>
              </div>
              <span v-else-if="!hoverBar.ahead && !hoverBar.total" class="text-xs text-muted-foreground">No credits used.</span>
              <span v-if="pinned < 0" class="text-xs text-muted-foreground">Click a past day to see which resources used its credits.</span>
            </aside>
          </div>
          <p class="text-xs text-muted-foreground">Projection: the trend through the last 90 days, shaped by the usual day-of-week pattern when there are four weeks of data. Today is still counting and is left out. An estimate, not a bill: the Digital Wallet in Setup is the record.</p>
        </section>

        <!-- Credits by card -->
        <section v-if="cards.length" class="dci-card px-5 py-[18px] flex flex-col gap-3.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-base font-semibold">Credits by card, to date</h2>
            <span class="text-xs text-muted-foreground">All environments · sorted by share used</span>
          </div>
          <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            <div v-for="c in grid.used" :id="`card-${c.name}`" :key="c.name" :class="['rounded-[14px] border p-4 flex flex-col gap-3 min-w-0', c.left != null && c.left < 0 ? 'border-red-200 bg-red-50/40 dark:border-red-500/30 dark:bg-red-500/5' : 'bg-card']">
              <div class="flex items-center gap-3">
                <span class="w-14 h-14 shrink-0 rounded-full flex items-center justify-center" :style="ring(c.share)" aria-hidden="true">
                  <span :class="['w-[42px] h-[42px] rounded-full bg-card flex items-center justify-center text-[11px] font-bold', c.share > 1 ? 'text-red-700 dark:text-red-300' : '']">{{ c.share == null ? '—' : pct(c.share) }}</span>
                </span>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="flex items-center gap-1.5 text-[15px] font-bold break-all"><AlertTriangle v-if="c.left != null && c.left < 0" class="w-4 h-4 text-red-600 shrink-0" aria-label="Over its purchase" />{{ c.name }}</span>
                  <span v-if="cardInfo(c.name)" class="text-xs text-muted-foreground leading-[17px]">{{ cardInfo(c.name) }}</span>
                </div>
              </div>
              <dl class="grid grid-cols-3 gap-2 px-3 py-2.5 rounded-[10px] bg-muted/50 text-[13px]">
                <div><dt class="text-[11px] text-muted-foreground">Used</dt><dd class="font-semibold" :title="exact(c.used)">{{ approx(c.used) }}</dd></div>
                <div><dt class="text-[11px] text-muted-foreground">Purchased</dt><dd class="font-semibold" :title="exact(c.purchased)">{{ c.purchased == null ? 'not found' : approx(c.purchased) }}</dd></div>
                <div v-if="c.left != null"><dt class="text-[11px] text-muted-foreground">{{ c.left < 0 ? 'Over' : 'Left' }}</dt><dd :class="c.left < 0 ? 'font-bold text-red-700 dark:text-red-300' : 'font-semibold'" :title="exact(c.left)">{{ approx(Math.abs(c.left)) }}</dd></div>
              </dl>
              <span v-if="cardUnit(c.name) && !inCredits(c.name)" class="text-xs text-muted-foreground">Counted in {{ cardUnit(c.name) }}, not credits.</span>
              <span v-if="money(c.used) && inCredits(c.name)" class="text-xs font-medium">{{ money(c.used) }}<span v-if="c.purchased != null" class="text-muted-foreground font-normal"> of {{ money(c.purchased) }}</span></span>
              <details v-if="Object.keys(c.envs).length" class="text-xs">
                <summary class="cursor-pointer font-semibold text-link">By environment<template v-if="c.first"> · {{ range(c.first, c.last) }}</template></summary>
                <div class="flex flex-wrap gap-1.5 mt-2">
                  <span v-for="e in sortEnvs(Object.keys(c.envs))" :key="e" :class="['dci-badge', e === 'Production' ? 'dci-badge-teal' : e === 'Sandbox' ? 'dci-badge-amber' : '']">{{ e }} {{ approx(c.envs[e]) }}</span>
                </div>
              </details>
              <details v-if="cardTypes(c.name).length" class="text-xs" :open="!!cardOpen[c.name]" @toggle="cardOpen = { ...cardOpen, [c.name]: $event.target.open }">
                <summary class="cursor-pointer font-semibold text-link">What used it</summary>
                <ul class="mt-2 space-y-1.5" :aria-label="`${c.name} by resource and usage type`">
                  <li class="text-muted-foreground">By resource type, or usage type where no resource is named{{ cardUnit(c.name) ? `; counted in ${cardUnit(c.name)}` : '' }}.</li>
                  <li v-if="c.used && Math.abs(typesTotal(c.name) - c.used) / c.used > 0.05" class="text-amber-700 dark:text-amber-400">The breakdown adds up to {{ approx(typesTotal(c.name)) }}, the card's total {{ approx(c.used) }}. They come from different Digital Wallet objects ({{ result.resObject }} and {{ source }}); the card total is the one the Digital Wallet bills. Each event is counted once.</li>
                  <li v-for="t in cardTypes(c.name)" :key="`${t.type}|${t.usage}`" class="flex flex-col gap-1">
                    <span class="flex justify-between gap-2"><span class="truncate" :title="[t.type, t.usage].filter(Boolean).join(' · ')">{{ t.label }}<span v-if="t.type && t.usage" class="text-muted-foreground"> · {{ t.usage }}</span></span><span class="tabular-nums whitespace-nowrap" :title="exact(t.credits)">{{ approx(t.credits) }} <span class="text-muted-foreground">{{ pct(t.credits / typesTotal(c.name)) }}</span></span></span>
                    <span class="h-1.5 rounded-full bg-muted overflow-hidden"><span class="block h-full bg-primary/70 rounded-full" :style="{ width: `${(t.credits / Math.max(1, cardTypes(c.name)[0].credits)) * 100}%` }" /></span>
                  </li>
                </ul>
              </details>
            </div>
            <div v-if="grid.unused.length" class="rounded-[14px] border border-dashed bg-muted/30 p-4 flex flex-col gap-2.5">
              <span class="text-[15px] font-bold">{{ grid.unused.length }} card{{ grid.unused.length === 1 ? '' : 's' }} not used yet</span>
              <div v-for="c in grid.unused" :key="c.name" class="flex justify-between gap-2 text-[13px] py-1.5 border-t">
                <span class="break-all">{{ c.name }}</span>
                <span class="text-muted-foreground whitespace-nowrap">{{ c.purchased == null ? 'no purchase' : `${approx(c.purchased)} left` }}</span>
              </div>
            </div>
          </div>
          <p class="text-xs text-muted-foreground">Purchased is shared by every usage type on the card. Card names must match on both sides; check against the Digital Wallet before relying on it.</p>
        </section>

        <!-- Top resources -->
        <section class="dci-card px-5 py-[18px] flex flex-col gap-1">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 class="text-base font-semibold">Top resources, last {{ days }} days{{ view === 'all' ? '' : `, ${view}` }}</h2>
            <span v-if="tops.count" class="text-[13px] font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">Top {{ tops.top.length }} of {{ tops.count.toLocaleString() }} = {{ Math.round(tops.topShare * 100) }}% of credits</span>
          </div>
          <p v-if="!result.resObject" class="text-xs text-muted-foreground">To see which data stream, data transform or other resource used the credits, add Digital Wallet's TenantEnrichedUsageEvent DLO to this data space, then Check again and Read again.</p>
          <p v-else-if="result.resError" class="text-xs text-destructive">Could not read {{ result.resObject }}: {{ result.resError }}</p>
          <template v-else-if="result.resources">
            <p v-if="!tops.count" class="text-sm text-muted-foreground">No credits used by a resource in this period.</p>
            <template v-if="!showAllRes">
              <div v-for="r in tops.top" :key="r.key" class="grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 items-center py-2.5 border-t">
                <span :class="['w-8 h-8 rounded-xl flex items-center justify-center', r.name === '(none)' ? 'bg-muted text-muted-foreground' : 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300']" aria-hidden="true"><Layers class="w-4 h-4" /></span>
                <div class="flex flex-col gap-1.5 min-w-0">
                  <span v-if="r.name === '(none)'" class="text-sm font-semibold" title="Usage not tied to one resource: queries, storage, rows accessed and more">Org-level usage <span class="font-medium text-muted-foreground">(no single resource)</span></span>
                  <span v-else class="font-mono text-[13px] font-medium break-all">{{ r.name }}</span>
                  <span class="h-2 rounded bg-muted overflow-hidden"><span :class="['block h-full rounded', r.name === '(none)' ? 'bg-muted-foreground/50' : 'bg-blue-600']" :style="{ width: `${(r.credits / Math.max(1, tops.top[0].credits)) * 100}%` }" /></span>
                  <span class="text-[11px] text-muted-foreground break-words">{{ r.name === '(none)' ? `${r.usages.slice(0, 4).join(', ')}${r.usages.length > 4 ? ` +${r.usages.length - 4} more` : ''}` : r.type }}<template v-if="r.cards.length"> · {{ r.cards.length > 2 ? `${r.cards.length} cards` : r.cards.join(', ') }}</template></span>
                </div>
                <div class="flex flex-col items-end">
                  <span class="text-[15px] font-bold whitespace-nowrap" :title="exact(r.credits)">{{ approx(r.credits) }}</span>
                  <span class="text-xs text-muted-foreground">{{ pct(r.share) }}<template v-if="money(r.credits)"> · {{ money(r.credits) }}</template></span>
                </div>
              </div>
            </template>
            <DataTable v-else :columns="resCols" :rows="resRows" row-key="key" text-size="text-xs" box-class="max-h-96" empty="No credits used by a resource in this period.">
              <template #cell-name="{ row }"><span class="font-mono break-all">{{ resName(row) }}</span></template>
              <template #cell-credits="{ value }"><span :title="exact(value)">{{ approx(value) }}</span></template>
            </DataTable>
            <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t">
              <span class="text-xs text-muted-foreground">From <RouterLink :to="`/objects/${result.resObject}`" class="font-mono text-link hover:underline">{{ result.resObject }}</RouterLink></span>
              <button v-if="tops.count > tops.top.length || showAllRes" type="button" class="text-[13px] font-semibold text-link hover:underline" @click="showAllRes = !showAllRes">{{ showAllRes ? 'Show the top 6' : `See all ${tops.count.toLocaleString()} resources` }}</button>
            </div>
          </template>
        </section>

        <!-- By environment -->
        <div v-if="fields.env && envRows.length" class="flex flex-col gap-2.5">
          <h2 class="text-base font-semibold">By environment</h2>
          <div class="grid md:grid-cols-2 gap-3.5">
            <div v-for="e in envRows" :key="e.env" class="dci-card px-5 py-[18px] flex flex-col gap-3.5 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="inline-flex items-center gap-2 text-base font-bold"><span class="w-2.5 h-2.5 rounded-full" :class="envDot(e.env)" />{{ e.env }}</span>
                <span :class="['dci-badge capitalize', TREND_TONE[e.trend] || '']">{{ e.trend }}</span>
              </div>
              <svg v-if="spark(e.env)" viewBox="0 0 300 40" preserveAspectRatio="none" class="w-full h-10" aria-hidden="true"><polyline :points="spark(e.env)" fill="none" :class="e.env === 'Production' ? 'stroke-primary' : e.env === 'Sandbox' ? 'stroke-amber-500' : 'stroke-sky-400'" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg>
              <dl class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div v-for="[k, v] in [['Last 30 days', e.last30], ['A day (30 days)', e.avg30], ['Used to date', e.toDate], ['Next 30 days', e.next30], ['To year end', e.toYearEnd]]" :key="k">
                  <dt class="text-[11px] text-muted-foreground">{{ k }}</dt><dd class="text-[15px] font-bold" :title="exact(v)">{{ n2(v) }}</dd>
                </div>
              </dl>
            </div>
          </div>
          <p class="text-xs text-muted-foreground">Each forecast is the trend through that environment's last 90 days with its day-of-week pattern. Sandbox and scratch usage draws on the production cards.</p>
        </div>

        <!-- About this data: the tables that are not in the cards -->
        <div v-if="aboutOpen" class="flex flex-col gap-4">
          <div v-if="result.byOrg?.length || result.orgError" class="space-y-1">
            <div class="text-sm font-medium">By org</div>
            <p v-if="result.orgError" class="text-xs text-destructive">Could not read usage per org: {{ result.orgError }}</p>
            <DataTable v-else :columns="orgCols" :rows="result.byOrg" :row-key="(r) => `${r.env}|${r.id}`" text-size="text-xs" box-class="max-h-80"><template #cell-total="{ value }">{{ n2(value) }}</template></DataTable>
            <p class="text-xs text-muted-foreground">Orgs this browser has connected to show their name; others show only their ID.</p>
          </div>
          <div class="grid md:grid-cols-2 gap-3">
            <div class="space-y-1"><div class="text-sm font-medium">By {{ fields.group || 'total' }}, last {{ days }} days{{ view === 'all' ? '' : `, ${view}` }}</div><DataTable :columns="groupCols" :rows="shown.groups" row-key="name" text-size="text-xs" box-class="max-h-80"><template #cell-total="{ value }">{{ n2(value) }}</template></DataTable></div>
            <div class="space-y-1"><div class="text-sm font-medium">Used to date</div><DataTable :columns="allCols" :rows="result.consumedAll" row-key="name" text-size="text-xs" box-class="max-h-80"><template #cell-total="{ value }">{{ n2(value) }}</template></DataTable></div>
          </div>
        </div>

        <p class="text-xs text-muted-foreground text-center">Read from <RouterLink :to="`/objects/${source}`" class="font-mono text-link hover:underline">{{ source }}</RouterLink><template v-if="result.resObject"> and <RouterLink :to="`/objects/${result.resObject}`" class="font-mono text-link hover:underline">{{ result.resObject }}</RouterLink></template> · 2 to 7 read-only queries per read. <button type="button" class="text-link hover:underline" @click="aboutOpen = !aboutOpen">{{ aboutOpen ? 'Hide' : 'Show' }} setup, SQL and the by-org tables</button></p>
      </template>
    </template>
  </section>
</template>
