<script setup>
import DownloadMenu from '../components/DownloadMenu.vue'
import Loading from '../components/Loading.vue'
import ListPanel from '../components/ListPanel.vue'
import DataTable from '../components/DataTable.vue'
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RefreshCw, Copy, Key, ExternalLink } from 'lucide-vue-next'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { recordUrl, dmoUrl } from '../lib/links.js'
import { useCatalog, ensureCatalog, ensureStreams, ensureAllMappings, ensureRecordIds, ensureUsage, orgCall } from '../app/useCatalog.js'
import { usageOf, fieldUsage } from '../lib/usage.js'
import { problemCounts, latestProblemsSql } from '../lib/problems.js'
import { buildModel, modelMarkdown, modelHtml } from '../lib/modelDoc.js'
import { loadInsight, baseInsightName } from '../lib/insights.js'
import InsightDefinition from '../components/InsightDefinition.vue'
import { filterObjects, selectFor, objectMarkdown } from '../lib/catalog.js'
import { loadMappings } from '../lib/lineage.js'
import { runQuery } from '../lib/query.js'

const route = useRoute()
const router = useRouter()
const org = useOrg()
const catalog = useCatalog()

const text = ref('')
const kinds = ref([])
const category = ref('')
const tab = ref('fields')
const fieldText = ref('')
watch(() => route.query.field, (f) => { if (typeof f === 'string') { fieldText.value = f; tab.value = 'fields' } })
const notice = ref('')
const counts = reactive({}) // object name -> number | 'counting' | error text
const mappings = reactive({ name: '', list: null, error: '', loading: false })
const feeds = ref(null) // DMOs a DLO maps to

onMounted(() => { ensureCatalog(); if (typeof route.query.field === 'string') fieldText.value = route.query.field })
// Wait for the API version: on a fresh page load the route is known before the org is.
watch(() => [route.params.name, org.version], ([n, v]) => { if (n && v) { ensureRecordIds(); ensureUsage() } }, { immediate: true })

// DLOs and CIs open their record page; DMOs open in the Data Model tab by API name.
function sfUrl(o) {
  const host = currentOrg()?.host
  if (o.kind === 'DMO') return dmoUrl(host, o.name)
  const id = catalog.recordIds?.[o.name] || (o.kind === 'CI' ? catalog.recordIds?.[baseInsightName(o.name)] : null)
  return id ? recordUrl(host, id) : null
}

const categories = computed(() => [...new Set(catalog.objects.map((o) => o.category).filter(Boolean))].sort())
const list = computed(() => filterObjects(catalog.objects, { text: text.value, kinds: kinds.value, category: category.value }))
const byName = computed(() => new Map(catalog.objects.map((o) => [o.name, o])))
const selected = computed(() => byName.value.get(route.params.name) || null)
const fields = computed(() => {
  const t = fieldText.value.trim().toLowerCase()
  const all = selected.value?.fields || []
  return t ? all.filter((f) => f.name.toLowerCase().includes(t) || f.label.toLowerCase().includes(t)) : all
})
const used = computed(() => (selected.value ? usageOf(selected.value.name, catalog.usage) : null))
const usedCount = computed(() => (used.value ? used.value.insights.length + used.value.segments.length : null))
const fieldCols = computed(() => [
  { key: 'name', label: 'API name', sortValue: (f) => f.name },
  { key: 'label', label: 'Label' },
  { key: 'type', label: 'Type', value: (f) => f.businessType || f.type },
  ...(selected.value?.kind === 'CI' ? [{ key: 'role', label: 'Role' }] : []),
  { key: 'keyQualifier', label: 'Key qualifier' },
  { key: 'usedBy', label: 'Used by', value: (f) => fieldUses.value.get(f.name) || [] },
])
const relCols = [
  { key: 'from', label: 'From', value: (r) => `${r.from}${r.fromField ? `.${r.fromField}` : ''}` },
  { key: 'to', label: 'To', value: (r) => `${r.to}${r.toField ? `.${r.toField}` : ''}` },
  { key: 'cardinality', label: 'Cardinality' },
]
const mapCols = [
  { key: 'source', label: 'Source field', headerClass: 'w-1/2' },
  { key: 'target', label: 'DMO field' },
]
const fieldUses = computed(() => (selected.value ? fieldUsage(selected.value.name, catalog.usage) : new Map()))
// Export the data model as one document.
const exporting = ref(false)
const exportOpen = ref(false)
const exportOpts = reactive({ kinds: ['DMO'], mappings: true, format: 'html' })
async function exportModel() {
  exporting.value = true
  try {
    const [mappings, streams, usage] = await Promise.all([
      exportOpts.mappings ? ensureAllMappings() : Promise.resolve([]),
      exportOpts.mappings ? ensureStreams() : Promise.resolve([]),
      ensureUsage(),
    ])
    const model = buildModel({ objects: catalog.objects, kinds: exportOpts.kinds, mappings: mappings || [], streams: streams || [], usage, host: currentOrg()?.host, dataSpace: org.dataSpace })
    const html = exportOpts.format === 'html'
    const body = html ? modelHtml(model) : modelMarkdown(model)
    const url = URL.createObjectURL(new Blob([body], { type: html ? 'text/html' : 'text/markdown' }))
    const name = `data-model-${(currentOrg()?.host || 'org').split('.')[0]}-${new Date().toISOString().slice(0, 10)}.${html ? 'html' : 'md'}`
    Object.assign(document.createElement('a'), { href: url, download: name }).click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notice.value = `Downloaded ${name}.`
    exportOpen.value = false
  } catch (err) {
    notice.value = `Could not export: ${err.message}`
  } finally {
    exporting.value = false
  }
}

// A calculated insight's definition, loaded when its Definition tab opens.
const insight = reactive({ name: '', data: null, error: '', loading: false })
watch([tab, () => selected.value?.name], async ([t, name]) => {
  if (t !== 'sources' || selected.value?.kind !== 'CI' || insight.name === name) return
  Object.assign(insight, { name, data: null, error: '', loading: true })
  try {
    const ci = await loadInsight(orgCall(), org.version, name)
    if (insight.name === name) insight.data = ci
  } catch (err) {
    if (insight.name === name) insight.error = err.message
  } finally {
    if (insight.name === name) insight.loading = false
  }
})

const problems = reactive({}) // problem record DLO -> { count, latest, error }
watch(() => (catalog.streams || []).filter((s) => s.dlo === selected.value?.name && s.problemDlo).map((s) => s.problemDlo).join(','), async (list) => {
  const dlos = list ? list.split(',').filter((d) => !(d in problems)) : []
  if (!dlos.length) return
  const counts = await problemCounts(orgCall(), org.version, dlos)
  for (const [d, info] of counts) problems[d] = info
})
const streamsFor = computed(() => (catalog.streams || []).filter((s) => s.dlo === selected.value?.name))

function toggleKind(k) {
  kinds.value = kinds.value.includes(k) ? kinds.value.filter((x) => x !== k) : [...kinds.value, k]
}

function pick(name) {
  router.push(`/objects/${encodeURIComponent(name)}`)
}

watch(() => route.params.name, () => {
  fieldText.value = typeof route.query.field === 'string' ? route.query.field : ''
  notice.value = ''
  feeds.value = null
  if (!['fields', 'relationships', 'usedby'].includes(tab.value)) tab.value = 'fields'
})

watch(tab, async (t) => {
  const o = selected.value
  if (!o || t !== 'sources') return
  ensureStreams()
  if (o.kind === 'DMO' && mappings.name !== o.name) {
    Object.assign(mappings, { name: o.name, list: null, error: '', loading: true })
    try {
      const list = await loadMappings(orgCall(), org.version, o.name)
      if (mappings.name === o.name) mappings.list = list
    } catch (err) {
      if (mappings.name === o.name) mappings.error = err.message
    } finally {
      mappings.loading = false
    }
  }
})

async function findFeeds() {
  const name = selected.value.name
  const all = await ensureAllMappings()
  if (selected.value?.name === name) feeds.value = (all || []).filter((m) => m.source === name)
}

async function count(o) {
  counts[o.name] = 'counting'
  try {
    const r = await runQuery(orgCall(), org.version, `SELECT COUNT(*) AS n FROM ${o.name}`, { rowLimit: 1 })
    counts[o.name] = Number(r.rows[0]?.[0] ?? 0)
  } catch (err) {
    counts[o.name] = `Count failed: ${err.message}`
  }
}

async function copy(textValue, what) {
  await navigator.clipboard.writeText(textValue)
  notice.value = `Copied ${what}.`
}

function query(o) {
  router.push({ path: '/sql', query: { sql: selectFor(o) } })
}

// The streams API says NONE for a stream that has never run.
const ran = (s) => (!s.lastRunStatus || s.lastRunStatus === 'NONE' ? 'never run' : s.lastRunStatus)
const time = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const kindClass = { DMO: 'border text-muted-foreground', DLO: 'border text-muted-foreground', CI: 'border text-muted-foreground' }
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
const tabBtn = (t) => ['px-3 py-1.5 text-sm border-b-2', tab.value === t ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground']
</script>

<template>
  <section class="flex gap-4 min-h-0">
    <ListPanel name="objects" label="objects list">
      <div class="flex gap-2">
        <input v-model="text" placeholder="Search objects" class="flex-1 border rounded-md px-2 py-1 bg-background text-sm" />
        <button class="p-1.5 rounded-md border hover:bg-accent" title="Load the metadata again" @click="ensureCatalog({ refresh: true }).then(() => ensureUsage({ refresh: true }))">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': catalog.loading }" />
        </button>
      </div>
      <div class="flex flex-wrap gap-1 text-xs">
        <button
          v-for="k in ['DMO', 'DLO', 'CI']" :key="k"
          :class="['px-2 py-0.5 rounded-md border', kinds.includes(k) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent']"
          @click="toggleKind(k)"
        >{{ k }}</button>
        <select v-model="category" class="ml-auto border rounded-md px-1 py-0.5 bg-background">
          <option value="">All categories</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c.replace(/_/g, ' ') }}</option>
        </select>
      </div>
      <div>
        <button class="text-xs text-link hover:underline" @click="exportOpen = !exportOpen">Export data model</button>
        <div v-if="exportOpen" class="mt-1 p-2 border rounded-md bg-card text-xs space-y-1.5">
          <div class="flex gap-3">
            <label v-for="k in ['DMO', 'DLO', 'CI']" :key="k" class="flex items-center gap-1"><input v-model="exportOpts.kinds" type="checkbox" :value="k" /> {{ k }}s</label>
          </div>
          <label class="flex items-center gap-1"><input v-model="exportOpts.mappings" type="checkbox" /> Field mappings and streams (reads every DMO's mappings)</label>
          <div class="flex gap-3">
            <label class="flex items-center gap-1"><input v-model="exportOpts.format" type="radio" value="html" /> HTML (opens in Word, prints to PDF)</label>
            <label class="flex items-center gap-1"><input v-model="exportOpts.format" type="radio" value="md" /> Markdown</label>
          </div>
          <button class="px-2 py-1 rounded-md bg-primary text-primary-foreground disabled:opacity-50" :disabled="exporting || !exportOpts.kinds.length || !catalog.objects.length" @click="exportModel">
            {{ exporting ? (catalog.mappingsProgress ? `Reading mappings: ${catalog.mappingsProgress}` : 'Building…') : 'Download' }}
          </button>
        </div>
      </div>
      <div class="text-xs text-muted-foreground">
        {{ list.length }} of {{ catalog.objects.length }} objects
        <span v-if="catalog.loadedAt"> · metadata from {{ time(catalog.loadedAt) }}</span>
      </div>
      <div v-if="catalog.errors.length || catalog.error" class="text-xs text-destructive">{{ [catalog.error, ...catalog.errors].filter(Boolean).join('; ') }}</div>
      <ul class="max-h-[72vh] overflow-auto text-sm">
        <li
          v-for="o in list" :key="o.name"
          :class="['px-2 py-1 rounded-md cursor-pointer hover:bg-accent', { 'bg-accent': o.name === selected?.name }]"
          @click="pick(o.name)"
        >
          <div class="flex items-center gap-2">
            <span :class="['text-[10px] px-1.5 rounded', kindClass[o.kind]]">{{ o.kind }}</span>
            <span class="truncate">{{ o.label }}</span>
          </div>
          <div class="font-mono text-[11px] text-muted-foreground truncate">{{ o.name }}</div>
        </li>
      </ul>
    </ListPanel>

    <div class="flex-1 min-w-0 space-y-3">
      <div v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</div>
      <div v-if="!selected" class="text-sm text-muted-foreground p-4">
        {{ catalog.loading ? 'Loading the org\'s Data Cloud metadata…' : 'Pick an object to see its fields, relationships and where its data comes from.' }}
      </div>

      <div v-else class="space-y-3">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold">{{ selected.label }}</h2>
            <div class="font-mono text-sm text-muted-foreground break-all">{{ selected.name }}</div>
            <div class="text-xs text-muted-foreground mt-1 space-x-2">
              <span :class="['px-1.5 rounded', kindClass[selected.kind]]">{{ selected.kind }}</span>
              <span v-if="selected.category">{{ selected.category.replace(/_/g, ' ') }}</span>
              <span>{{ selected.fields.length }} fields</span>
              <span v-if="selected.primaryKeys.length">key {{ selected.primaryKeys.join(', ') }}</span>
              <span v-if="selected.reference">standard: {{ selected.reference }}</span>
              <span v-if="typeof counts[selected.name] === 'number'"><strong>{{ counts[selected.name].toLocaleString() }}</strong> rows</span>
              <span v-else-if="counts[selected.name] && counts[selected.name] !== 'counting'" class="text-destructive">{{ counts[selected.name] }}</span>
            </div>
          </div>
          <div class="ml-auto flex flex-wrap gap-2">
            <a v-if="sfUrl(selected)" :class="btn" :href="sfUrl(selected)" target="_blank" rel="noopener"  title="Open this object in Data Cloud">Open in Salesforce</a>
            <button :class="btn" @click="query(selected)">Query</button>
            <button :class="btn" :disabled="counts[selected.name] === 'counting'" @click="count(selected)">{{ counts[selected.name] === 'counting' ? 'Counting…' : 'Count rows' }}</button>
            <button :class="btn" @click="copy(selectFor(selected), 'the SELECT')">Copy SELECT</button>
            <DownloadMenu :get-markdown="() => objectMarkdown(selected)" :get-sheets="() => [{ name: selected.label, columns: ['Field', 'Label', 'Type', 'Key', 'Key qualifier', 'Used by'], rows: selected.fields.map((f) => [f.name, f.label, f.businessType || f.type, f.primaryKey ? 'yes' : '', f.keyQualifier, (fieldUses.get(f.name) || []).join(', ')]) }]" :file-name="selected.name" />
          </div>
        </div>

        <nav class="flex border-b">
          <button :class="tabBtn('fields')" @click="tab = 'fields'">Fields</button>
          <button :class="tabBtn('relationships')" @click="tab = 'relationships'">Relationships ({{ selected.relationships.length }})</button>
          <button :class="tabBtn('usedby')" @click="tab = 'usedby'">Used by{{ usedCount != null ? ` (${usedCount})` : '' }}</button>
          <button v-if="selected.kind !== 'CI'" :class="tabBtn('sources')" @click="tab = 'sources'">{{ selected.kind === 'DMO' ? 'Mapped from' : 'Stream and mappings' }}</button>
          <button v-else :class="tabBtn('sources')" @click="tab = 'sources'">Definition</button>
        </nav>

        <!-- Fields -->
        <div v-if="tab === 'fields'" class="space-y-2">
          <input v-model="fieldText" placeholder="Filter fields" class="border rounded-md px-2 py-1 bg-background text-sm w-72" />
          <DataTable :columns="fieldCols" :rows="fields" row-key="name" row-class="hover:bg-accent">
            <template #cell-name="{ row: f }">
              <button class="inline-flex items-center gap-1 hover:underline font-mono text-xs" title="Copy the API name" @click="copy(f.name, f.name)">
                <Key v-if="f.primaryKey" class="w-3.5 h-3.5 text-muted-foreground" />{{ f.name }}
              </button>
            </template>
            <template #cell-type="{ value }"><span class="text-xs">{{ value }}</span></template>
            <template #cell-role="{ value }"><span class="text-xs">{{ value }}</span></template>
            <template #cell-keyQualifier="{ value }"><span class="font-mono text-xs text-muted-foreground">{{ value }}</span></template>
            <template #cell-usedBy="{ value }"><span class="text-xs text-muted-foreground">{{ value.join(', ') }}</span></template>
          </DataTable>
        </div>

        <!-- Relationships -->
        <div v-else-if="tab === 'relationships'">
          <p v-if="!selected.relationships.length" class="text-sm text-muted-foreground">No relationships in the metadata.</p>
          <DataTable v-else :columns="relCols" :rows="selected.relationships">
            <template v-for="k in ['from', 'to']" :key="k" #[`cell-${k}`]="{ row: r }">
              <span class="font-mono text-xs">
                <button v-if="r[k] !== selected.name && byName.has(r[k])" class="text-link hover:underline" @click="pick(r[k])">{{ r[k] }}</button>
                <span v-else>{{ r[k] }}</span><span v-if="r[`${k}Field`]" class="text-muted-foreground">.{{ r[`${k}Field`] }}</span>
              </span>
            </template>
            <template #cell-cardinality="{ value }"><span class="text-xs">{{ value }}</span></template>
          </DataTable>
        </div>

        <!-- Used by: insights, segments, activations -->
        <div v-else-if="tab === 'usedby'" class="space-y-3 text-sm">
          <Loading v-if="!catalog.usage" text="Reading calculated insights, segments and activations…" />
          <template v-else>
            <p v-if="!usedCount" class="text-muted-foreground">No calculated insight or segment uses this object.</p>
            <div v-if="used.insights.length" class="border rounded-md bg-card">
              <h4 class="p-2 border-b font-medium">Calculated insights ({{ used.insights.length }})</h4>
              <div v-for="ci in used.insights" :key="ci.name" class="p-2 border-b last:border-0">
                <button v-if="byName.has(ci.name)" class="text-link hover:underline" @click="pick(ci.name)">{{ ci.label }}</button>
                <span v-else>{{ ci.label }}</span>
                <span class="font-mono text-xs text-muted-foreground ml-2">{{ ci.name }}</span>
                <div class="text-xs text-muted-foreground mt-0.5">{{ ci.fields.length ? `Uses ${ci.fields.join(', ')}` : 'Uses the object' }}</div>
              </div>
            </div>
            <div v-if="used.segments.length" class="border rounded-md bg-card">
              <h4 class="p-2 border-b font-medium">Segments ({{ used.segments.length }})</h4>
              <div v-for="sg in used.segments" :key="sg.name" class="p-2 border-b last:border-0">
                <RouterLink :to="`/segments/${sg.name}`" class="text-link hover:underline">{{ sg.label }}</RouterLink>
                <div class="text-xs text-muted-foreground mt-0.5">
                  {{ [sg.isOn ? 'Built on this object' : '', sg.fields.length ? `criteria use ${sg.fields.join(', ')}` : ''].filter(Boolean).join('; ') }}
                </div>
                <ul v-if="sg.activations.length" class="text-xs mt-1 pl-4 list-disc">
                  <li v-for="a in sg.activations" :key="a.id">Activated as {{ a.name }} to {{ a.target }} ({{ a.status.toLowerCase() }})</li>
                </ul>
              </div>
            </div>
            <p class="text-xs text-muted-foreground">Read from calculated insight SQL and segment criteria. Data actions and data graphs are not included yet.</p>
          </template>
        </div>

        <!-- DMO: mapped from -->
        <div v-else-if="selected.kind === 'DMO'" class="space-y-3">
          <Loading v-if="mappings.loading" text="Loading mappings…" />
          <p v-else-if="mappings.error" class="text-sm text-destructive">{{ mappings.error }}</p>
          <p v-else-if="mappings.list && !mappings.list.length" class="text-sm text-muted-foreground">Nothing is mapped to this DMO.</p>
          <div v-for="m in mappings.list || []" :key="m.name" class="border rounded-md bg-card">
            <div class="p-2 border-b flex flex-wrap items-center gap-2 text-sm">
              <button v-if="byName.has(m.source)" class="font-mono text-link hover:underline" @click="pick(m.source)">{{ m.source }}</button>
              <span v-else class="font-mono">{{ m.source }}</span>
              <a v-if="catalog.recordIds?.[m.source]" :href="recordUrl(currentOrg()?.host, catalog.recordIds[m.source])" target="_blank" rel="noopener" title="Open in Salesforce" class="text-link"><ExternalLink class="w-3.5 h-3.5" /></a>
              <span class="text-muted-foreground">{{ m.fields.length }} fields · {{ m.status }}</span>
              <template v-for="s in (catalog.streams || []).filter((s) => s.dlo === m.source)" :key="s.name">
                <a :href="recordUrl(currentOrg()?.host, s.recordId)" target="_blank" rel="noopener" class="text-xs px-1.5 rounded bg-muted hover:underline">stream {{ s.label }}: {{ ran(s) }}{{ s.lastRefreshDate ? `, ${time(s.lastRefreshDate)}` : '' }}</a>
              </template>
            </div>
            <DataTable :columns="mapCols" :rows="m.fields" :row-key="(f) => f.source + f.target" :bordered="false" text-size="text-xs font-mono" />
          </div>
        </div>

        <!-- DLO: stream and the DMOs it feeds -->
        <div v-else-if="selected.kind === 'DLO'" class="space-y-3">
          <Loading v-if="!catalog.streams" text="Loading data streams…" />
          <p v-else-if="!streamsFor.length" class="text-sm text-muted-foreground">No data stream writes to this DLO (it may be filled by a transform or a system process).</p>
          <div v-for="s in streamsFor" :key="s.name" class="border rounded-md bg-card p-3 text-sm grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1">
            <span class="text-muted-foreground">Stream</span><span>{{ s.label }} <span class="font-mono text-xs text-muted-foreground">{{ s.name }}</span>
              <a v-if="s.recordId" :href="recordUrl(currentOrg()?.host, s.recordId)" target="_blank" rel="noopener" class="ml-2 text-xs text-link hover:underline inline-flex items-center gap-1">Open stream</a></span>
            <span class="text-muted-foreground">Source</span><span>{{ s.connector }}{{ s.sourceObject ? `: ${s.sourceObject}` : '' }}{{ s.dataSource ? ` (${s.dataSource})` : '' }}</span>
            <span class="text-muted-foreground">Status</span><span>{{ s.status }}, last run {{ ran(s) }}{{ s.lastRefreshDate ? ` at ${time(s.lastRefreshDate)}` : '' }}</span>
            <span class="text-muted-foreground">Records</span><span>{{ s.totalRecords ?? 'none yet' }}{{ s.lastProcessedRecords != null ? ` (last run processed ${s.lastProcessedRecords})` : '' }}</span>
            <span class="text-muted-foreground">Refresh</span><span>{{ s.frequency }}</span>
            <template v-if="s.problemDlo">
              <span class="text-muted-foreground">Problem records</span>
              <span>
                <template v-if="!problems[s.problemDlo]">…</template>
                <template v-else-if="problems[s.problemDlo].error">could not count ({{ problems[s.problemDlo].error }})</template>
                <template v-else>{{ problems[s.problemDlo].count.toLocaleString() }}{{ problems[s.problemDlo].latest ? `, latest ${time(problems[s.problemDlo].latest)}` : '' }}</template>
                <button class="ml-2 text-xs text-link hover:underline" @click="router.push({ path: '/sql', query: { sql: latestProblemsSql(s.problemDlo) } })">Open in SQL</button>
              </span>
            </template>
          </div>
          <div>
            <button v-if="!feeds" :class="btn" :disabled="!!catalog.mappingsProgress" @click="findFeeds">
              {{ catalog.mappingsProgress ? `Reading mappings: ${catalog.mappingsProgress}` : 'Find the DMOs this DLO maps to' }}
            </button>
            <p v-else-if="!feeds.length" class="text-sm text-muted-foreground">Not mapped to any DMO.</p>
            <ul v-else class="text-sm space-y-1">
              <li v-for="m in feeds" :key="m.name">
                Maps to <button class="font-mono text-link hover:underline" @click="pick(m.target)">{{ m.target }}</button>
                <span class="text-muted-foreground"> ({{ m.fields.length }} fields)</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- CI: definition -->
        <div v-else class="space-y-3 text-sm">
          <Loading v-if="insight.loading" text="Loading the definition…" />
          <p v-else-if="insight.error" class="text-destructive">{{ insight.error }}</p>
          <InsightDefinition v-else-if="insight.data" :ci="insight.data" :partition-by="selected.partitionBy" />
        </div>
      </div>
    </div>
  </section>
</template>
