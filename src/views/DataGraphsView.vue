<script setup>
// Data graphs (feedback #99, #101): each graph with its objects, fields and joins, a diagram,
// its objects joined as SQL, the built graph as SQL, and one record's graph fetched by ID
// (GET, read only) the way Personalization and Agentforce get it.
import { ref, computed, watch, onMounted, defineAsyncComponent } from 'vue'
import Loading from '../components/Loading.vue'
import JsonViewer from '../components/JsonViewer.vue'
import { useRoute, useRouter } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import ListPanel from '../components/ListPanel.vue'
import SqlBlock from '../components/SqlBlock.vue'
import HelpTip from '../components/HelpTip.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import { docFrom, sheetsFrom } from '../lib/tableDoc.js'
import { useOrg, currentOrg, orgTitle } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, ensureAllMappings, ensureDataGraphs, orgCall } from '../app/useCatalog.js'
import { objectTree, labelOf, nameOf, graphSql, valuesSql, graphRecordPath, expandJson, resolveObject } from '../lib/dataGraphs.js'
import { recordUrl } from '../lib/links.js'
const ModelDiagram = defineAsyncComponent(() => import('../components/ModelDiagram.vue'))

const route = useRoute()
const router = useRouter()
const org = useOrg()
const catalog = useCatalog()
const graphs = ref(null)
const error = ref('')
const loading = ref(false)
const filter = ref('')
const tab = ref('objects')

async function load(refresh = false) {
  if (!org.version) return
  loading.value = true
  error.value = ''
  try { graphs.value = await ensureDataGraphs({ refresh }) } catch (err) { error.value = err.message; graphs.value = [] }
  loading.value = false
  ensureCatalog()
}
onMounted(() => load())
watch(() => [org.orgId, org.version, org.dataSpace], () => load())

const list = computed(() => {
  const t = filter.value.trim().toLowerCase()
  const all = graphs.value || []
  return t ? all.filter((g) => labelOf(g).toLowerCase().includes(t) || nameOf(g).toLowerCase().includes(t)) : all
})
const graph = computed(() => (graphs.value || []).find((g) => nameOf(g) === route.params.name) || null)
watch(() => route.params.name, () => { record.value = null; recordId.value = '' })

const status = (g) => [g.record?.status || g.status, g.record?.lastRunStatus && `last run ${g.record.lastRunStatus}`].filter(Boolean).join(', ').toLowerCase()
const num = (n) => (n == null ? '' : Number(n).toLocaleString())
const when = (v) => (v ? new Date(v).toLocaleString() : 'never')

// Objects as rows: depth, name, label, fields, how it joins its parent
const rows = computed(() => {
  const out = []
  const walk = (nodes, depth, parent) => {
    for (const n of nodes) {
      const obj = resolveObject(n.name, catalog.objects)
      out.push({ ...n, depth, parent, obj })
      walk(n.children, depth + 1, n.name)
    }
  }
  walk(graph.value ? objectTree(graph.value) : [], 0, '')
  return out
})
const objectNames = computed(() => rows.value.map((r) => r.obj?.name).filter(Boolean))
const joinSql = computed(() => (graph.value && catalog.objects.length ? graphSql(graph.value, catalog.objects) : { sql: '', notes: [] }))
const builtSql = computed(() => (graph.value ? valuesSql(graph.value) : ''))
const openSql = (sql) => router.push({ path: '/sql', query: { sql } })

watch(tab, (t) => { if (t === 'diagram') ensureAllMappings() })

// One record's graph
const recordId = ref('')
const record = ref(null)
async function fetchRecord() {
  const g = graph.value
  const id = recordId.value.trim()
  if (!g || !id) return
  record.value = { loading: true }
  const res = await orgCall()(graphRecordPath(org.version, nameOf(g), id))
  record.value = res.ok
    ? { data: JSON.stringify(expandJson(res.data), null, 2) }
    : { error: res.status === 404 ? `No graph for ${id}. Use the ${g.primaryObjectLabel || 'primary object'} record ID; a graph that has not finished building has no records yet.` : res.error || `HTTP ${res.status}` }
}
const tabBtn = (t) => ['px-3 py-1.5 text-sm border-b-2 -mb-px', tab.value === t ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground']
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent'

// Downloads (feedback #149): the list, and one graph with its objects and SQL
const listCols = [
  { key: 'label', label: 'Data graph', value: (g) => labelOf(g) }, { key: 'name', label: 'API name', value: (g) => nameOf(g) },
  { key: 'primary', label: 'Primary object', value: (g) => g.primaryObjectLabel || g.primaryObjectName || '' },
  { key: 'status', label: 'Status', value: (g) => status(g) }, { key: 'records', label: 'Records', value: (g) => num(g.record?.recordCount) },
  { key: 'refresh', label: 'Last refresh', value: (g) => when(g.record?.lastRefresh || g.lastRefreshedDate) },
]
const listSections = () => [{ heading: 'Data graphs', columns: listCols, rows: list.value }]
const listDoc = () => docFrom({ title: 'Data graphs', intro: `${orgTitle(org.orgId)}, data space ${org.dataSpace || 'default'}. ${list.value.length} data graphs.`, sections: listSections() })
const objectCols = [
  { key: 'label', label: 'Object', value: (r) => `${'  '.repeat(r.depth)}${r.obj?.label || r.label}` }, { key: 'name', label: 'API name' },
  { key: 'join', label: 'Joined to its parent on', value: (r) => (r.join ? `${r.join.childField} = ${r.parent}.${r.join.parentField}` : r.depth ? 'not given' : 'primary object') },
  { key: 'fields', label: 'Fields in the graph', value: (r) => r.fields.join(', ') },
]
function graphSections() {
  const g = graph.value
  return [
    { heading: 'Details', kv: [['API name', nameOf(g)], ['Primary object', g.primaryObjectLabel || g.primaryObjectName || ''], ['Status', status(g) || 'unknown'], ['Records', num(g.record?.recordCount)], ['Last refresh', when(g.record?.lastRefresh || g.lastRefreshedDate)], ['Data space', g.dataspaceName || ''], ...(g.description ? [['Description', g.description]] : [])] },
    { heading: 'Objects', columns: objectCols, rows: rows.value },
    ...(joinSql.value.sql ? [{ heading: 'The objects joined (SQL)', code: joinSql.value.sql, lang: 'sql' }] : []),
    ...(builtSql.value ? [{ heading: 'The built graph (SQL)', code: builtSql.value, lang: 'sql' }] : []),
  ]
}
const graphDoc = () => docFrom({ title: `Data graph: ${labelOf(graph.value)}`, intro: `${orgTitle(org.orgId)}.`, sections: graphSections() })
</script>

<template>
  <section class="flex gap-4 min-h-0">
    <ListPanel name="graphs" label="data graphs list">
      <div class="flex items-center gap-2">
        <h2 class="font-semibold">Data graphs</h2>
        <HelpTip topic="graphs" />
        <span class="ml-auto"><DownloadMenu small label="" :get-doc="listDoc" :get-sheets="() => sheetsFrom(listSections())" file-name="data-graphs" :disabled="!list.length" /></span>
        <button class="p-1.5 rounded-md border hover:bg-accent" title="Load again" aria-label="Load the data graphs again" @click="load(true)"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button>
      </div>
      <input v-model="filter" placeholder="Search data graphs" class="w-full border rounded-md px-2 py-1 bg-background text-sm" />
      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      <p v-else class="text-xs text-muted-foreground">{{ graphs ? `${list.length} data ${list.length === 1 ? 'graph' : 'graphs'}` : 'Loading data graphs…' }}</p>
      <ul class="text-sm max-h-[75vh] overflow-auto">
        <li v-for="g in list" :key="nameOf(g)">
          <RouterLink :to="`/graphs/${nameOf(g)}`" :class="['block px-2 py-1.5 rounded-md hover:bg-accent', { 'bg-accent': nameOf(g) === route.params.name }]">
            <div class="truncate">{{ labelOf(g) }}</div>
            <div class="text-xs text-muted-foreground truncate">{{ g.primaryObjectLabel || g.primaryObjectName }}{{ status(g) ? ` · ${status(g)}` : '' }}</div>
          </RouterLink>
        </li>
      </ul>
    </ListPanel>

    <div class="flex-1 min-w-0 space-y-4">
      <div v-if="!route.params.name" class="text-sm text-muted-foreground p-4 space-y-2">
        <p v-if="graphs && !graphs.length">No data graphs in this data space. A data graph puts a person's data from several objects into one JSON document, which Personalization and Agentforce read in one call.</p>
        <p v-else-if="graphs">Pick a data graph to see its objects, query it in SQL or fetch one record.</p>
        <Loading v-else text="Loading data graphs" />
      </div>
      <p v-else-if="graphs && !graph" class="text-sm text-muted-foreground">This data graph is not in the selected data space.</p>
      <template v-if="graph">
        <div class="flex flex-wrap items-start gap-3">
          <div>
            <h2 class="text-lg font-semibold">{{ labelOf(graph) }}</h2>
            <div class="font-mono text-sm text-muted-foreground">{{ nameOf(graph) }}</div>
          </div>
          <div class="ml-auto flex gap-2">
            <DownloadMenu :get-doc="graphDoc" :get-sheets="() => sheetsFrom(graphSections())" :file-name="`data-graph-${nameOf(graph)}`" />
            <a v-if="graph.record?.id || graph.id" :class="btn" :href="recordUrl(currentOrg()?.host, graph.record?.id || graph.id)" target="_blank" rel="noopener">Open in Salesforce</a>
          </div>
        </div>
        <p v-if="graph.error" class="text-sm text-destructive">Could not read its definition: {{ graph.error }}</p>
        <dl class="border rounded-md bg-card p-3 grid grid-cols-[10rem_1fr] md:grid-cols-[10rem_1fr_10rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-muted-foreground">Primary object</dt><dd><RouterLink v-if="graph.primaryObjectName" :to="`/objects/${graph.primaryObjectName}`" class="text-link hover:underline">{{ graph.primaryObjectLabel || graph.primaryObjectName }}</RouterLink></dd>
          <dt class="text-muted-foreground">Status</dt><dd>{{ status(graph) || 'unknown' }}</dd>
          <dt class="text-muted-foreground">Records</dt><dd>{{ num(graph.record?.recordCount) }}</dd>
          <dt class="text-muted-foreground">Last refresh</dt><dd>{{ when(graph.record?.lastRefresh || graph.lastRefreshedDate) }}</dd>
          <dt class="text-muted-foreground">Refresh</dt><dd>{{ graph.fullRefreshConfig?.schedule ? `every ${graph.fullRefreshConfig.schedule.frequency} ${graph.fullRefreshConfig.schedule.timeGranularity}` : '' }}{{ graph.incrementalRefreshConfig?.enabled ? ', incremental' : '' }}</dd>
          <dt class="text-muted-foreground">Data space</dt><dd>{{ graph.dataspaceName }}</dd>
          <template v-if="graph.description"><dt class="text-muted-foreground">Description</dt><dd class="md:col-span-3">{{ graph.description }}</dd></template>
        </dl>

        <nav class="flex border-b">
          <button :class="tabBtn('objects')" @click="tab = 'objects'">Objects ({{ rows.length }})</button>
          <button :class="tabBtn('diagram')" @click="tab = 'diagram'">Diagram</button>
          <button :class="tabBtn('sql')" @click="tab = 'sql'">SQL</button>
          <button :class="tabBtn('record')" @click="tab = 'record'">One record</button>
        </nav>

        <div v-if="tab === 'objects'" class="border rounded-md bg-card overflow-auto">
          <table class="w-full text-sm">
            <thead class="text-left text-muted-foreground border-b"><tr><th class="p-2 font-normal">Object</th><th class="p-2 font-normal">Joined to its parent on</th><th class="p-2 font-normal">Fields in the graph</th></tr></thead>
            <tbody>
              <tr v-for="r in rows" :key="r.parent + r.name" class="border-t align-top">
                <td class="p-2" :style="{ paddingLeft: `${0.5 + r.depth * 1.25}rem` }">
                  <RouterLink :to="`/objects/${r.obj?.name || r.name}`" class="text-link hover:underline">{{ r.obj?.label || r.label }}</RouterLink>
                  <div class="font-mono text-xs text-muted-foreground">{{ r.name }}</div>
                </td>
                <td class="p-2 font-mono text-xs">{{ r.join ? `${r.join.childField} = ${r.parent}.${r.join.parentField}` : r.depth ? 'not given' : 'primary object' }}</td>
                <td class="p-2 font-mono text-xs break-all">{{ r.fields.join(', ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="tab === 'diagram'">
          <p v-if="!objectNames.length" class="text-sm text-muted-foreground">None of this graph's objects are in the metadata catalog.</p>
          <ModelDiagram
            v-else-if="catalog.mappings" :objects="catalog.objects" :mappings="catalog.mappings" :names="objectNames"
            :title="`Data graph: ${labelOf(graph)}`" :subtitle="`${nameOf(graph)}, data space ${graph.dataspaceName || org.dataSpace || 'default'}.`" :file-name="`data-graph-${nameOf(graph)}`"
          />
          <p v-else class="text-sm text-muted-foreground">{{ catalog.mappingsProgress ? `Reading mappings: ${catalog.mappingsProgress}` : 'Reading the data model…' }}</p>
        </div>

        <div v-else-if="tab === 'sql'" class="space-y-4">
          <div class="border rounded-md bg-card">
            <div class="p-3 border-b flex flex-wrap items-center gap-2">
              <h3 class="font-medium text-sm">The graph's objects joined</h3>
              <span class="text-xs text-muted-foreground">A SELECT over the source objects, joined the way the graph joins them. Related records repeat the primary row once per match.</span>
              <button v-if="joinSql.sql" class="ml-auto text-xs text-link hover:underline" @click="openSql(joinSql.sql)">Open in a SQL tab</button>
            </div>
            <div class="p-2"><SqlBlock v-if="joinSql.sql" :code="joinSql.sql" box-class="max-h-96" /><p v-else class="p-2 text-sm text-muted-foreground">{{ catalog.objects.length ? 'None of the objects in this graph are in the metadata catalog.' : 'Reading the metadata…' }}</p></div>
          </div>
          <div v-if="builtSql" class="border rounded-md bg-card">
            <div class="p-3 border-b flex flex-wrap items-center gap-2">
              <h3 class="font-medium text-sm">The built graph</h3>
              <span class="text-xs text-muted-foreground">The table Data Cloud stores the built graph in: one row per {{ graph.primaryObjectLabel || 'record' }}, the graph as JSON in json_blob__c.</span>
              <button class="ml-auto text-xs text-link hover:underline" @click="openSql(builtSql)">Open in a SQL tab</button>
            </div>
            <div class="p-2"><SqlBlock :code="builtSql" box-class="max-h-60" /></div>
          </div>
        </div>

        <div v-else-if="tab === 'record'" class="border rounded-md bg-card p-3 space-y-2">
          <p class="text-sm text-muted-foreground">One record's graph, the way Personalization and Agentforce get it.</p>
          <form class="flex gap-2" @submit.prevent="fetchRecord">
            <input v-model="recordId" :placeholder="`${graph.primaryObjectLabel || 'Primary object'} record ID`" :aria-label="`${graph.primaryObjectLabel || 'Primary object'} record ID`" class="flex-1 max-w-md border rounded-md px-2 py-1 bg-background font-mono text-sm" />
            <button class="px-3 py-1 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="!recordId.trim() || record?.loading">Fetch</button>
          </form>
          <p class="text-xs text-muted-foreground font-mono break-all">GET {{ graphRecordPath(org.version, nameOf(graph), recordId.trim() || '<id>') }}</p>
          <Loading v-if="record?.loading" text="Fetching…" />
          <p v-else-if="record?.error" class="text-sm text-destructive">{{ record.error }}</p>
          <template v-else-if="record?.data">
            <JsonViewer :value="record.data" :file-name="`data-graph-${nameOf(graph)}-${recordId.trim()}`" :open-depth="3" />
          </template>
        </div>
      </template>
    </div>
  </section>
</template>
