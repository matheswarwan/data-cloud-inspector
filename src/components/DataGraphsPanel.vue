<script setup>
// SQL page, Data graphs tab (feedback #99): each data graph with its objects; open its objects
// joined as a SELECT, query the table the built graph is stored in, or fetch one record's
// graph (GET, read only) the way Personalization and Agentforce get it.
import { ref, computed, watch, onMounted } from 'vue'
import { RefreshCw, ChevronRight, ChevronDown, X } from 'lucide-vue-next'
import GraphTree from './GraphTree.vue'
import { useOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, ensureDataGraphs, orgCall } from '../app/useCatalog.js'
import { objectTree, labelOf, nameOf, graphSql, valuesSql, graphRecordPath, expandJson } from '../lib/dataGraphs.js'

const emit = defineEmits(['open-sql'])
const org = useOrg()
const catalog = useCatalog()
const graphs = ref(null)
const error = ref('')
const loading = ref(false)
const open = ref({})

async function load(refresh = false) {
  if (!org.version) return
  loading.value = true
  error.value = ''
  try { graphs.value = await ensureDataGraphs({ refresh }) } catch (err) { error.value = err.message; graphs.value = [] }
  loading.value = false
}
onMounted(() => load())
watch(() => [org.orgId, org.version, org.dataSpace], () => load())

const status = (g) => [g.record?.status || g.status, g.record?.lastRunStatus && `last run ${g.record.lastRunStatus.toLowerCase()}`, g.record?.recordCount != null && `${Number(g.record.recordCount).toLocaleString()} records`].filter(Boolean).join(', ').toLowerCase()

async function joinSql(g) {
  await ensureCatalog()
  const { sql } = graphSql(g, catalog.objects)
  if (sql) emit('open-sql', sql, labelOf(g))
  else error.value = `None of the objects in ${labelOf(g)} are in the metadata catalog.`
}

// One record's graph
const fetchFor = ref(null) // graph
const recordId = ref('')
const record = ref(null) // { loading, error, data }
async function fetchRecord() {
  const g = fetchFor.value
  const id = recordId.value.trim()
  if (!g || !id) return
  record.value = { loading: true }
  const res = await orgCall()(graphRecordPath(org.version, nameOf(g), id))
  record.value = res.ok
    ? { data: JSON.stringify(expandJson(res.data), null, 2) }
    : { error: res.status === 404 ? `No graph for ${id}. The ID is the ${g.primaryObjectLabel || 'primary object'} record ID; a graph that has not finished building has no records yet.` : res.error || `HTTP ${res.status}` }
}
function closeFetch() { fetchFor.value = null; record.value = null }
async function copyRecord() { if (record.value?.data) await navigator.clipboard.writeText(record.value.data) }
const btn = 'text-xs text-link hover:underline text-left'
const count = computed(() => graphs.value?.length ?? 0)
</script>

<template>
  <div class="space-y-2 text-sm">
    <div class="flex items-center gap-2">
      <span class="text-xs text-muted-foreground">{{ graphs ? `${count} data ${count === 1 ? 'graph' : 'graphs'}` : 'Loading data graphs…' }}</span>
      <button class="ml-auto p-1 rounded-md border hover:bg-accent" title="Load the data graphs again" aria-label="Load the data graphs again" @click="load(true)"><RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" /></button>
    </div>
    <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
    <p v-if="graphs && !graphs.length && !error" class="text-xs text-muted-foreground">No data graphs in this data space.</p>
    <ul class="space-y-1 max-h-[75vh] overflow-auto">
      <li v-for="g in graphs || []" :key="nameOf(g)" class="rounded-md border bg-card">
        <button class="w-full flex items-start gap-1 px-2 py-1.5 text-left hover:bg-accent rounded-md" :aria-expanded="!!open[nameOf(g)]" @click="open[nameOf(g)] = !open[nameOf(g)]">
          <component :is="open[nameOf(g)] ? ChevronDown : ChevronRight" class="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span class="min-w-0">
            <span class="block truncate">{{ labelOf(g) }}</span>
            <span class="block font-mono text-xs text-muted-foreground truncate">{{ nameOf(g) }}</span>
            <span class="block text-xs text-muted-foreground">{{ g.primaryObjectLabel || g.primaryObjectName }}{{ status(g) ? ` · ${status(g)}` : '' }}</span>
          </span>
        </button>
        <div v-if="open[nameOf(g)]" class="px-2 pb-2 space-y-1.5">
          <p v-if="g.error" class="text-xs text-destructive">{{ g.error }}</p>
          <GraphTree v-if="objectTree(g).length" :nodes="objectTree(g)" />
          <div class="flex flex-col gap-1">
            <button :class="btn" @click="joinSql(g)">Objects joined as SQL</button>
            <button v-if="valuesSql(g)" :class="btn" @click="emit('open-sql', valuesSql(g), `${labelOf(g)} (built)`)">The built graph as SQL</button>
            <button :class="btn" @click="fetchFor = g; recordId = ''; record = null">Fetch one record's graph</button>
          </div>
        </div>
      </li>
    </ul>

    <Teleport to="body">
      <div v-if="fetchFor" class="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" @click.self="closeFetch">
        <div role="dialog" aria-modal="true" :aria-label="`Fetch a record from ${labelOf(fetchFor)}`" class="bg-card text-foreground border rounded-md shadow-lg w-full max-w-3xl max-h-[85vh] flex flex-col" @keydown.esc="closeFetch">
          <div class="flex items-center gap-2 p-3 border-b">
            <h2 class="font-medium">{{ labelOf(fetchFor) }}: one record</h2>
            <button class="ml-auto p-1 rounded hover:bg-accent" aria-label="Close" @click="closeFetch"><X class="w-4 h-4" /></button>
          </div>
          <form class="flex gap-2 p-3" @submit.prevent="fetchRecord">
            <input v-model="recordId" :placeholder="`${fetchFor.primaryObjectLabel || 'Primary object'} record ID`" class="flex-1 border rounded-md px-2 py-1 bg-background font-mono text-sm" autofocus />
            <button class="px-3 py-1 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="!recordId.trim() || record?.loading">Fetch</button>
          </form>
          <p class="px-3 -mt-1 text-xs text-muted-foreground">GET {{ graphRecordPath(org.version, nameOf(fetchFor), recordId.trim() || '<id>') }}</p>
          <div class="p-3 overflow-auto min-h-0">
            <p v-if="record?.loading" class="text-sm text-muted-foreground">Fetching…</p>
            <p v-else-if="record?.error" class="text-sm text-destructive">{{ record.error }}</p>
            <template v-else-if="record?.data">
              <div class="flex justify-end mb-1"><button class="text-xs text-link hover:underline" @click="copyRecord">Copy JSON</button></div>
              <pre class="text-xs font-mono whitespace-pre-wrap break-all border rounded p-2">{{ record.data }}</pre>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
