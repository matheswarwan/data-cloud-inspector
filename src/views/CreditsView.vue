<script setup>
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
import { findCreditObjects, guessFields, dailySql, totalsSql, orgsSql, shapeDaily, shapeTotals, sortEnvs, envName, forecast, balances } from '../lib/credits.js'

const org = useOrg()
const catalog = useCatalog()
onMounted(() => ensureCatalog())

const found = computed(() => findCreditObjects(catalog.objects))
const sources = computed(() => found.value.filter((x) => x.role.use === 'consumption'))
const entSources = computed(() => found.value.filter((x) => x.role.use === 'entitlement'))
const sandbox = computed(() => /\.sandbox\./i.test(currentOrg()?.host || ''))

// Choices: the object and its fields (guessed, changeable), and how many days to read
const source = ref('')
const fields = ref({ date: '', amount: '', group: '', status: '', env: '', org: '' })
const ent = ref('')
const entFields = ref({ amount: '', group: '' })
const days = ref(180)
const objectOf = (name) => catalog.objects.find((o) => o.name === name)
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
const sqlText = computed(() => {
  if (!ready.value) return ''
  const parts = [dailySql(source.value, fields.value, { days: days.value })]
  parts.push(totalsSql(source.value, fields.value))
  if (fields.value.org) parts.push(orgsSql(source.value, fields.value))
  if (ent.value && entFields.value.amount) parts.push(totalsSql(ent.value, { ...entFields.value, date: '', status: '' }))
  return parts.join(';\n\n')
})

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
    const shaped = shapeDaily(d.rows, { days: days.value })
    const consumedAll = shapeTotals(all.rows)
    const byOrg = o?.rows ? o.rows.map(([env, id, total, first, last]) => ({ env: envName(env), id: id || '', total: Number(total) || 0, first: first || '', last: last || '' })) : null
    const entitlements = e?.rows ? shapeTotals(e.rows).map(({ name, total }) => ({ name, total })) : null
    result.value = { ...shaped, consumedAll, byOrg, orgError: o?.error || '', entitlements, entError: e?.error || '', at: new Date() }
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
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
</script>

<template>
  <section class="max-w-6xl mx-auto space-y-4">
    <div>
      <h2 class="text-lg font-semibold">Credit prediction <HelpTip topic="credits" /></h2>
      <p class="text-sm text-muted-foreground">How many Data Cloud credits this org used, by card or usage type, and where the recent daily use is heading. Read from the org's own consumption data with SQL.</p>
    </div>

    <p v-if="sandbox" class="text-sm p-3 border rounded-md border-amber-400 bg-card">This is a sandbox. The consumption objects exist only in production, and production's copy includes this sandbox's usage (environment Sandbox, with this org's ID). Connect to the production org and split by environment there.</p>

    <Loading v-if="catalog.loading && !catalog.objects.length" text="Looking for consumption objects" />
    <div v-else-if="!sources.length" class="text-sm p-3 border rounded-md bg-card space-y-2">
      <p class="font-medium">No consumption objects in this org and data space ({{ org.dataSpace || 'default' }}).</p>
      <p>Credit prediction reads Salesforce's consumption data (Digital Wallet) with SQL: objects such as <span class="font-mono">TenantDailyEntitlementConsumption__dll</span>. To turn them on:</p>
      <ol class="list-decimal ml-5 space-y-1">
        <li>Connect to the <b>production</b> org that holds the Data Cloud contract. Sandboxes and scratch orgs don't get these objects. Their usage is recorded in production, marked with its environment and org ID.</li>
        <li>In Setup, search for <b>Digital Wallet</b> and open it. If it asks you to finish setting it up, do so. Digital Wallet setup creates the consumption data streams and data lake objects: TenantDailyEntitlementConsumption, TenantHourlyEntitlementConsumption, TenantEnrichedUsageEvent, TenantBillingUsageEvent, TenantEntitlementTransaction, TenantUsageTypeMultiplier and TenantUsageAttrDetail.</li>
        <li>Add them to a data space. Digital Wallet itself works without one, but SQL can only read objects in a data space. In Data Cloud Setup, open <b>Data Spaces</b>, choose a data space (usually default) and add the Tenant data lake objects.</li>
        <li>Your user needs access to that data space, through a Data Cloud permission set that includes it.</li>
        <li>The data is refreshed several times a day, and the first load can take a while. When the objects show up, pick that data space in the connection menu and refresh Objects (or reload this page).</li>
      </ol>
      <p class="text-muted-foreground">Salesforce Help: "Digital Wallet Data Lake Objects (DLOs)" lists the objects and their fields.</p>
    </div>

    <template v-else>
      <div class="border rounded-md bg-card p-3 space-y-3 text-sm">
        <div class="font-medium">Found in this org</div>
        <ul class="text-xs space-y-0.5">
          <li v-for="x in found" :key="x.object.name"><span class="text-muted-foreground">{{ x.role.label }}:</span> <RouterLink :to="`/objects/${x.object.name}`" class="font-mono text-link hover:underline">{{ x.object.name }}</RouterLink></li>
        </ul>
        <details v-if="missing.length" class="text-xs">
          <summary class="cursor-pointer text-muted-foreground">Not found: {{ missing.map((id) => id === 'daily' ? 'daily consumption' : 'purchases (entitlement transactions)').join(' and ') }}. How to add them</summary>
          <div class="mt-2 space-y-2"><ol class="list-decimal ml-5 space-y-1">
        <li>Connect to the <b>production</b> org that holds the Data Cloud contract. Sandboxes and scratch orgs don't get these objects. Their usage is recorded in production, marked with its environment and org ID.</li>
        <li>In Setup, search for <b>Digital Wallet</b> and open it. If it asks you to finish setting it up, do so. Digital Wallet setup creates the consumption data streams and data lake objects: TenantDailyEntitlementConsumption, TenantHourlyEntitlementConsumption, TenantEnrichedUsageEvent, TenantBillingUsageEvent, TenantEntitlementTransaction, TenantUsageTypeMultiplier and TenantUsageAttrDetail.</li>
        <li>Add them to a data space. Digital Wallet itself works without one, but SQL can only read objects in a data space. In Data Cloud Setup, open <b>Data Spaces</b>, choose a data space (usually default) and add the Tenant data lake objects.</li>
        <li>Your user needs access to that data space, through a Data Cloud permission set that includes it.</li>
        <li>The data is refreshed several times a day, and the first load can take a while. When the objects show up, pick that data space in the connection menu and refresh Objects (or reload this page).</li>
      </ol>
      <p class="text-muted-foreground">Salesforce Help: "Digital Wallet Data Lake Objects (DLOs)" lists the objects and their fields.</p></div>
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
        <div class="flex flex-wrap items-center gap-2">
          <button class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="busy || !ready" @click="read"><RefreshCw class="w-4 h-4" /> {{ result ? 'Read again' : 'Read consumption' }}</button>
          <button :class="btn" :disabled="!ready" @click="sqlShown = !sqlShown">{{ sqlShown ? 'Hide SQL' : 'Show SQL' }}</button>
          <span class="text-xs text-muted-foreground">Runs 2 to 4 read-only queries, which use a few query credits themselves.</span>
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
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="border rounded-md bg-card p-3"><div class="text-xs text-muted-foreground">Used, last 30 days</div><div class="text-xl font-semibold">{{ n0(fc.last30) }}</div><div class="text-xs text-muted-foreground">{{ n2(fc.avg30) }} a day; 7-day average {{ n2(fc.avg7) }}</div></div>
          <div class="border rounded-md bg-card p-3"><div class="text-xs text-muted-foreground">Next 30 days (projected)</div><div class="text-xl font-semibold">{{ n0(fc.next30) }}</div><div class="text-xs text-muted-foreground">trend {{ fc.trend }}; next 90 days {{ n0(fc.next90) }}</div></div>
          <div class="border rounded-md bg-card p-3"><div class="text-xs text-muted-foreground">To the end of the year (projected)</div><div class="text-xl font-semibold">{{ n0(fc.toYearEnd) }}</div><div class="text-xs text-muted-foreground">this month {{ n0(fc.toMonthEnd) }} more</div></div>
          <div class="border rounded-md bg-card p-3"><div class="text-xs text-muted-foreground">Left (purchased minus used, all environments)</div><div class="text-xl font-semibold">{{ remainingTotal == null ? '—' : n0(remainingTotal) }}</div><div class="text-xs text-muted-foreground">{{ view !== 'all' && remainingTotal != null ? 'shared by every environment; run-out date under All environments' : remainingTotal == null ? (result.entError ? `could not read purchases: ${result.entError}` : 'no purchase data read') : fc.runOutDate ? `runs out around ${fc.runOutDate} (${fc.runOutDays} days)` : 'not used up at this rate' }}</div></div>
        </div>

        <figure v-if="chart" class="border rounded-md bg-card p-3">
          <figcaption class="text-sm font-medium mb-2 flex flex-wrap items-center gap-3">
            <span>Credits per day{{ view === 'all' ? '' : `, ${view} only` }}: last 90 days, then 30 days projected</span>
            <span v-if="chart.stacked" class="flex items-center gap-3 text-xs font-normal text-muted-foreground"><span v-for="e in envList" :key="e" class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full" :class="envDot(e)"></span>{{ e }}</span></span>
          </figcaption>
          <svg :viewBox="`0 0 ${chart.W} ${chart.H + 18}`" class="w-full h-auto" role="img" :aria-label="`Daily credits, highest ${n0(chart.max)} a day; projected next 30 days ${n0(fc.next30)}`">
            <line :x1="24" :x2="chart.W" :y1="chart.H" :y2="chart.H" class="stroke-border" />
            <text x="0" y="10" class="fill-muted-foreground text-[10px]">{{ n0(chart.max) }}</text>
            <text x="0" :y="chart.H" class="fill-muted-foreground text-[10px]">0</text>
            <line :x1="chart.split" :x2="chart.split" y1="0" :y2="chart.H" class="stroke-muted-foreground" stroke-dasharray="3 3" />
            <text :x="chart.split + 4" y="10" class="fill-muted-foreground text-[10px]">projected</text>
            <g v-for="b in chart.bars" :key="b.day">
              <title>{{ b.day }}: {{ n2(b.total) }}{{ b.ahead ? ' (projected)' : chart.stacked ? ` (${b.parts.filter((p) => p.total).map((p) => `${p.env} ${n2(p.total)}`).join(', ')})` : '' }}</title>
              <rect v-for="(sg, i) in b.segs" :key="i" :x="b.x" :y="sg.y" :width="b.w" :height="Math.max(0, sg.h)" rx="1" :class="envFill(sg.env, b.ahead)" />
              <rect :x="b.x" y="0" :width="b.w" :height="chart.H" fill="transparent" />
            </g>
            <text :x="24" :y="chart.H + 14" class="fill-muted-foreground text-[10px]">{{ chart.bars[0]?.day }}</text>
            <text :x="chart.W" :y="chart.H + 14" text-anchor="end" class="fill-muted-foreground text-[10px]">{{ chart.bars[chart.bars.length - 1]?.day }}</text>
          </svg>
          <p class="text-xs text-muted-foreground mt-1">Hover a bar for its day. The projection is a straight line through the last 90 days (today, still counting, is left out). An estimate, not a bill: the Digital Wallet in Setup is the record.</p>
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
      </template>
    </template>
  </section>
</template>
