<script setup>
import PageHeader from '../components/PageHeader.vue'
// Credit prediction (feedback #145): how many Data Cloud credits the org used, per card or
// usage type, and a forecast from the recent daily burn. Reads the org's own consumption
// objects (Tenant...) with SQL, only when asked: each read is a query, which itself uses a
// few credits. The field guesses can be changed; nothing is written. The objects live in
// production but count sandbox usage too, so every figure can be split by environment and
// by the org that used it. Without the objects, the page says how to turn them on.
import { ref, computed, watch, onMounted } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import HelpTip from '../components/HelpTip.vue'
import Loading from '../components/Loading.vue'
import DataTable from '../components/DataTable.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import SqlBlock from '../components/SqlBlock.vue'
import { useOrg, currentOrg, orgName, orgTitle } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall } from '../app/useCatalog.js'
import { runQuery } from '../lib/query.js'
import { findCreditObjects, probeCreditObjects, guessFields, dailySql, totalsSql, orgsSql, shapeDaily, shapeTotals, sortEnvs, envName, forecast, balances, creditPrice, setCreditPrice, moneyText, multipliersSql } from '../lib/credits.js'

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
async function probe() {
  const key = `${org.orgId}|${org.dataSpace}`
  probing.value = true
  try {
    const list = await probeCreditObjects((sql) => runQuery(orgCall(), org.version, sql, { rowLimit: 1 }))
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
  await probe()
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
  if (multObject.value) parts.push(multipliersSql(multObject.value))
  return parts.join(';\n\n')
})

// The usage type multipliers (rate card), read as stored when Digital Wallet has the DLO (feedback #1042).
const multObject = computed(() => found.value.find((x) => x.role.id === 'multipliers')?.object.name || '')

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
    const m = multObject.value ? await run(multipliersSql(multObject.value)).catch((err) => ({ error: err.message })) : null
    const shaped = shapeDaily(d.rows, { days: days.value })
    const consumedAll = shapeTotals(all.rows)
    const byOrg = o?.rows ? o.rows.map(([env, id, total, first, last]) => ({ env: envName(env), id: id || '', total: Number(total) || 0, first: first || '', last: last || '' })) : null
    const entitlements = e?.rows ? shapeTotals(e.rows).map(({ name, total }) => ({ name, total })) : null
    result.value = { ...shaped, consumedAll, byOrg, orgError: o?.error || '', entitlements, entError: e?.error || '', multipliers: m, at: new Date() }
    if (!(view.value in shaped.envs)) view.value = 'all'
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}
watch(() => [org.orgId, org.dataSpace], () => { result.value = null; error.value = '' })

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
const money = (credits) => moneyText(credits, price.value)
const multCols = computed(() => (result.value?.multipliers?.columns || []).map((c, i) => ({ key: String(i), label: c.name, value: (r) => r[i] })))

// Chart: the last 90 days and 30 days ahead, one bar per day
const chart = computed(() => {
  if (!shown.value || !fc.value) return null
  const stacked = view.value === 'all' && envList.value.length > 1
  const perEnv = (day) => envList.value.map((e) => ({ env: e, total: result.value.envs[e].series.find((p) => p.day === day)?.total || 0 }))
  const past = shown.value.series.slice(-90).map((p) => ({ ...p, ahead: false, parts: stacked ? perEnv(p.day) : [{ env: view.value === 'all' ? envList.value[0] : view.value, total: p.total }] }))
  const ahead = fc.value.projected.slice(0, 30).map((p) => ({ ...p, ahead: true, parts: [{ env: '', total: p.total }] }))
  const bars = [...past, ...ahead]
  const max = Math.max(1, ...bars.map((b) => b.total))
  const W = 900, H = 200, pad = 24
  const bw = (W - pad) / bars.length
  return {
    W, H, max,
    bars: bars.map((b, i) => {
      let top = H
      const segs = b.parts.filter((p) => p.total > 0).map((p) => { const h = (p.total / max) * (H - 20); top -= h; return { env: p.env, total: p.total, y: top, h } })
      return { ...b, x: pad + i * bw, w: Math.max(1, bw - 2), segs }
    }),
    stacked,
    split: pad + past.length * bw,
  }
})
// The day under the pointer, with what used its credits (feedback #1042).
const hoverIdx = ref(-1)
const hoverBar = computed(() => chart.value?.bars[hoverIdx.value] || null)
const hoverLeft = computed(() => (hoverBar.value ? ((hoverBar.value.x + hoverBar.value.w / 2) / chart.value.W) * 100 : 0))
const share = (part, total) => (total ? `${Math.round((part / total) * 100)}%` : '')

const n0 = (v) => (v == null ? '—' : Math.round(v).toLocaleString())
const n2 = (v) => (v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }))
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
const leftCols = [
  { key: 'name', label: 'Card' },
  { key: 'purchased', label: 'Purchased', kind: 'number', align: 'right' },
  { key: 'consumed', label: 'Used', kind: 'number', align: 'right' },
  { key: 'remaining', label: 'Left', kind: 'number', align: 'right' },
]

function doc() {
  const r = result.value
  const v = shown.value
  const f = fc.value
  const scope = view.value === 'all' ? 'all environments' : `${view.value} only`
  const blocks = [
    { type: 'p', text: `${orgTitle(org.orgId)}, data space ${org.dataSpace || 'default'}. Read ${r.at.toLocaleString()} from ${source.value} (${fields.value.amount} by ${fields.value.date}${fields.value.group ? `, per ${fields.value.group}` : ''}${fields.value.env ? `, environment from ${fields.value.env}` : ''}), last ${days.value} days. Figures: ${scope}.` },
  ]
  if (envRows.value.length) blocks.push({ type: 'h', level: 2, text: 'By environment' }, { type: 'table', columns: ['Environment', 'Last 30 days', 'A day', 'Trend', 'Next 30 days', 'To year end', 'Used to date'], rows: envRows.value.map((x) => [x.env, n2(x.last30), n2(x.avg30), x.trend, n2(x.next30), n2(x.toYearEnd), n2(x.toDate)]) })
  if (r.byOrg?.length) blocks.push({ type: 'h', level: 2, text: 'By org' }, { type: 'table', columns: ['Environment', 'Org', 'Org ID', 'Used to date', 'From', 'To'], rows: r.byOrg.map((x) => [x.env, orgShown(x.id), x.id, n2(x.total), String(x.first).slice(0, 10), String(x.last).slice(0, 10)]) })
  blocks.push(
    { type: 'h', level: 2, text: `Forecast (${scope})` },
    { type: 'kv', rows: [
      ['Used, last 30 days', n2(f.last30)], ['Average per day (30 days)', n2(f.avg30)], ['Average per day (7 days)', n2(f.avg7)], ['Trend', f.trend],
      ['Next 30 days (projected)', n2(f.next30)], ['Next 90 days (projected)', n2(f.next90)], ['To the end of this month', n2(f.toMonthEnd)], ['To the end of this year', n2(f.toYearEnd)],
      ...(remainingTotal.value != null && view.value === 'all' ? [['Left (purchased minus used)', n2(remainingTotal.value)], ['Runs out (at the 30-day rate)', f.runOutDate ? `${f.runOutDate}, in ${f.runOutDays} days` : 'not at this rate']] : []),
    ] },
    { type: 'h', level: 2, text: 'By card or usage type, this period' },
    { type: 'table', columns: ['Card or usage type', 'Used'], rows: v.groups.map((g) => [g.name, n2(g.total)]) },
  )
  if (left.value.length) blocks.push({ type: 'h', level: 2, text: 'Purchased and left' }, { type: 'table', columns: ['Card', 'Purchased', 'Used', 'Left'], rows: left.value.map((b) => [b.name, n2(b.purchased), n2(b.consumed), n2(b.remaining)]) })
  const envCols2 = envList.value.length > 1 ? envList.value : []
  blocks.push({ type: 'h', level: 2, text: 'Daily use' }, { type: 'table', columns: ['Day', 'Used', ...envCols2], rows: r.series.map((p, i) => [p.day, n2(p.total), ...envCols2.map((e) => n2(r.envs[e].series[i]?.total))]) })
  blocks.push({ type: 'p', text: 'The forecast is a straight line through the last 90 days of daily use. Sandbox usage draws on the production cards, so what is left is shared. It is an estimate, not a bill: Salesforce\'s Digital Wallet is the record.' })
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
  <section class="max-w-6xl mx-auto space-y-4">
    <div>
      <PageHeader path="/credits" title="Credit prediction" topic="credits">How many Data Cloud credits this org used, by card or usage type, and where the recent daily use is heading. Read from the org's own consumption data with SQL.</PageHeader>
    </div>

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
      <div class="border rounded-xl bg-card p-3 space-y-3 text-sm">
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
          <button class="dci-btn-primary" :disabled="busy || !ready" @click="read"><RefreshCw class="w-4 h-4" /> {{ result ? 'Read again' : 'Read consumption' }}</button>
          <button :class="btn" :disabled="!ready" @click="sqlShown = !sqlShown">{{ sqlShown ? 'Hide SQL' : 'Show SQL' }}</button>
          <span class="text-xs text-muted-foreground">Runs 2 to 5 read-only queries, which use a few query credits themselves.</span>
        </div>
        <SqlBlock v-if="sqlShown" :code="sqlText" box-class="max-h-72" />
      </div>

      <Loading v-if="busy" text="Reading consumption" />
      <p v-if="error" class="text-sm text-destructive whitespace-pre-wrap">{{ error }}</p>

      <template v-if="result && fc">
        <div class="flex flex-wrap items-center gap-2">
          <div v-if="envList.length > 1" class="flex rounded-md border overflow-hidden text-sm" role="group" aria-label="Environment">
            <button v-for="e in ['all', ...envList]" :key="e" class="px-2.5 py-1 inline-flex items-center gap-1.5" :class="view === e ? 'bg-accent font-medium' : 'hover:bg-accent/50'" :aria-pressed="view === e" @click="view = e"><span v-if="e !== 'all'" class="w-2 h-2 rounded-full" :class="envDot(e)"></span>{{ e === 'all' ? 'All environments' : e }}</button>
          </div>
          <span v-else-if="envList.length === 1 && fields.env" class="text-xs text-muted-foreground">Only {{ envList[0] }} usage in this period.</span>
          <p class="text-xs text-muted-foreground">Read {{ result.at.toLocaleString() }}.</p>
          <span class="ml-auto"><DownloadMenu :get-doc="doc" :get-sheets="sheets" :file-name="`data-cloud-credits-${orgName(org.orgId)}`" /></span>
        </div>
        <form class="flex flex-wrap items-center gap-2 text-sm" aria-label="Price per credit" @submit.prevent="savePrice">
          <label class="flex items-center gap-1.5">Price per credit
            <input v-model="priceInput" inputmode="decimal" placeholder="e.g. 0.001" class="w-28 border rounded-md px-2 py-1 bg-background" aria-label="Price per credit" @change="savePrice" />
          </label>
          <select v-model="currency" :class="sel" aria-label="Currency" @change="savePrice"><option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option></select>
          <span class="text-xs text-muted-foreground">{{ price ? `Money figures use ${price.price} ${price.currency} a credit (${moneyText(1000, price)} per 1,000 credits), saved for this org in this browser.` : 'From your Salesforce contract (Salesforce does not show the price to the API). Leave empty for credits only.' }}</span>
          <HelpTip topic="credits-price" />
        </form>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="border rounded-xl bg-card p-3"><div class="text-xs text-muted-foreground">Used, last 30 days</div><div class="text-xl font-semibold">{{ n0(fc.last30) }}</div><div v-if="price" class="text-sm font-medium">{{ money(fc.last30) }}</div><div class="text-xs text-muted-foreground">{{ n2(fc.avg30) }} a day; 7-day average {{ n2(fc.avg7) }}</div></div>
          <div class="border rounded-xl bg-card p-3"><div class="text-xs text-muted-foreground">Next 30 days (projected)</div><div class="text-xl font-semibold">{{ n0(fc.next30) }}</div><div v-if="price" class="text-sm font-medium">{{ money(fc.next30) }}</div><div class="text-xs text-muted-foreground">trend {{ fc.trend }}; next 90 days {{ n0(fc.next90) }}</div></div>
          <div class="border rounded-xl bg-card p-3"><div class="text-xs text-muted-foreground">To the end of the year (projected)</div><div class="text-xl font-semibold">{{ n0(fc.toYearEnd) }}</div><div v-if="price" class="text-sm font-medium">{{ money(fc.toYearEnd) }}</div><div class="text-xs text-muted-foreground">this month {{ n0(fc.toMonthEnd) }} more</div></div>
          <div class="border rounded-xl bg-card p-3"><div class="text-xs text-muted-foreground">Left (purchased minus used, all environments)</div><div class="text-xl font-semibold">{{ remainingTotal == null ? '—' : n0(remainingTotal) }}</div><div v-if="price && remainingTotal != null" class="text-sm font-medium">{{ money(remainingTotal) }}</div><div class="text-xs text-muted-foreground">{{ view !== 'all' && remainingTotal != null ? 'shared by every environment; run-out date under All environments' : remainingTotal == null ? (result.entError ? `could not read purchases: ${result.entError}` : 'no purchase data read') : fc.runOutDate ? `runs out around ${fc.runOutDate} (${fc.runOutDays} days)` : 'not used up at this rate' }}</div></div>
        </div>

        <figure v-if="chart" class="border rounded-xl bg-card p-3">
          <figcaption class="text-sm font-medium mb-2 flex flex-wrap items-center gap-3">
            <span>Credits per day{{ view === 'all' ? '' : `, ${view} only` }}: last 90 days, then 30 days projected</span>
            <span v-if="chart.stacked" class="flex items-center gap-3 text-xs font-normal text-muted-foreground"><span v-for="e in envList" :key="e" class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full" :class="envDot(e)"></span>{{ e }}</span></span>
          </figcaption>
          <div class="relative" @mouseleave="hoverIdx = -1">
          <svg :viewBox="`0 0 ${chart.W} ${chart.H + 18}`" class="w-full h-auto" role="img" :aria-label="`Daily credits, highest ${n0(chart.max)} a day; projected next 30 days ${n0(fc.next30)}`">
            <line :x1="24" :x2="chart.W" :y1="chart.H" :y2="chart.H" class="stroke-border" />
            <text x="0" y="10" class="fill-muted-foreground text-[10px]">{{ n0(chart.max) }}</text>
            <text x="0" :y="chart.H" class="fill-muted-foreground text-[10px]">0</text>
            <line :x1="chart.split" :x2="chart.split" y1="0" :y2="chart.H" class="stroke-muted-foreground" stroke-dasharray="3 3" />
            <text :x="chart.split + 4" y="10" class="fill-muted-foreground text-[10px]">projected</text>
            <g v-for="(b, i) in chart.bars" :key="b.day" :opacity="hoverIdx >= 0 && hoverIdx !== i ? 0.55 : 1">
              <rect v-for="(sg, j) in b.segs" :key="j" :x="b.x" :y="sg.y" :width="b.w" :height="Math.max(0, sg.h)" rx="1" :class="envFill(sg.env, b.ahead)" />
              <rect :x="b.x - 1" y="0" :width="b.w + 2" :height="chart.H" fill="transparent" @mouseenter="hoverIdx = i" />
            </g>
            <text :x="24" :y="chart.H + 14" class="fill-muted-foreground text-[10px]">{{ chart.bars[0]?.day }}</text>
            <text :x="chart.W" :y="chart.H + 14" text-anchor="end" class="fill-muted-foreground text-[10px]">{{ chart.bars[chart.bars.length - 1]?.day }}</text>
          </svg>
          <div
            v-if="hoverBar" class="absolute top-0 z-20 w-72 rounded-lg border bg-popover text-popover-foreground shadow-lg p-2.5 text-xs pointer-events-none"
            :style="{ left: `clamp(0px, calc(${hoverLeft}% - 9rem), calc(100% - 18rem))`, transform: 'translateY(-100%)' }" aria-live="polite"
          >
            <div class="flex items-baseline justify-between gap-2"><span class="font-semibold text-sm">{{ n2(hoverBar.total) }} credits</span><span v-if="money(hoverBar.total)" class="font-medium">{{ money(hoverBar.total) }}</span></div>
            <div class="text-muted-foreground">{{ hoverBar.day }}{{ hoverBar.ahead ? ', projected from the trend' : '' }}</div>
            <template v-if="!hoverBar.ahead">
              <div v-if="chart.stacked" class="mt-1.5 space-y-0.5">
                <div v-for="p in hoverBar.parts.filter((x) => x.total)" :key="p.env" class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full shrink-0" :class="envDot(p.env)"></span><span class="flex-1">{{ p.env }}</span><span class="tabular-nums">{{ n2(p.total) }}</span></div>
              </div>
              <div v-if="hoverBar.groups?.length" class="mt-2">
                <div class="text-muted-foreground mb-0.5">{{ fields.group ? 'Used by' : 'Total' }}</div>
                <div v-for="g in hoverBar.groups.slice(0, 8)" :key="g.name" class="flex items-baseline gap-2">
                  <span class="flex-1 min-w-0 truncate" :title="g.name">{{ g.name }}</span>
                  <span class="tabular-nums">{{ n2(g.total) }}</span>
                  <span class="w-9 text-right text-muted-foreground tabular-nums">{{ share(g.total, hoverBar.total) }}</span>
                  <span v-if="price" class="w-16 text-right tabular-nums">{{ money(g.total) }}</span>
                </div>
                <div v-if="hoverBar.groups.length > 8" class="text-muted-foreground">and {{ hoverBar.groups.length - 8 }} more</div>
              </div>
              <div v-else-if="!hoverBar.total" class="mt-1 text-muted-foreground">No credits used.</div>
            </template>
            <div v-if="!price" class="mt-2 text-muted-foreground">Set a price per credit above the chart for money estimates.</div>
          </div>
          </div>
          <p class="text-xs text-muted-foreground mt-1">Hover a bar for its day and what used the credits. The projection is a straight line through the last 90 days (today, still counting, is left out). An estimate, not a bill: the Digital Wallet in Setup is the record.</p>
        </figure>

        <div v-if="fields.env && envRows.length" class="space-y-1">
          <div class="text-sm font-medium">By environment</div>
          <DataTable :columns="envCols" :rows="envRows" row-key="env" text-size="text-xs">
            <template #cell-env="{ value }"><span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" :class="envDot(value)"></span>{{ value }}</span></template>
            <template #cell-last30="{ value }">{{ n2(value) }}</template><template #cell-avg30="{ value }">{{ n2(value) }}</template><template #cell-next30="{ value }">{{ n2(value) }}</template><template #cell-toYearEnd="{ value }">{{ n2(value) }}</template><template #cell-toDate="{ value }">{{ n2(value) }}</template>
          </DataTable>
          <p class="text-xs text-muted-foreground">Each environment's forecast is a straight line through its own last 90 days. Sandbox and scratch usage draws on the production cards.</p>
        </div>
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
        <div v-if="left.length" class="space-y-1">
          <div class="text-sm font-medium">Purchased and left</div>
          <DataTable :columns="leftCols" :rows="left" row-key="name" text-size="text-xs" box-class="max-h-80">
            <template #cell-purchased="{ value }">{{ n2(value) }}</template><template #cell-consumed="{ value }">{{ n2(value) }}</template><template #cell-remaining="{ value }">{{ n2(value) }}</template>
          </DataTable>
          <p class="text-xs text-muted-foreground">Left is purchased minus used for cards whose names match on both sides; check signs and units against the Digital Wallet before relying on it.</p>
        </div>
        <div class="space-y-1">
          <div class="text-sm font-medium">Usage type multipliers (rate card)</div>
          <p v-if="!multObject" class="text-xs text-muted-foreground">Not found: Digital Wallet's TenantUsageTypeMultiplier DLO is not in this data space. It lists how many credits each unit of usage costs; add its stream in Digital Wallet setup to see it here.</p>
          <p v-else-if="result.multipliers?.error" class="text-xs text-destructive">Could not read {{ multObject }}: {{ result.multipliers.error }}</p>
          <template v-else-if="result.multipliers">
            <DataTable :columns="multCols" :rows="result.multipliers.rows" text-size="text-xs" box-class="max-h-80" empty="No multipliers stored." />
            <p class="text-xs text-muted-foreground">From <RouterLink :to="`/objects/${multObject}`" class="font-mono text-link hover:underline">{{ multObject }}</RouterLink>, as stored: credits = usage × multiplier.</p>
          </template>
        </div>
      </template>
    </template>
  </section>
</template>
