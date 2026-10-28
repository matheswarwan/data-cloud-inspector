<script setup>
import DataTable from '../components/DataTable.vue'
import Loading from '../components/Loading.vue'
import HelpTip from '../components/HelpTip.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import { docFrom, sheetsFrom } from '../lib/tableDoc.js'
// Calculated insights as Data Cloud shows them: a list view, and a record page with Details,
// Dimensions and Measures, SQL, Data (a preview) and Used by.
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import InsightDefinition from '../components/InsightDefinition.vue'
import ResultTable from '../components/ResultTable.vue'
import { useOrg, currentOrg, orgTitle } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, ensureRecordIds, ensureUsage, orgCall } from '../app/useCatalog.js'
import { insightPages, insightHealth, LEVEL_TEXT } from '../lib/health.js'
import { normalizeInsight } from '../lib/insights.js'
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

async function loadPreview() {
  previewing.value = true
  previewError.value = ''
  try {
    const r = await runQuery(orgCall(), org.version, `SELECT * FROM ${variant.value || ci.value.name} LIMIT 50`, { rowLimit: 50 })
    preview.value = r
  } catch (err) {
    previewError.value = err.message
  } finally {
    previewing.value = false
  }
}
watch([tab, variant], ([t]) => { if (t === 'data' && ci.value) loadPreview() })

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
const tabBtn = (t) => ['px-3 py-1.5 text-sm border-b-2', tab.value === t ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground']
const btn = 'inline-flex items-center px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'

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
  <section v-if="!route.params.name" class="max-w-7xl mx-auto space-y-3">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <div class="text-xs text-muted-foreground">Calculated Insights</div>
        <h2 class="text-lg font-semibold">All calculated insights <HelpTip topic="insights" /></h2>
      </div>
      <div class="ml-auto flex items-center gap-2 text-sm">
        <input v-model="search" placeholder="Search this list" class="border rounded-md px-2 py-1 bg-background w-60" />
        <select v-model="status" class="border rounded-md px-2 py-1 bg-background"><option value="">All statuses</option><option v-for="s in statuses" :key="s" :value="s">{{ words(s) }}</option></select>
        <button class="p-1.5 rounded-md border hover:bg-accent" title="Refresh" @click="load({ refresh: true })"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button>
        <DownloadMenu :get-doc="listDoc" :get-sheets="listSheets" file-name="calculated-insights" :disabled="!list.length" />
      </div>
    </div>
    <p class="text-xs text-muted-foreground">{{ list.length }} {{ list.length === 1 ? 'item' : 'items' }}</p>
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    <DataTable :columns="listCols" :rows="list" row-key="name" row-class="hover:bg-accent" box-class="max-h-[calc(100vh-12rem)]" :empty="loading ? 'Loading…' : `No calculated insights${search || status ? ' match' : ' in this data space'}.`">
      <template #cell-label="{ row: i }"><RouterLink :to="`/insights/${i.name}`" class="text-link hover:underline">{{ i.label }}</RouterLink><div class="font-mono text-xs text-muted-foreground">{{ i.name }}</div></template>
      <template #cell-lastRun="{ value }"><span class="whitespace-nowrap">{{ value }}</span></template>
      <template #cell-lastRunStatus="{ row: i, value }"><span :class="['inline-block w-2 h-2 rounded-full mr-1.5', DOT[i.health.level]]" />{{ value }}</template>
    </DataTable>
  </section>

  <!-- Record page -->
  <section v-else class="max-w-7xl mx-auto space-y-3">
    <RouterLink to="/insights" class="text-xs text-link hover:underline">Calculated insights</RouterLink>
    <Loading v-if="!ci && loading" text="Loading" />
    <p v-else-if="!ci" class="text-sm text-muted-foreground">This calculated insight is not in the selected data space.</p>
    <template v-else>
      <div class="border rounded-xl bg-card p-3 space-y-3">
        <div class="flex flex-wrap items-start gap-3">
          <div>
            <div class="text-xs text-muted-foreground">Calculated Insight</div>
            <h2 class="text-xl font-semibold">{{ ci.label }}</h2>
          </div>
          <div class="ml-auto flex gap-2">
            <DownloadMenu :get-doc="ciDoc" :get-sheets="() => sheetsFrom(ciSections())" :file-name="`insight-${ci.name}`" />
            <button :class="btn" @click="router.push({ path: '/sql', query: { sql: querySql } })">Query in SQL</button>
            <a v-if="sfId" :class="btn" :href="recordUrl(currentOrg()?.host, sfId)" target="_blank" rel="noopener">Open in Salesforce</a>
          </div>
        </div>
        <div class="flex flex-wrap gap-x-10 gap-y-2 text-sm">
          <div><div class="text-xs text-muted-foreground">Data Space</div>{{ ci.dataSpace }}</div>
          <div><div class="text-xs text-muted-foreground">Status</div>{{ cap(ci.status) }}</div>
          <div><div class="text-xs text-muted-foreground">Last Run Time</div>{{ when(ci.lastRun) }}</div>
          <div><div class="text-xs text-muted-foreground">Last Run Status</div><span :class="['inline-block w-2 h-2 rounded-full mr-1', DOT[ci.health.level]]" />{{ cap(ci.lastRunStatus) || 'Never' }}</div>
        </div>
      </div>

      <nav class="flex border-b">
        <button :class="tabBtn('details')" @click="tab = 'details'">Details</button>
        <button :class="tabBtn('sql')" @click="tab = 'sql'">Expression</button>
        <button :class="tabBtn('fields')" @click="tab = 'fields'">Output ({{ ci.dimensions.length + ci.measures.length }})</button>
        <button :class="tabBtn('data')" @click="tab = 'data'">Data</button>
        <button :class="tabBtn('usedby')" @click="tab = 'usedby'">Used by</button>
      </nav>

      <dl v-if="tab === 'details'" class="border rounded-xl bg-card p-4 grid md:grid-cols-2 gap-x-10 gap-y-3 text-sm">
        <div v-for="[label, value] in detailPairs" :key="label" class="border-b pb-2">
          <dt class="text-xs text-muted-foreground">{{ label }}</dt><dd :class="label === 'API Name' ? 'font-mono text-xs' : ''">{{ value || '—' }}</dd>
        </div>
      </dl>
      <InsightDefinition v-else-if="tab === 'sql' || tab === 'fields'" :ci="ci" :partition-by="meta?.partitionBy || ''" :show="tab" />

      <div v-else-if="tab === 'data'" class="space-y-2">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <label class="text-muted-foreground" for="ci-variant">Table</label>
          <select id="ci-variant" v-model="variant" class="border rounded-md px-2 py-1 bg-background font-mono text-xs">
            <option v-for="v in variants" :key="v" :value="v">{{ v }}</option>
          </select>
          <span class="text-xs text-muted-foreground">First 50 rows.</span>
          <button class="ml-auto text-xs text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: querySql } })">Open in a SQL tab</button>
        </div>
        <Loading v-if="previewing" text="Loading rows…" />
        <p v-else-if="previewError" class="text-sm text-destructive">{{ previewError }}</p>
        <p v-else-if="preview && !preview.rows.length" class="text-sm text-muted-foreground">No rows yet: the insight has not produced data.</p>
        <ResultTable v-else-if="preview" :columns="preview.columns" :rows="preview.rows" />
      </div>

      <div v-else-if="tab === 'usedby'" class="grid lg:grid-cols-2 gap-4 text-sm">
        <div class="border rounded-xl bg-card">
          <h3 class="p-3 border-b font-medium">Reads from</h3>
          <div v-for="r in reads" :key="r.object" class="p-3 border-b last:border-0">
            <RouterLink :to="`/objects/${r.object}`" class="font-mono text-xs text-link hover:underline">{{ r.object }}</RouterLink>
            <div class="text-xs text-muted-foreground mt-0.5">{{ r.fields.length ? r.fields.join(', ') : 'the object' }}</div>
          </div>
          <p v-if="!reads.length" class="p-3 text-muted-foreground">No objects found in its SQL.</p>
        </div>
        <div class="border rounded-xl bg-card">
          <h3 class="p-3 border-b font-medium">Segments that use it</h3>
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
