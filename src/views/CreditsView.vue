<script setup>
// Credit prediction (feedback #145): how many Data Cloud credits the org used, per card or
// usage type, and a forecast from the recent daily burn. Reads the org's own consumption
// objects (Tenant...) with SQL, only when asked: each read is a query, which itself uses a
// few credits. The field guesses can be changed; nothing is written.
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
import { findCreditObjects, guessFields, dailySql, totalsSql, shapeDaily, forecast, balances, ROLES } from '../lib/credits.js'

const org = useOrg()
const catalog = useCatalog()
onMounted(() => ensureCatalog())

const found = computed(() => findCreditObjects(catalog.objects))
const sources = computed(() => found.value.filter((x) => x.role.use === 'consumption'))
const entSources = computed(() => found.value.filter((x) => x.role.use === 'entitlement'))
const sandbox = computed(() => /\.sandbox\./i.test(currentOrg()?.host || ''))

// Choices: the object and its fields (guessed, changeable), and how many days to read
const source = ref('')
const fields = ref({ date: '', amount: '', group: '', status: '' })
const ent = ref('')
const entFields = ref({ amount: '', group: '' })
const days = ref(180)
const objectOf = (name) => catalog.objects.find((o) => o.name === name)
watch(sources, (list) => { if (!list.some((x) => x.object.name === source.value)) source.value = list[0]?.object.name || '' }, { immediate: true })
watch(entSources, (list) => { if (!list.some((x) => x.object.name === ent.value)) ent.value = list[0]?.object.name || '' }, { immediate: true })
watch(source, (n) => { fields.value = guessFields(objectOf(n)) }, { immediate: true })
watch(ent, (n) => { const g = guessFields(objectOf(n)); entFields.value = { amount: g.amount, group: g.group } }, { immediate: true })
const fieldList = (name) => (objectOf(name)?.fields || []).map((f) => f.name)

// Reading
const busy = ref(false)
const error = ref('')
const result = ref(null) // { series, groups, consumedAll, entitlements, at, sql }
const sqlShown = ref(false)
const ready = computed(() => source.value && fields.value.date && fields.value.amount)
const sqlText = computed(() => {
  if (!ready.value) return ''
  const parts = [dailySql(source.value, fields.value, { days: days.value })]
  parts.push(totalsSql(source.value, fields.value))
  if (ent.value && entFields.value.amount) parts.push(totalsSql(ent.value, { ...entFields.value, date: '', status: '' }))
  return parts.join(';\n\n')
})

async function read() {
  if (!ready.value) return
  busy.value = true; error.value = ''; result.value = null
  const call = orgCall()
  try {
    const run = (sql) => runQuery(call, org.version, sql, { rowLimit: 5000 })
    const [d, all, e] = await Promise.all([
      run(dailySql(source.value, fields.value, { days: days.value })),
      run(totalsSql(source.value, fields.value)),
      ent.value && entFields.value.amount ? run(totalsSql(ent.value, { ...entFields.value, date: '', status: '' })).catch((err) => ({ error: err.message })) : null,
    ])
    const shaped = shapeDaily(d.rows, { days: days.value })
    const consumedAll = all.rows.map(([grp, total, first, last]) => ({ name: grp == null || grp === '' ? '(none)' : String(grp), total: Number(total) || 0, first: first || '', last: last || '' }))
    const entitlements = e?.rows ? e.rows.map(([grp, total]) => ({ name: grp == null || grp === '' ? '(none)' : String(grp), total: Number(total) || 0 })) : null
    result.value = { ...shaped, consumedAll, entitlements, entError: e?.error || '', at: new Date() }
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}
watch(() => [org.orgId, org.dataSpace], () => { result.value = null; error.value = '' })

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
const fc = computed(() => (result.value ? forecast(result.value.series, { remaining: remainingTotal.value }) : null))

// Chart: the last 90 days and 30 days ahead, one bar per day
const chart = computed(() => {
  if (!result.value || !fc.value) return null
  const past = result.value.series.slice(-90).map((p) => ({ ...p, ahead: false }))
  const ahead = fc.value.projected.slice(0, 30).map((p) => ({ ...p, ahead: true }))
  const bars = [...past, ...ahead]
  const max = Math.max(1, ...bars.map((b) => b.total))
  const W = 900, H = 200, pad = 24
  const bw = (W - pad) / bars.length
  return {
    W, H, max,
    bars: bars.map((b, i) => ({ ...b, x: pad + i * bw, w: Math.max(1, bw - 2), h: (b.total / max) * (H - 20), y: H - (b.total / max) * (H - 20) })),
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
  const f = fc.value
  const blocks = [
    { type: 'p', text: `${orgTitle(org.orgId)}, data space ${org.dataSpace || 'default'}. Read ${r.at.toLocaleString()} from ${source.value} (${fields.value.amount} by ${fields.value.date}${fields.value.group ? `, per ${fields.value.group}` : ''}), last ${days.value} days.` },
    { type: 'h', level: 2, text: 'Forecast' },
    { type: 'kv', rows: [
      ['Used, last 30 days', n2(f.last30)], ['Average per day (30 days)', n2(f.avg30)], ['Average per day (7 days)', n2(f.avg7)], ['Trend', f.trend],
      ['Next 30 days (projected)', n2(f.next30)], ['Next 90 days (projected)', n2(f.next90)], ['To the end of this month', n2(f.toMonthEnd)], ['To the end of this year', n2(f.toYearEnd)],
      ...(remainingTotal.value != null ? [['Left (purchased minus used)', n2(remainingTotal.value)], ['Runs out (at the 30-day rate)', f.runOutDate ? `${f.runOutDate}, in ${f.runOutDays} days` : 'not at this rate']] : []),
    ] },
    { type: 'h', level: 2, text: 'By card or usage type, this period' },
    { type: 'table', columns: ['Card or usage type', 'Used'], rows: r.groups.map((g) => [g.name, n2(g.total)]) },
  ]
  if (left.value.length) blocks.push({ type: 'h', level: 2, text: 'Purchased and left' }, { type: 'table', columns: ['Card', 'Purchased', 'Used', 'Left'], rows: left.value.map((b) => [b.name, n2(b.purchased), n2(b.consumed), n2(b.remaining)]) })
  blocks.push({ type: 'h', level: 2, text: 'Daily use' }, { type: 'table', columns: ['Day', 'Used'], rows: r.series.map((p) => [p.day, n2(p.total)]) })
  blocks.push({ type: 'p', text: 'The forecast is a straight line through the last 90 days of daily use. It is an estimate, not a bill: Salesforce\'s Digital Wallet is the record.' })
  return { title: `Data Cloud credits: ${orgName(org.orgId)}`, blocks }
}
const sheets = () => [
  { name: 'Daily', columns: ['Day', 'Used'], rows: result.value.series.map((p) => [p.day, p.total]) },
  { name: 'Projected', columns: ['Day', 'Projected'], rows: fc.value.projected.map((p) => [p.day, Math.round(p.total * 100) / 100]) },
  { name: 'By type', columns: ['Card or usage type', 'Used in period'], rows: result.value.groups.map((g) => [g.name, g.total]) },
  { name: 'To date', columns: ['Card or usage type', 'Used to date', 'From', 'To'], rows: result.value.consumedAll.map((g) => [g.name, g.total, g.first, g.last]) },
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

    <p v-if="sandbox" class="text-sm p-3 border rounded-md border-amber-400 bg-card">This is a sandbox. Credits are counted in production, so connect to the production org for the real figures; a sandbox's consumption objects, if any, describe the sandbox only.</p>

    <Loading v-if="catalog.loading && !catalog.objects.length" text="Looking for consumption objects" />
    <div v-else-if="!sources.length" class="text-sm p-3 border rounded-md bg-card space-y-2">
      <p>No consumption objects found in this org and data space.</p>
      <p class="text-muted-foreground">Credit prediction reads objects whose names start with: {{ ROLES.map((r) => r.match.source.replace(/\\/g, '')).join(', ') }} (for example <span class="font-mono">TenantDailyEntitlementConsumption__dll</span>). In production orgs they come from Salesforce's consumption data (Digital Wallet). If the org has them under another data space, switch it in the connection menu; if they were added just now, refresh Objects.</p>
    </div>

    <template v-else>
      <div class="border rounded-md bg-card p-3 space-y-3 text-sm">
        <div class="font-medium">Found in this org</div>
        <ul class="text-xs space-y-0.5">
          <li v-for="x in found" :key="x.object.name"><span class="text-muted-foreground">{{ x.role.label }}:</span> <RouterLink :to="`/objects/${x.object.name}`" class="font-mono text-link hover:underline">{{ x.object.name }}</RouterLink></li>
        </ul>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-1.5">Use <select v-model="source" :class="sel" aria-label="Consumption object"><option v-for="x in sources" :key="x.object.name" :value="x.object.name">{{ x.object.name }}</option></select></label>
          <label class="flex items-center gap-1.5">credits <select v-model="fields.amount" :class="sel" aria-label="Credits field"><option value="">Field…</option><option v-for="n in fieldList(source)" :key="n" :value="n">{{ n }}</option></select></label>
          <label class="flex items-center gap-1.5">by day of <select v-model="fields.date" :class="sel" aria-label="Date field"><option value="">Field…</option><option v-for="n in fieldList(source)" :key="n" :value="n">{{ n }}</option></select></label>
          <label class="flex items-center gap-1.5">per <select v-model="fields.group" :class="sel" aria-label="Group field"><option value="">nothing</option><option v-for="n in fieldList(source)" :key="n" :value="n">{{ n }}</option></select></label>
          <label class="flex items-center gap-1.5">last <select v-model.number="days" :class="sel" aria-label="Days"><option :value="90">90 days</option><option :value="180">180 days</option><option :value="365">365 days</option></select></label>
        </div>
        <div v-if="entSources.length" class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-1.5">Purchased from <select v-model="ent" :class="sel" aria-label="Entitlement object"><option value="">not used</option><option v-for="x in entSources" :key="x.object.name" :value="x.object.name">{{ x.object.name }}</option></select></label>
          <template v-if="ent">
            <label class="flex items-center gap-1.5">quantity <select v-model="entFields.amount" :class="sel" aria-label="Purchased quantity field"><option value="">Field…</option><option v-for="n in fieldList(ent)" :key="n" :value="n">{{ n }}</option></select></label>
            <label class="flex items-center gap-1.5">per <select v-model="entFields.group" :class="sel" aria-label="Purchased group field"><option value="">nothing</option><option v-for="n in fieldList(ent)" :key="n" :value="n">{{ n }}</option></select></label>
          </template>
        </div>
        <p v-if="fields.status" class="text-xs text-muted-foreground">Only rows with <span class="font-mono">{{ fields.status }} = 'PROCESSED'</span> are counted, as Salesforce advises for hourly data.</p>
        <div class="flex flex-wrap items-center gap-2">
          <button class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="busy || !ready" @click="read"><RefreshCw class="w-4 h-4" /> {{ result ? 'Read again' : 'Read consumption' }}</button>
          <button :class="btn" :disabled="!ready" @click="sqlShown = !sqlShown">{{ sqlShown ? 'Hide SQL' : 'Show SQL' }}</button>
          <span class="text-xs text-muted-foreground">Runs 2 or 3 read-only queries, which use a few query credits themselves.</span>
        </div>
        <SqlBlock v-if="sqlShown" :code="sqlText" box-class="max-h-72" />
      </div>

      <Loading v-if="busy" text="Reading consumption" />
      <p v-if="error" class="text-sm text-destructive whitespace-pre-wrap">{{ error }}</p>

      <template v-if="result && fc">
        <div class="flex items-center gap-2">
          <p class="text-xs text-muted-foreground">Read {{ result.at.toLocaleString() }}.</p>
          <span class="ml-auto"><DownloadMenu :get-doc="doc" :get-sheets="sheets" :file-name="`data-cloud-credits-${orgName(org.orgId)}`" /></span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="border rounded-md bg-card p-3"><div class="text-xs text-muted-foreground">Used, last 30 days</div><div class="text-xl font-semibold">{{ n0(fc.last30) }}</div><div class="text-xs text-muted-foreground">{{ n2(fc.avg30) }} a day; 7-day average {{ n2(fc.avg7) }}</div></div>
          <div class="border rounded-md bg-card p-3"><div class="text-xs text-muted-foreground">Next 30 days (projected)</div><div class="text-xl font-semibold">{{ n0(fc.next30) }}</div><div class="text-xs text-muted-foreground">trend {{ fc.trend }}; next 90 days {{ n0(fc.next90) }}</div></div>
          <div class="border rounded-md bg-card p-3"><div class="text-xs text-muted-foreground">To the end of the year (projected)</div><div class="text-xl font-semibold">{{ n0(fc.toYearEnd) }}</div><div class="text-xs text-muted-foreground">this month {{ n0(fc.toMonthEnd) }} more</div></div>
          <div class="border rounded-md bg-card p-3"><div class="text-xs text-muted-foreground">Left (purchased minus used)</div><div class="text-xl font-semibold">{{ remainingTotal == null ? '—' : n0(remainingTotal) }}</div><div class="text-xs text-muted-foreground">{{ remainingTotal == null ? (result.entError ? `could not read purchases: ${result.entError}` : 'no purchase data read') : fc.runOutDate ? `runs out around ${fc.runOutDate} (${fc.runOutDays} days)` : 'not used up at this rate' }}</div></div>
        </div>

        <figure v-if="chart" class="border rounded-md bg-card p-3">
          <figcaption class="text-sm font-medium mb-2">Credits per day: last 90 days, then 30 days projected</figcaption>
          <svg :viewBox="`0 0 ${chart.W} ${chart.H + 18}`" class="w-full h-auto" role="img" :aria-label="`Daily credits, highest ${n0(chart.max)} a day; projected next 30 days ${n0(fc.next30)}`">
            <line :x1="24" :x2="chart.W" :y1="chart.H" :y2="chart.H" class="stroke-border" />
            <text x="0" y="10" class="fill-muted-foreground text-[10px]">{{ n0(chart.max) }}</text>
            <text x="0" :y="chart.H" class="fill-muted-foreground text-[10px]">0</text>
            <line :x1="chart.split" :x2="chart.split" y1="0" :y2="chart.H" class="stroke-muted-foreground" stroke-dasharray="3 3" />
            <text :x="chart.split + 4" y="10" class="fill-muted-foreground text-[10px]">projected</text>
            <rect v-for="b in chart.bars" :key="b.day" :x="b.x" :y="b.y" :width="b.w" :height="Math.max(0, b.h)" rx="1" :class="b.ahead ? 'fill-primary/35' : 'fill-primary'"><title>{{ b.day }}: {{ n2(b.total) }}{{ b.ahead ? ' (projected)' : '' }}</title></rect>
            <text :x="24" :y="chart.H + 14" class="fill-muted-foreground text-[10px]">{{ chart.bars[0]?.day }}</text>
            <text :x="chart.W" :y="chart.H + 14" text-anchor="end" class="fill-muted-foreground text-[10px]">{{ chart.bars[chart.bars.length - 1]?.day }}</text>
          </svg>
          <p class="text-xs text-muted-foreground mt-1">Hover a bar for its day. The projection is a straight line through the last 90 days (today, still counting, is left out). An estimate, not a bill: the Digital Wallet in Setup is the record.</p>
        </figure>

        <div class="grid md:grid-cols-2 gap-3">
          <div class="space-y-1"><div class="text-sm font-medium">By {{ fields.group || 'total' }}, last {{ days }} days</div><DataTable :columns="groupCols" :rows="result.groups" row-key="name" text-size="text-xs" box-class="max-h-80"><template #cell-total="{ value }">{{ n2(value) }}</template></DataTable></div>
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
