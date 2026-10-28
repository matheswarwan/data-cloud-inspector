<script setup>
import { selectFor } from '../lib/catalog.js'
import { ref, computed, watch, onMounted, defineAsyncComponent } from 'vue'
import Loading from '../components/Loading.vue'
import ListPanel from '../components/ListPanel.vue'
import DataTable from '../components/DataTable.vue'
import HelpTip from '../components/HelpTip.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
const ModelDiagram = defineAsyncComponent(() => import('../components/ModelDiagram.vue'))
import { useRoute, useRouter } from 'vue-router'
import { RefreshCw, Search } from 'lucide-vue-next'
import { useOrg, currentOrg, orgName } from '../app/useOrg.js'
import { streamsDoc, streamsSheets, streamDoc, streamSheets } from '../lib/streamDoc.js'
import { useCatalog, ensureCatalog, ensureStreams, ensureAllMappings, orgCall } from '../app/useCatalog.js'
import { recordUrl } from '../lib/links.js'
import { loadStream, fieldMap, describeSchedule } from '../lib/streams.js'
import { problemCounts, latestProblemsSql } from '../lib/problems.js'
import { streamHealth, LEVEL_TEXT } from '../lib/health.js'

const route = useRoute()
const router = useRouter()
const org = useOrg()
const catalog = useCatalog()
const filter = ref('')
const stream = ref(null)
const error = ref('')
const loading = ref(false)
const problems = ref(null)
const fieldText = ref('')
const mapsTo = ref(null)

// Streams load after the catalog: switching org or data space resets the catalog (and its
// streams), so loading them first could be wiped out.
const loadList = () => ensureCatalog().then(() => ensureStreams())
onMounted(loadList)
watch(() => [org.orgId, org.version, org.dataSpace], loadList)

const list = computed(() => {
  const t = filter.value.trim().toLowerCase()
  const all = (catalog.streams || []).map((s) => ({ ...s, health: streamHealth(s) }))
  return (t ? all.filter((s) => s.label.toLowerCase().includes(t) || s.name.toLowerCase().includes(t) || s.sourceObject.toLowerCase().includes(t)) : all).sort((a, b) => a.label.localeCompare(b.label))
})

watch(() => [route.params.name, org.version], async ([name]) => {
  stream.value = null
  problems.value = null
  mapsTo.value = null
  error.value = ''
  if (!name || !org.version) return
  loading.value = true
  try {
    const s = await loadStream(orgCall(), org.version, name)
    if (route.params.name !== name) return
    stream.value = s
    if (s.problemDlo) problems.value = (await problemCounts(orgCall(), org.version, [s.problemDlo])).get(s.problemDlo)
    const all = await ensureAllMappings()
    if (route.params.name === name) mapsTo.value = (all || []).filter((m) => m.source === s.dlo.name)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}, { immediate: true })

const fields = computed(() => {
  if (!stream.value) return []
  const t = fieldText.value.trim().toLowerCase()
  const all = fieldMap(stream.value)
  return t ? all.filter((f) => f.name.toLowerCase().includes(t) || f.dloField.toLowerCase().includes(t)) : all
})
const DOT = { fail: 'bg-red-500', warn: 'bg-amber-400', running: 'bg-sky-500', idle: 'bg-gray-400', ok: 'bg-green-500' }
const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'never')
const num = (n) => (n == null ? '—' : Number(n).toLocaleString())
const btn = 'dci-btn'
// Overview (no stream picked, feedback #104): every stream as a table, or a lineage diagram of
// stream -> DLO -> DMOs, like Data models. Kept in the URL (?view=diagram).
const mode = computed({
  get: () => (route.query.view === 'diagram' ? 'diagram' : 'table'),
  set: (v) => router.replace({ query: { ...route.query, view: v === 'diagram' ? 'diagram' : undefined } }),
})
watch(() => route.params.name, (n) => { if (!n) ensureAllMappings() }, { immediate: true })
// Create SQL (feedback #1014): a SELECT of the object's fields, opened in SQL.
function toSql(name) {
  const obj = catalog.objects.find((o) => o.name === name)
  router.push({ path: '/sql', query: { sql: obj ? selectFor(obj) : `SELECT * FROM ${name} LIMIT 100` } })
}
const dmosOf = (s) => (catalog.mappings || []).filter((m) => m.source === s.dlo).map((m) => m.target)
const streamCols = [
  { key: 'label', label: 'Data stream', value: (s) => `${s.label} ${s.name}`, sortValue: (s) => s.label },
  { key: 'connector', label: 'Source', value: (s) => [s.connector, s.sourceObject].filter(Boolean).join(': ') },
  { key: 'dlo', label: 'Data lake object' },
  { key: 'dmos', label: 'Maps into', value: (s) => dmosOf(s), sortValue: (s) => dmosOf(s).length, kind: 'number' },
  { key: 'totalRecords', label: 'Records', align: 'right', kind: 'number' },
  { key: 'health', label: 'Status', value: (s) => LEVEL_TEXT[s.health.level], sortValue: (s) => ['fail', 'warn', 'running', 'idle', 'ok'].indexOf(s.health.level), kind: 'number' },
  { key: 'lastRunStatus', label: 'Last run', value: (s) => (s.lastRunStatus || '').toLowerCase() },
  { key: 'lastRefreshDate', label: 'Last refresh', kind: 'date', value: (s) => (s.lastRefreshDate ? new Date(s.lastRefreshDate).toLocaleString() : ''), sortValue: (s) => s.lastRefreshDate || '', filter: false },
]
const view = ref([])
const diagramNames = computed(() => [...new Set(view.value.flatMap(dmosOf))])
// Downloads (feedback #146): the list as the table shows it, and one stream
const listDoc = () => streamsDoc({ columns: streamCols, rows: view.value, org: orgName(org.orgId), dataSpace: org.dataSpace || 'default' })
const listSheets = () => streamsSheets({ columns: streamCols, rows: view.value })
function streamDetails(s) {
  return [
    ['Source', `${s.connector}${s.sourceObject ? `: ${s.sourceObject}` : ''}${s.connectorName ? ` (${s.connectorName})` : ''}`],
    ['Status', `${s.status.toLowerCase()}${s.enabled ? '' : ', disabled'}`],
    ['Last run', `${s.lastRunStatus === 'NONE' ? 'never run' : s.lastRunStatus.toLowerCase()}, ${when(s.lastRefresh)}`],
    ['Schedule', describeSchedule(s)],
    ['Records', `${num(s.totalRecords)} total; last run added ${num(s.lastAdded)}, processed ${num(s.lastProcessed)}`],
    ['Type', [s.type, s.accessMode].filter(Boolean).join(', ').toLowerCase() + (s.acceleration ? ', accelerated' : '')],
    ['Data lake object', s.dlo.name],
    ['Problem records', !s.problemDlo ? 'none configured' : !problems.value ? '' : problems.value.error ? `could not count (${problems.value.error})` : num(problems.value.count)],
  ]
}
const oneArgs = () => ({ stream: stream.value, details: streamDetails(stream.value), mapsTo: mapsTo.value || [], fields: fieldMap(stream.value), org: orgName(org.orgId) })

const fieldCols = [
  { key: 'name', label: 'Source field' },
  { key: 'type', label: 'Type' },
  { key: 'dloField', label: 'DLO field', value: (f) => [f.dloField, f.dloField && f.dloLabel !== f.dloField ? f.dloLabel : ''].filter(Boolean).join(' ') },
]
</script>

<template>
  <section class="flex gap-4 min-h-0">
    <ListPanel v-if="route.params.name" name="streams" label="data streams list">
      <div class="flex gap-2">
        <label class="dci-search flex-1"><Search class="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" /><input v-model="filter" placeholder="Search streams or source objects" /></label>
        <button class="dci-btn-icon" title="Load the streams again" @click="catalog.streams = null; loadList()"><RefreshCw class="w-4 h-4" /></button>
      </div>
      <p class="text-xs text-muted-foreground">{{ list.length }} data streams</p>
      <ul class="max-h-[75vh] overflow-auto text-sm">
        <li v-for="s in list" :key="s.name">
          <RouterLink :to="`/streams/${s.name}`" :class="['block px-2 py-1.5 rounded-md hover:bg-accent', { 'bg-accent': s.name === route.params.name }]">
            <div class="flex items-center gap-2"><span :class="['w-2 h-2 rounded-full shrink-0', DOT[s.health.level]]" :title="s.health.reason" /><span class="truncate">{{ s.label }}</span></div>
            <div class="text-xs text-muted-foreground truncate pl-4">{{ s.connector }}{{ s.sourceObject ? `: ${s.sourceObject}` : '' }} · {{ num(s.totalRecords) }} records</div>
          </RouterLink>
        </li>
      </ul>
    </ListPanel>

    <div class="flex-1 min-w-0 space-y-4">
      <template v-if="!route.params.name">
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <h2 class="text-lg font-semibold">Data streams <HelpTip topic="streams" /></h2>
            <p class="text-sm text-muted-foreground">Where data comes into Data Cloud: each stream, the data lake object it fills and the data model objects that are mapped from it.</p>
          </div>
          <div class="ml-auto flex items-center gap-2 text-sm">
            <div class="inline-flex rounded-md border overflow-hidden" role="radiogroup" aria-label="Show as">
              <button role="radio" :aria-checked="mode === 'table'" :class="['px-2.5 py-1.5', mode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent']" @click="mode = 'table'">Table</button>
              <button role="radio" :aria-checked="mode === 'diagram'" :class="['px-2.5 py-1.5 border-l', mode === 'diagram' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent']" @click="mode = 'diagram'">Diagram</button>
            </div>
            <input v-model="filter" placeholder="Search streams or source objects" class="border rounded-md px-2 py-1.5 bg-background w-60" />
            <button class="dci-btn-icon" title="Load the streams again" aria-label="Load the streams again" @click="catalog.streams = null; loadList()"><RefreshCw class="w-4 h-4" /></button>
            <DownloadMenu :get-doc="listDoc" :get-sheets="listSheets" file-name="data-streams" :disabled="!view.length" />
          </div>
        </div>
        <p class="text-xs text-muted-foreground">{{ catalog.streams ? `${list.length} data streams` : 'Loading data streams…' }}</p>
        <DataTable v-show="mode === 'table'" :columns="streamCols" :rows="list" row-key="name" box-class="max-h-[calc(100vh-13rem)]" :empty="catalog.streams ? 'No data streams in this data space.' : ''" @view="(v) => (view = v)">
          <template #cell-label="{ row: s }"><RouterLink :to="`/streams/${s.name}`" class="text-link hover:underline">{{ s.label }}</RouterLink><div class="font-mono text-xs text-muted-foreground">{{ s.name }}</div></template>
          <template #cell-dlo="{ value }"><RouterLink v-if="value" :to="`/objects/${value}`" class="font-mono text-xs text-link hover:underline">{{ value }}</RouterLink></template>
          <template #cell-dmos="{ value }"><div class="text-xs"><RouterLink v-for="d in value" :key="d" :to="`/objects/${d}`" class="block font-mono text-link hover:underline">{{ d }}</RouterLink><span v-if="catalog.mappings && !value.length" class="text-muted-foreground">nothing mapped</span></div></template>
          <template #cell-totalRecords="{ value }">{{ num(value) }}</template>
          <template #cell-health="{ row: s }"><span class="whitespace-nowrap" :title="s.health.reason"><span :class="['inline-block w-2 h-2 rounded-full mr-1.5', DOT[s.health.level]]" />{{ LEVEL_TEXT[s.health.level] }}</span></template>
        </DataTable>
        <template v-if="mode === 'diagram'">
          <ModelDiagram
            v-if="catalog.mappings && catalog.streams" :objects="catalog.objects" :mappings="catalog.mappings" :names="diagramNames" :streams="view"
            :title="`Data streams: ${orgName(org.orgId)}`" :subtitle="`${new Date().toISOString().slice(0, 10)}, data space ${org.dataSpace || 'default'}. ${view.length} data streams.`" file-name="data-streams-diagram"
          />
          <p v-else class="text-sm text-muted-foreground">{{ catalog.mappingsProgress ? `Reading mappings: ${catalog.mappingsProgress}` : 'Reading data streams and mappings…' }}</p>
        </template>
      </template>
      <Loading v-else-if="loading && !stream" text="Loading…" />
      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      <RouterLink v-if="route.params.name" to="/streams" class="text-xs text-link hover:underline">All data streams</RouterLink>
      <template v-if="stream">
        <div class="flex flex-wrap items-start gap-3">
          <div>
            <h2 class="text-lg font-semibold">{{ stream.label }}</h2>
            <div class="font-mono text-sm text-muted-foreground">{{ stream.name }}</div>
          </div>
          <div class="ml-auto flex gap-2">
            <DownloadMenu :get-doc="() => streamDoc(oneArgs())" :get-sheets="() => streamSheets(oneArgs())" :file-name="`data-stream-${stream.name}`" />
            <a v-if="stream.recordId" :class="btn" :href="recordUrl(currentOrg()?.host, stream.recordId)" target="_blank" rel="noopener">Open in Salesforce</a>
          </div>
        </div>
        <dl class="border rounded-xl bg-card p-3 grid grid-cols-[10rem_1fr] md:grid-cols-[10rem_1fr_10rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-muted-foreground">Source</dt><dd>{{ stream.connector }}{{ stream.sourceObject ? `: ${stream.sourceObject}` : '' }}<span v-if="stream.connectorName" class="text-xs text-muted-foreground"> ({{ stream.connectorName }})</span></dd>
          <dt class="text-muted-foreground">Status</dt><dd>{{ stream.status.toLowerCase() }}{{ stream.enabled ? '' : ', disabled' }}</dd>
          <dt class="text-muted-foreground">Last run</dt><dd>{{ stream.lastRunStatus === 'NONE' ? 'never run' : stream.lastRunStatus.toLowerCase() }}, {{ when(stream.lastRefresh) }}</dd>
          <dt class="text-muted-foreground">Schedule</dt><dd>{{ describeSchedule(stream) }}</dd>
          <dt class="text-muted-foreground">Records</dt><dd>{{ num(stream.totalRecords) }} total; last run added {{ num(stream.lastAdded) }}, processed {{ num(stream.lastProcessed) }}</dd>
          <dt class="text-muted-foreground">Type</dt><dd>{{ [stream.type, stream.accessMode].filter(Boolean).join(', ').toLowerCase() }}{{ stream.acceleration ? ', accelerated' : '' }}</dd>
          <dt class="text-muted-foreground">Data lake object</dt><dd><RouterLink :to="`/objects/${stream.dlo.name}`" class="font-mono text-xs text-link hover:underline">{{ stream.dlo.name }}</RouterLink>
            <button class="ml-2 text-xs text-link hover:underline" title="Open a SELECT of this data lake object in SQL (feedback #1014)" @click="toSql(stream.dlo.name)">Create SQL</button></dd>
          <dt class="text-muted-foreground">Problem records</dt>
          <dd>
            <template v-if="!stream.problemDlo">none configured</template>
            <template v-else-if="!problems">…</template>
            <template v-else>{{ problems.error ? `could not count (${problems.error})` : `${num(problems.count)}${problems.latest ? `, latest ${when(problems.latest)}` : ''}` }}
              <button class="ml-1 text-xs text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: latestProblemsSql(stream.problemDlo) } })">Open in SQL</button></template>
          </dd>
        </dl>
        <div class="border rounded-xl bg-card p-3 text-sm">
          <div class="font-medium mb-1">Maps into</div>
          <p v-if="mapsTo === null" class="text-muted-foreground">{{ catalog.mappingsProgress ? `Reading mappings: ${catalog.mappingsProgress}` : 'Reading mappings…' }}</p>
          <p v-else-if="!mapsTo.length" class="text-muted-foreground">Its DLO is not mapped to any DMO.</p>
          <ul v-else class="space-y-0.5"><li v-for="m in mapsTo" :key="m.name"><RouterLink :to="`/objects/${m.target}`" class="font-mono text-xs text-link hover:underline">{{ m.target }}</RouterLink> <span class="text-xs text-muted-foreground">({{ m.fields.length }} fields)</span> <button class="text-xs text-link hover:underline" @click="toSql(m.target)">Create SQL</button></li></ul>
        </div>
        <div class="border rounded-xl bg-card">
          <div class="p-3 border-b flex items-center gap-2 text-sm">
            <span class="font-medium">Source fields ({{ stream.sourceFields.length }})</span>
            <input v-model="fieldText" placeholder="Filter fields" class="ml-auto border rounded-md px-2 py-0.5 bg-background text-xs w-56" />
          </div>
          <DataTable :columns="fieldCols" :rows="fields" row-key="name" :bordered="false" text-size="text-xs" box-class="max-h-[50vh]">
            <template #cell-name="{ value }"><span class="font-mono">{{ value }}</span></template>
            <template #cell-dloField="{ row: f }"><span class="font-mono">{{ f.dloField }}</span> <span class="text-muted-foreground">{{ f.dloField && f.dloLabel !== f.dloField ? f.dloLabel : '' }}</span></template>
          </DataTable>
        </div>
      </template>
    </div>
  </section>
</template>
