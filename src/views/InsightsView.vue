<script setup>
import PageHeader from '../components/PageHeader.vue'
import { badgeClass } from '../lib/badges.js'
import DataTable from '../components/DataTable.vue'
import Loading from '../components/Loading.vue'
import HelpTip from '../components/HelpTip.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import { docFrom, sheetsFrom } from '../lib/tableDoc.js'
// Calculated insights as Data Cloud shows them: a list view, and a record page with Details,
// Dimensions and Measures, SQL, Data (a preview) and Used by.
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Calculator, ChevronRight, Database, ExternalLink, RefreshCw, Search } from 'lucide-vue-next'
import InsightDefinition from '../components/InsightDefinition.vue'
import ResultTable from '../components/ResultTable.vue'
import { useOrg, currentOrg, orgTitle } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, ensureRecordIds, ensureUsage, orgCall } from '../app/useCatalog.js'
import { insightPages, insightHealth, LEVEL_TEXT } from '../lib/health.js'
import { normalizeInsight, filterSql, FILTER_MAX } from '../lib/insights.js'
import { parseInputs } from '../lib/bulkLookup.js'
import { kindOf } from '../lib/resultView.js'
import { sqlRefs, usageOf } from '../lib/usage.js'
import { runQuery } from '../lib/query.js'
import { recordUrl } from '../lib/links.js'
import { orgCached } from '../lib/store.js'

const route = useRoute()
const router = useRouter()
const org = useOrg()
const catalog = useCatalog()
const insights = ref([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const status = ref('')
const tab = ref('details')
const preview = ref(null)
const previewError = ref('')
const previewing = ref(false)
const variant = ref('')

async function load({ refresh = false } = {}) {
  if (!org.version) return
  loading.value = true
  error.value = ''
  try {
    const key = `dci_s_${org.orgId}_${org.dataSpace || 'default'}_insights`
    const raw = await orgCached(key, 10 * 60 * 1000, () => insightPages(orgCall(), org.version), { refresh })
    insights.value = raw.map((r) => ({ ...normalizeInsight(r), health: insightHealth(r), dataSpace: r.dataSpace || '' })).sort((a, b) => a.label.localeCompare(b.label))
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
onMounted(() => { ensureCatalog(); load() })
watch(() => [org.orgId, org.version, org.dataSpace], () => { load(); ensureCatalog() })

const statuses = computed(() => [...new Set(insights.value.map((i) => i.status).filter(Boolean))].sort())
const list = computed(() => {
  const t = search.value.trim().toLowerCase()
  return insights.value.filter((i) => (!status.value || i.status === status.value) && (!t || i.label.toLowerCase().includes(t) || i.name.toLowerCase().includes(t)))
})
const listCols = [
  { key: 'label', label: 'Calculated Insight Name', value: (i) => `${i.label} ${i.name}`, sortValue: (i) => i.label },
  { key: 'dataSpace', label: 'Data Space' },
  { key: 'status', label: 'Status', value: (i) => cap(i.status) },
  { key: 'lastRun', label: 'Last Run Time', kind: 'date', value: (i) => when(i.lastRun), sortValue: (i) => i.lastRun || '', filter: false },
  { key: 'lastRunStatus', label: 'Last Run Status', value: (i) => cap(i.lastRunStatus) || 'Never' },
  { key: 'schedule', label: 'Schedule', value: (i) => cap(i.schedule) },
  { key: 'type', label: 'Insight Type', value: (i) => insightType(i.type) },
  { key: 'dimensions', label: 'Dimensions', align: 'right', kind: 'number', value: (i) => i.dimensions.length },
  { key: 'measures', label: 'Measures', align: 'right', kind: 'number', value: (i) => i.measures.length },
]
const ci = computed(() => insights.value.find((i) => i.name === route.params.name) || null)
const meta = computed(() => catalog.objects.find((o) => o.name === ci.value?.name) || null)
const variants = computed(() => (ci.value ? catalog.objects.filter((o) => o.name === ci.value.name || o.name.startsWith(`${ci.value.name}_`)).map((o) => o.name) : []))
const reads = computed(() => {
  if (!ci.value) return []
  return Object.entries(sqlRefs(ci.value.sql)).map(([object, fields]) => ({ object, fields: [...fields].sort() }))
})
const used = computed(() => (ci.value ? usageOf(ci.value.name, catalog.usage) : null))
const sfId = computed(() => catalog.recordIds?.[ci.value?.name] || null)

watch(() => route.params.name, () => {
  preview.value = null
  previewError.value = ''
  filterCol.value = ''
  filterText.value = ''
  filtered.value = null
  variant.value = ''
  if (!['details', 'fields', 'sql', 'data', 'usedby'].includes(tab.value)) tab.value = 'details'
})
// Wait for the API version: on a fresh page load the route is known before the org is.
watch(() => [route.params.name, org.version], ([n, v]) => { if (n && v) { ensureRecordIds(); ensureUsage() } }, { immediate: true })
watch(variants, (v) => { if (!variant.value && v.length) variant.value = v[0] })

const querySql = computed(() => {
  if (!ci.value) return ''
  const fields = [...ci.value.dimensions, ...ci.value.measures].map((f) => f.name)
  return `SELECT\n  ${fields.join(',\n  ') || '*'}\nFROM ${variant.value || ci.value.name}\nLIMIT 100`
})

// Filter the Data tab by values of one column (feedback #1040): pick the column, paste values,
// and the rows come from SQL built from them (also openable in a SQL tab).
const filterCol = ref('')
const filterText = ref('')
const filtered = ref(null) // { sql, count } of the filter shown, or null for the first 50 rows
const filterColumns = computed(() => {
  if (preview.value?.columns?.length) return preview.value.columns
  return ci.value ? [...ci.value.dimensions, ...ci.value.measures].map((f) => ({ name: f.name, type: f.type })) : []
})
const filterValues = computed(() => parseInputs(filterText.value, { as: 'field' }).map((x) => x.input))
const filterPlan = computed(() => {
  const col = filterColumns.value.find((c) => c.name === filterCol.value)
  return filterSql(variant.value || ci.value?.name, filterCol.value, filterValues.value, { numeric: kindOf(col?.type) === 'number' })
})
function runFilter() {
  if (filterPlan.value.error) return
  filtered.value = filterPlan.value
  loadPreview()
}
function clearFilter() {
  filterText.value = ''
  filtered.value = null
  loadPreview()
}

async function loadPreview() {
  previewing.value = true
  previewError.value = ''
  try {
    const f = filtered.value
    const r = f
      ? await runQuery(orgCall(), org.version, f.sql, { rowLimit: 2000 })
      : await runQuery(orgCall(), org.version, `SELECT * FROM ${variant.value || ci.value.name} LIMIT 50`, { rowLimit: 50 })
    preview.value = r
  } catch (err) {
    previewError.value = err.message
  } finally {
    previewing.value = false
  }
}
watch([tab, variant], ([t]) => {
  if (filtered.value && !filterPlan.value.error) filtered.value = filterPlan.value // the other table
  if (t === 'data' && ci.value) loadPreview()
})

// Data Cloud's own wording: "Active", "Calculated", "System Managed".
const cap = (v) => String(v || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const insightType = (t) => ({ CALCULATED_METRIC: 'Calculated', STREAMING_METRIC: 'Streaming', REAL_TIME: 'Real-Time' }[t] || cap(t))
const detailPairs = computed(() => (ci.value ? [
  ['Insight Name', ci.value.label],
  ['API Name', ci.value.name],
  ['Description', ci.value.description],
  ['Insight Type', insightType(ci.value.type)],
  ['Schedule', cap(ci.value.schedule)],
  ['Definition Status', cap(ci.value.definitionStatus)],
  ['Partitioned By', meta.value?.partitionBy || ''],
  ['Query Dialect', ci.value.dialect],
  ...(ci.value.lastRunError ? [['Last Run Error', ci.value.lastRunError]] : []),
  ...(ci.value.fromPackage ? [['Package', 'Installed from a package']] : []),
] : []))
const DOT = { fail: 'bg-red-500', warn: 'bg-amber-400', running: 'bg-sky-500', idle: 'bg-gray-400', ok: 'bg-green-500' }
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—')
const words = (s) => String(s || '').replace(/_/g, ' ').toLowerCase()
const tabBtn = (t) => ['dci-tab', tab.value === t ? 'is-on' : '']
const btn = 'dci-btn'

// Downloads (feedback #149): the list as filtered, and one insight
const listDoc = () => docFrom({ title: 'Calculated insights', intro: `${orgTitle(org.orgId)}, data space ${org.dataSpace || 'default'}. ${list.value.length} items.`, sections: [{ columns: listCols, rows: list.value }] })
const listSheets = () => sheetsFrom([{ heading: 'Calculated insights', columns: listCols, rows: list.value }])
const fieldCols = [{ key: 'name', label: 'Field' }, { key: 'label', label: 'Label' }, { key: 'role', label: 'Role' }, { key: 'type', label: 'Type' }, { key: 'aggregation', label: 'Aggregation' }, { key: 'formula', label: 'Formula' }]
function ciSections() {
  const c = ci.value
  return [
    { heading: 'Details', kv: [...detailPairs.value, ['Data Space', c.dataSpace], ['Status', cap(c.status)], ['Last Run Time', when(c.lastRun)], ['Last Run Status', cap(c.lastRunStatus) || 'Never']] },
    { heading: 'Dimensions', columns: fieldCols, rows: c.dimensions },
    { heading: 'Measures', columns: fieldCols, rows: c.measures },
    { heading: 'Expression', code: c.sql, lang: 'sql' },
    { heading: 'Reads from', list: reads.value.map((r) => `${r.object}${r.fields.length ? `: ${r.fields.join(', ')}` : ''}`) },
    ...(used.value ? [{ heading: 'Segments that use it', list: used.value.segments.map((s) => `${s.label} (${s.name})`) }] : []),
  ]
}
const ciDoc = () => docFrom({ title: `Calculated insight: ${ci.value.label}`, intro: `${ci.value.name} in ${orgTitle(org.orgId)}.`, sections: ciSections() })
</script>

<template>
  <!-- List view -->
  <section v-if="!route.params.name" class="max-w-7xl mx-auto space-y-5">
    <PageHeader path="/insights" eyebrow="Calculated insights" title="All calculated insights" topic="insights">Every calculated insight in the data space, when it last ran and how it is scheduled.</PageHeader>
    <div class="flex flex-wrap items-center gap-2">
      <p class="text-sm text-muted-foreground"><strong class="text-foreground">{{ list.length }}</strong> {{ list.length === 1 ? 'item' : 'items' }}</p>
      <div class="ml-auto flex flex-wrap items-center gap-2 text-sm">
        <label class="dci-search w-72"><Search class="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" /><input v-model="search" placeholder="Search this list" aria-label="Search this list" /></label>
        <select v-model="status" class="h-9 rounded-full border bg-card px-3 text-sm" aria-label="Status"><option value="">All statuses</option><option v-for="s in statuses" :key="s" :value="s">{{ words(s) }}</option></select>
        <button class="dci-btn-icon" title="Refresh" aria-label="Refresh" @click="load({ refresh: true })"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button>
        <DownloadMenu :get-doc="listDoc" :get-sheets="listSheets" file-name="calculated-insights" :disabled="!list.length" />
      </div>
    </div>
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    <DataTable :columns="listCols" :rows="list" row-key="name" row-class="hover:bg-accent" box-class="max-h-[calc(100vh-14rem)]" :empty="loading ? 'Loading…' : `No calculated insights${search || status ? ' match' : ' in this data space'}.`">
      <template #cell-label="{ row: i }"><RouterLink :to="`/insights/${i.name}`" class="text-link hover:underline">{{ i.label }}</RouterLink><div class="font-mono text-xs text-muted-foreground">{{ i.name }}</div></template>
      <template #cell-status="{ value }"><span :class="badgeClass(value)">{{ value }}</span></template>
      <template #cell-schedule="{ value }"><span v-if="value && !/not sched|none/i.test(value)" :class="badgeClass(`every ${value}`)">{{ value }}</span><span v-else class="text-muted-foreground">{{ value || 'Not scheduled' }}</span></template>
      <template #cell-lastRun="{ value }"><span class="whitespace-nowrap">{{ value }}</span></template>
      <template #cell-lastRunStatus="{ row: i, value }"><span class="inline-flex items-center gap-1.5 whitespace-nowrap"><span :class="['w-2 h-2 rounded-full', DOT[i.health.level]]" />{{ value }}</span></template>
    </DataTable>
  </section>

  <!-- Record page -->
  <section v-else class="max-w-7xl mx-auto space-y-5">
    <nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-[13px]">
      <RouterLink to="/insights" class="text-link font-medium hover:underline">Calculated insights</RouterLink>
      <ChevronRight class="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
      <span class="text-muted-foreground">{{ ci?.label || route.params.name }}</span>
    </nav>
    <Loading v-if="!ci && loading" text="Loading" />
    <p v-else-if="!ci" class="text-sm text-muted-foreground">This calculated insight is not in the selected data space.</p>
    <template v-else>
      <!-- Only the glow is clipped, so the Download menu can open past the card (feedback #1039). -->
      <section class="dci-card relative p-5 space-y-4 shadow-[0_14px_32px_-22px_rgba(124,58,237,0.5)]">
        <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]"><div class="absolute -top-12 left-16 w-[420px] h-[140px] rounded-[50%] bg-violet-600/10 blur-[44px]" /></div>
        <div class="relative flex flex-wrap items-start justify-between gap-4">
          <div class="flex items-center gap-3.5 min-w-0">
            <span class="w-12 h-12 shrink-0 rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 flex items-center justify-center"><Calculator class="w-6 h-6" aria-hidden="true" /></span>
            <div class="min-w-0">
              <div class="text-xs font-semibold text-violet-700 dark:text-violet-300">Calculated insight</div>
              <h1 class="text-2xl font-bold leading-[30px] break-words">{{ ci.label }}</h1>
              <code class="font-mono text-[13px] text-muted-foreground break-all">{{ ci.name }}</code>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button class="dci-btn-primary" @click="router.push({ path: '/sql', query: { sql: querySql } })"><Database class="w-4 h-4" /> Query in SQL</button>
            <DownloadMenu :get-doc="ciDoc" :get-sheets="() => sheetsFrom(ciSections())" :file-name="`insight-${ci.name}`" />
            <a v-if="sfId" class="dci-btn-icon" :href="recordUrl(currentOrg()?.host, sfId)" target="_blank" rel="noopener" title="Open in Salesforce" aria-label="Open in Salesforce"><ExternalLink class="w-4 h-4" /></a>
          </div>
        </div>
        <div class="relative flex flex-wrap gap-x-8 gap-y-3 pt-4 border-t text-sm">
          <div><div class="text-xs text-muted-foreground">Data space</div><div class="font-medium">{{ ci.dataSpace }}</div></div>
          <div><div class="text-xs text-muted-foreground">Status</div><span :class="badgeClass(cap(ci.status))">{{ cap(ci.status) }}</span></div>
          <div><div class="text-xs text-muted-foreground">Last run</div><div class="font-medium">{{ when(ci.lastRun) }}</div></div>
          <div><div class="text-xs text-muted-foreground">Last run status</div><span class="inline-flex items-center gap-1.5 font-medium"><span :class="['w-2 h-2 rounded-full', DOT[ci.health.level]]" />{{ cap(ci.lastRunStatus) || 'Never' }}</span></div>
          <div><div class="text-xs text-muted-foreground">Schedule</div><span :class="ci.schedule ? badgeClass(`every ${ci.schedule}`) : 'dci-badge'">{{ cap(ci.schedule) || 'Not scheduled' }}</span></div>
        </div>
      </section>

      <nav class="dci-tabs" aria-label="Insight sections">
        <button :class="tabBtn('details')" @click="tab = 'details'">Details</button>
        <button :class="tabBtn('sql')" @click="tab = 'sql'">Expression</button>
        <button :class="tabBtn('fields')" @click="tab = 'fields'">Output <span class="dci-count">{{ ci.dimensions.length + ci.measures.length }}</span></button>
        <button :class="tabBtn('data')" @click="tab = 'data'">Data</button>
        <button :class="tabBtn('usedby')" @click="tab = 'usedby'">Used by</button>
      </nav>

      <dl v-if="tab === 'details'" class="dci-card dci-kv px-6 pt-2 pb-3.5">
        <div v-for="[label, value] in detailPairs" :key="label">
          <dt>{{ label }}</dt>
          <dd><span v-if="!value" class="text-muted-foreground">—</span><code v-else-if="label === 'API Name' || label === 'Query Dialect'" class="font-mono text-[13px]">{{ value }}</code><span v-else-if="label === 'Definition Status'" :class="badgeClass(value)">{{ value }}</span><template v-else>{{ value }}</template></dd>
        </div>
      </dl>
      <InsightDefinition v-else-if="tab === 'sql' || tab === 'fields'" :ci="ci" :partition-by="meta?.partitionBy || ''" :show="tab" />

      <div v-else-if="tab === 'data'" class="space-y-2">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <label class="text-muted-foreground" for="ci-variant">Table</label>
          <select id="ci-variant" v-model="variant" class="border rounded-md px-2 py-1 bg-background font-mono text-xs">
            <option v-for="v in variants" :key="v" :value="v">{{ v }}</option>
          </select>
          <span class="text-xs text-muted-foreground">{{ filtered ? `Rows where ${filterCol} is one of ${filtered.count.toLocaleString()} value${filtered.count === 1 ? '' : 's'} (up to 2,000).` : 'First 50 rows.' }}</span>
          <button v-if="filtered" class="text-xs text-link hover:underline" @click="clearFilter">Show the first 50 rows</button>
          <button class="ml-auto text-xs text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: filtered ? filtered.sql : querySql } })">Open in a SQL tab</button>
        </div>
        <form class="dci-card p-3 space-y-2 text-sm" aria-label="Filter by column values" @submit.prevent="runFilter">
          <div class="flex flex-wrap items-center gap-2">
            <label class="font-medium" for="ci-filter-col">Filter by</label>
            <select id="ci-filter-col" v-model="filterCol" class="border rounded-md px-2 py-1 bg-background font-mono text-xs max-w-80">
              <option value="">Pick a column…</option>
              <option v-for="c in filterColumns" :key="c.name" :value="c.name">{{ c.name }}</option>
            </select>
            <span class="text-xs text-muted-foreground">Paste the values, one per line or separated by commas (up to {{ FILTER_MAX.toLocaleString() }}).</span>
          </div>
          <textarea v-model="filterText" rows="3" aria-label="Values" placeholder="e.g. a few individual IDs" class="w-full border rounded-md px-2 py-1.5 bg-background font-mono text-xs" @keydown.ctrl.enter.prevent="runFilter" @keydown.meta.enter.prevent="runFilter" />
          <div class="flex flex-wrap items-center gap-2">
            <button class="dci-btn-primary" :disabled="!!filterPlan.error || previewing">Run</button>
            <span v-if="filterValues.length" class="text-xs text-muted-foreground">{{ filterValues.length.toLocaleString() }} value{{ filterValues.length === 1 ? '' : 's' }}</span>
            <span v-if="filterPlan.error && (filterCol || filterText.trim())" class="text-xs text-muted-foreground">{{ filterPlan.error }}</span>
            <button v-if="!filterPlan.error" type="button" class="text-xs text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: filterPlan.sql } })">Open this SQL in a SQL tab</button>
          </div>
        </form>
        <Loading v-if="previewing" text="Loading rows…" />
        <p v-else-if="previewError" class="text-sm text-destructive">{{ previewError }}</p>
        <p v-else-if="preview && !preview.rows.length" class="text-sm text-muted-foreground">{{ filtered ? 'No rows have those values.' : 'No rows yet: the insight has not produced data.' }}</p>
        <ResultTable v-else-if="preview" :columns="preview.columns" :rows="preview.rows" />
      </div>

      <div v-else-if="tab === 'usedby'" class="grid lg:grid-cols-2 gap-4 text-sm">
        <div class="border rounded-xl bg-card">
          <h3 class="px-5 py-3.5 border-b text-base font-semibold">Reads from</h3>
          <div v-for="r in reads" :key="r.object" class="p-3 border-b last:border-0">
            <RouterLink :to="`/objects/${r.object}`" class="font-mono text-xs text-link hover:underline">{{ r.object }}</RouterLink>
            <div class="text-xs text-muted-foreground mt-0.5">{{ r.fields.length ? r.fields.join(', ') : 'the object' }}</div>
          </div>
          <p v-if="!reads.length" class="p-3 text-muted-foreground">No objects found in its SQL.</p>
        </div>
        <div class="border rounded-xl bg-card">
          <h3 class="px-5 py-3.5 border-b text-base font-semibold">Segments that use it</h3>
          <Loading v-if="!catalog.usage" text="Reading segments…" />
          <p v-else-if="!used?.segments.length" class="p-3 text-muted-foreground">No segment uses this insight.</p>
          <div v-for="s in used?.segments || []" :key="s.name" class="p-3 border-b last:border-0">
            <RouterLink :to="`/segments/${s.name}`" class="text-link hover:underline">{{ s.label }}</RouterLink>
            <div class="text-xs text-muted-foreground">{{ s.fields.length ? `criteria use ${s.fields.join(', ')}` : 'built on it' }}</div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
