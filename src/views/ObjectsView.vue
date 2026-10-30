<script setup>
import PageHeader from '../components/PageHeader.vue'
import DownloadMenu from '../components/DownloadMenu.vue'
import Loading from '../components/Loading.vue'
import ListPanel from '../components/ListPanel.vue'
import DataTable from '../components/DataTable.vue'
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Boxes, ChevronDown, Copy, Database, ExternalLink, Key, KeyRound, Network, RefreshCw, Search } from 'lucide-vue-next'
import { useOrg, currentOrg, orgName, orgTitle } from '../app/useOrg.js'
import { recordUrl, dmoUrl } from '../lib/links.js'
import { useCatalog, ensureCatalog, ensureStreams, ensureAllMappings, ensureRecordIds, ensureUsage, orgCall } from '../app/useCatalog.js'
import { usageOf, fieldUsage } from '../lib/usage.js'
import { problemCounts, latestProblemsSql } from '../lib/problems.js'
import { buildModel, modelMarkdown, modelHtml } from '../lib/modelDoc.js'
import { docFrom, sheetsFrom } from '../lib/tableDoc.js'
import { loadInsight, baseInsightName } from '../lib/insights.js'
import InsightDefinition from '../components/InsightDefinition.vue'
import { filterObjects, selectFor, objectMarkdown, lookupName, lookupObject } from '../lib/catalog.js'
import { loadMappings } from '../lib/lineage.js'
import MappingDiagram from '../components/MappingDiagram.vue'
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
const onlyUsed = ref(false) // Fields tab: only fields something uses
const openUses = ref({}) // Fields tab: Used by lists shown in full
watch(() => route.query.field, (f) => { if (typeof f === 'string') { fieldText.value = f; tab.value = 'fields' } })
const notice = ref('')
const counts = reactive({}) // object name -> number | 'counting' | error text
const mappings = reactive({ name: '', list: null, error: '', loading: false })
const feeds = ref(null) // DMOs a DLO maps to
const mapView = ref((() => { try { return localStorage.getItem('dci_mapView') || 'diagram' } catch { return 'diagram' } })())
function setMapView(v) { mapView.value = v; try { localStorage.setItem('dci_mapView', v) } catch { /* not kept */ } }

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

// Not in the (cached) list: look the name up with SQL (feedback #1012).
const lookupTarget = computed(() => (list.value.length ? '' : lookupName(text.value)))
const lookup = ref(null) // { name, loading, error, columns, rows }
watch(lookupTarget, () => { lookup.value = null })
async function lookUp() {
  const name = lookupTarget.value
  lookup.value = { name, loading: true, error: '', columns: [], rows: 0 }
  try {
    const r = await lookupObject((sql) => runQuery(orgCall(), org.version, sql, { rowLimit: 1 }), name)
    if (lookup.value?.name === name) lookup.value = { ...r, loading: false, error: '' }
  } catch (e) {
    if (lookup.value?.name === name) lookup.value = { name, loading: false, error: e.message, columns: [], rows: 0 }
  }
}
const openLookupInSql = () => router.push({ path: '/sql', query: { sql: `SELECT * FROM ${lookup.value.name} LIMIT 100` } })
const byName = computed(() => new Map(catalog.objects.map((o) => [o.name, o])))
const selected = computed(() => byName.value.get(route.params.name) || null)
const fields = computed(() => {
  const t = fieldText.value.trim().toLowerCase()
  const all = (selected.value?.fields || []).filter((f) => !onlyUsed.value || (fieldUses.value.get(f.name) || []).length)
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
// Download of the list as filtered (feedback #149)
const objCols = [
  { key: 'label', label: 'Object' }, { key: 'name', label: 'API name' }, { key: 'kind', label: 'Kind' },
  { key: 'category', label: 'Category', value: (o) => (o.category || '').replace(/_/g, ' ') }, { key: 'fields', label: 'Fields', value: (o) => o.fields.length },
]
const listSections = () => [{ heading: 'Objects', columns: objCols, rows: list.value }]
const listDoc = () => docFrom({ title: 'Data Cloud objects', intro: `${orgTitle(org.orgId)}, data space ${org.dataSpace || 'default'}. ${list.value.length} objects${text.value.trim() ? ` matching "${text.value.trim()}"` : ''}.`, sections: listSections() })

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
    const model = buildModel({ objects: catalog.objects, kinds: exportOpts.kinds, mappings: mappings || [], streams: streams || [], usage, host: orgTitle(org.orgId), dataSpace: org.dataSpace })
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
  // Mappings already read (Preload or an earlier search): show the DLO's at once (feedback #1027).
  if (o.kind === 'DLO' && !feeds.value && catalog.mappings) feeds.value = catalog.mappings.filter((m) => m.source === o.name)
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
const kindClass = { DMO: 'dci-badge dci-badge-teal', DLO: 'dci-badge dci-badge-blue', CI: 'dci-badge dci-badge-violet' }
const btn = 'dci-btn'
const tabBtn = (t) => ['dci-tab', tab.value === t ? 'is-on' : '']
</script>

<template>
  <div class="space-y-5">
  <PageHeader path="/objects" topic="objects">Every DLO, DMO and calculated insight in the selected data space, with its fields.
    <template #actions>
      <button class="dci-btn" :aria-expanded="exportOpen" @click="exportOpen = !exportOpen"><Network class="w-4 h-4" /> Export data model</button>
      <DownloadMenu label="Download list" :get-doc="listDoc" :get-sheets="() => sheetsFrom(listSections())" file-name="objects" :disabled="!list.length" />
    </template>
  </PageHeader>
  <section class="flex gap-4 min-h-0">
    <ListPanel name="objects" label="objects list">
      <div class="flex gap-2">
        <label class="dci-search flex-1"><Search class="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" /><input v-model="text" placeholder="Search objects" /></label>
        <button class="dci-btn-icon" title="Load the metadata again" @click="ensureCatalog({ refresh: true }).then(() => ensureUsage({ refresh: true }))">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': catalog.loading }" />
        </button>
      </div>
      <div class="flex flex-wrap gap-1 text-xs">
        <button
          v-for="k in ['DMO', 'DLO', 'CI']" :key="k"
          :class="['dci-chip', kinds.includes(k) ? 'is-on' : '']" :aria-pressed="kinds.includes(k)"
          @click="toggleKind(k)"
        >{{ k }}</button>
        <select v-model="category" class="ml-auto h-7 rounded-full border bg-card px-2.5 text-xs" aria-label="Category">
          <option value="">All categories</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c.replace(/_/g, ' ') }}</option>
        </select>
      </div>
      <div>
        <div v-if="exportOpen" class="p-3 border rounded-xl bg-muted/40 text-xs space-y-1.5">
          <div class="font-semibold text-sm">Export data model</div>
          <div class="flex gap-3">
            <label v-for="k in ['DMO', 'DLO', 'CI']" :key="k" class="flex items-center gap-1"><input v-model="exportOpts.kinds" type="checkbox" :value="k" /> {{ k }}s</label>
          </div>
          <label class="flex items-center gap-1"><input v-model="exportOpts.mappings" type="checkbox" /> Field mappings and streams (reads every DMO's mappings)</label>
          <div class="flex gap-3">
            <label class="flex items-center gap-1"><input v-model="exportOpts.format" type="radio" value="html" /> HTML (opens in Word, prints to PDF)</label>
            <label class="flex items-center gap-1"><input v-model="exportOpts.format" type="radio" value="md" /> Markdown</label>
          </div>
          <button class="dci-btn-primary dci-btn-sm" :disabled="exporting || !exportOpts.kinds.length || !catalog.objects.length" @click="exportModel">
            {{ exporting ? (catalog.mappingsProgress ? `Reading mappings: ${catalog.mappingsProgress}` : 'Building…') : 'Download' }}
          </button>
        </div>
      </div>
      <div class="text-xs text-muted-foreground">
        <strong class="text-foreground">{{ list.length }} of {{ catalog.objects.length }} objects</strong>
        <span v-if="catalog.loadedAt"> · metadata from {{ time(catalog.loadedAt) }}</span>
      </div>
      <div v-if="lookupTarget" class="text-xs p-2 border rounded-xl bg-card space-y-1.5">
        <p>Not in this list<span v-if="catalog.loadedAt"> (read {{ time(catalog.loadedAt) }})</span>. Refresh the list, or ask Data Cloud whether it can read <span class="font-mono">{{ lookupTarget }}</span>.</p>
        <button class="px-2 py-1 rounded-md border hover:bg-accent disabled:opacity-50" :disabled="lookup?.loading" @click="lookUp">{{ lookup?.loading ? 'Looking…' : 'Look it up in Data Cloud' }}</button>
        <template v-if="lookup && !lookup.loading">
          <p v-if="lookup.error" class="text-destructive">{{ lookup.error }}</p>
          <template v-else>
            <p><b>Data Cloud can read it</b>: {{ lookup.columns.length }} fields, {{ lookup.rows ? 'has rows' : 'no rows yet' }}. It is missing from the metadata list (the list may be older than the object, or leave it out).</p>
            <p class="font-mono text-muted-foreground break-all">{{ lookup.columns.map((c) => c.name).join(', ') }}</p>
            <button class="text-link hover:underline" @click="openLookupInSql">Open in SQL</button>
          </template>
        </template>
      </div>
      <div v-if="catalog.errors.length || catalog.error" class="text-xs text-destructive">{{ [catalog.error, ...catalog.errors].filter(Boolean).join('; ') }}</div>
      <ul class="max-h-[72vh] overflow-auto text-sm">
        <li
          v-for="o in list" :key="o.name"
          :class="['px-2.5 py-1.5 rounded-lg cursor-pointer border', o.name === selected?.name ? 'bg-teal-50 border-teal-200 dark:bg-teal-500/10 dark:border-teal-500/30' : 'border-transparent hover:bg-accent']"
          @click="pick(o.name)"
        >
          <div class="flex items-center gap-2">
            <span :class="[kindClass[o.kind], 'text-[10px] px-1.5 py-0']">{{ o.kind }}</span>
            <span class="truncate">{{ o.label }}</span>
          </div>
          <div class="font-mono text-[11px] text-muted-foreground truncate">{{ o.name }}</div>
        </li>
      </ul>
    </ListPanel>

    <div class="flex-1 min-w-0 space-y-3">
      <div v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</div>
      <div v-if="!selected" class="dci-card relative overflow-hidden min-h-[60vh] flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div aria-hidden="true" class="pointer-events-none absolute w-[640px] max-w-full h-[300px] rounded-[50%] bg-teal-600/10 blur-[60px]" />
        <span class="relative w-14 h-14 rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300 flex items-center justify-center"><Boxes class="w-6 h-6" aria-hidden="true" /></span>
        <h2 class="relative text-lg font-semibold">{{ catalog.loading ? 'Loading the metadata…' : 'Pick an object' }}</h2>
        <p class="relative text-sm text-muted-foreground">{{ catalog.loading ? 'Reading the org\'s Data Cloud objects.' : 'See its fields, relationships and where its data comes from.' }}</p>
        <div class="relative flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span><span class="dci-badge dci-badge-teal">DMO</span> Data model object</span>
          <span><span class="dci-badge dci-badge-blue">DLO</span> Data lake object</span>
          <span><span class="dci-badge dci-badge-violet">CI</span> Calculated insight</span>
        </div>
      </div>

      <div v-expand v-else class="dci-card p-5 space-y-4">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 space-y-1.5">
            <h2 class="text-2xl font-bold leading-[30px]">{{ selected.label }}</h2>
            <div class="flex items-center gap-1.5 font-mono text-[13px] text-muted-foreground break-all">{{ selected.name }}<button class="p-1 rounded hover:bg-accent" title="Copy the API name" aria-label="Copy the API name" @click="copy(selected.name, 'the API name')"><Copy class="w-3.5 h-3.5" /></button></div>
            <div class="flex flex-wrap items-center gap-1.5 text-xs">
              <span :class="kindClass[selected.kind]">{{ selected.kind }}</span>
              <span v-if="selected.category" class="dci-badge">{{ selected.category.replace(/_/g, ' ') }}</span>
              <span class="dci-badge">{{ selected.fields.length }} fields</span>
              <span v-if="selected.primaryKeys.length" class="dci-badge dci-badge-amber"><KeyRound class="w-3 h-3" /> Key <span class="font-mono">{{ selected.primaryKeys.join(', ') }}</span></span>
              <span v-if="selected.reference" class="dci-badge">standard: {{ selected.reference }}</span>
              <span v-if="typeof counts[selected.name] === 'number'" class="dci-badge dci-badge-green">{{ counts[selected.name].toLocaleString() }} rows</span>
              <span v-else-if="counts[selected.name] && counts[selected.name] !== 'counting'" class="text-destructive">{{ counts[selected.name] }}</span>
            </div>
          </div>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <button class="dci-btn-primary" @click="query(selected)"><Database class="w-4 h-4" /> Query</button>
            <button class="dci-btn" :disabled="counts[selected.name] === 'counting'" @click="count(selected)">{{ counts[selected.name] === 'counting' ? 'Counting…' : 'Count rows' }}</button>
            <button class="dci-btn" @click="copy(selectFor(selected), 'the SELECT')">Copy SELECT</button>
            <a v-if="sfUrl(selected)" class="dci-btn-icon" :href="sfUrl(selected)" target="_blank" rel="noopener" title="Open this object in Data Cloud" aria-label="Open in Salesforce"><ExternalLink class="w-4 h-4" /></a>
            <DownloadMenu :get-markdown="() => objectMarkdown(selected)" :get-sheets="() => [{ name: selected.label, columns: ['Field', 'Label', 'Type', 'Key', 'Key qualifier', 'Used by'], rows: selected.fields.map((f) => [f.name, f.label, f.businessType || f.type, f.primaryKey ? 'yes' : '', f.keyQualifier, (fieldUses.get(f.name) || []).join(', ')]) }]" :file-name="selected.name" />
          </div>
        </div>

        <nav class="dci-tabs -mx-5 px-3">
          <button :class="tabBtn('fields')" @click="tab = 'fields'">Fields <span class="dci-count">{{ selected.fields.length }}</span></button>
          <button :class="tabBtn('relationships')" @click="tab = 'relationships'">Relationships <span class="dci-count">{{ selected.relationships.length }}</span></button>
          <button :class="tabBtn('usedby')" @click="tab = 'usedby'">Used by <span v-if="usedCount != null" class="dci-count">{{ usedCount }}</span></button>
          <button v-if="selected.kind !== 'CI'" :class="tabBtn('sources')" @click="tab = 'sources'">{{ selected.kind === 'DMO' ? 'Mapped from' : 'Stream and mappings' }}</button>
          <button v-else :class="tabBtn('sources')" @click="tab = 'sources'">Definition</button>
        </nav>

        <!-- Fields -->
        <div v-if="tab === 'fields'" class="space-y-2">
          <div class="flex flex-wrap items-center gap-3">
            <label class="dci-search w-full max-w-sm"><Search class="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" /><input v-model="fieldText" placeholder="Filter fields" aria-label="Filter fields" /></label>
            <label class="inline-flex items-center gap-2 text-sm"><input v-model="onlyUsed" type="checkbox" /> Only fields in use</label>
          </div>
          <DataTable :columns="fieldCols" :rows="fields" row-key="name" row-class="hover:bg-accent">
            <template #cell-name="{ row: f }">
              <button class="inline-flex items-center gap-1 hover:underline font-mono text-xs" title="Copy the API name" @click="copy(f.name, f.name)">
                <Key v-if="f.primaryKey" class="w-3.5 h-3.5 text-amber-600" aria-label="Primary key" />{{ f.name }}
              </button>
            </template>
            <template #cell-type="{ value }"><span class="text-xs">{{ value }}</span></template>
            <template #cell-role="{ value }"><span class="text-xs">{{ value }}</span></template>
            <template #cell-keyQualifier="{ value }"><span class="font-mono text-xs text-muted-foreground">{{ value }}</span></template>
            <template #cell-usedBy="{ row: f, value }">
              <span v-if="value.length" class="text-xs">
                {{ value[0] }}<button v-if="value.length > 1" class="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-teal-700 dark:text-teal-300 hover:underline" :aria-expanded="!!openUses[f.name]" @click="openUses = { ...openUses, [f.name]: !openUses[f.name] }">+{{ value.length - 1 }} more<ChevronDown class="w-3 h-3" /></button>
                <span v-if="openUses[f.name]" class="mt-1.5 block rounded-lg bg-muted/60 px-2.5 py-1.5 space-y-0.5"><span v-for="u in value.slice(1)" :key="u" class="block">{{ u }}</span></span>
              </span>
            </template>
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
            <div v-if="used.insights.length" class="border rounded-xl bg-card">
              <h4 class="p-2 border-b font-medium">Calculated insights ({{ used.insights.length }})</h4>
              <div v-for="ci in used.insights" :key="ci.name" class="p-2 border-b last:border-0">
                <button v-if="byName.has(ci.name)" class="text-link hover:underline" @click="pick(ci.name)">{{ ci.label }}</button>
                <span v-else>{{ ci.label }}</span>
                <span class="font-mono text-xs text-muted-foreground ml-2">{{ ci.name }}</span>
                <div class="text-xs text-muted-foreground mt-0.5">{{ ci.fields.length ? `Uses ${ci.fields.join(', ')}` : 'Uses the object' }}</div>
              </div>
            </div>
            <div v-if="used.segments.length" class="border rounded-xl bg-card">
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
          <div v-if="mappings.list?.length" class="dci-seg"><button :class="['dci-seg-item', mapView === 'diagram' ? 'is-on' : '']" @click="setMapView('diagram')">Diagram</button><button :class="['dci-seg-item', mapView === 'table' ? 'is-on' : '']" @click="setMapView('table')">Table</button></div>
          <div v-for="m in mappings.list || []" :key="m.name" class="border rounded-xl bg-card">
            <div class="p-2 border-b flex flex-wrap items-center gap-2 text-sm">
              <button v-if="byName.has(m.source)" class="font-mono text-link hover:underline" @click="pick(m.source)">{{ m.source }}</button>
              <span v-else class="font-mono">{{ m.source }}</span>
              <a v-if="catalog.recordIds?.[m.source]" :href="recordUrl(currentOrg()?.host, catalog.recordIds[m.source])" target="_blank" rel="noopener" title="Open in Salesforce" class="text-link"><ExternalLink class="w-3.5 h-3.5" /></a>
              <span class="text-muted-foreground">{{ m.fields.length }} fields · {{ m.status }}</span>
              <template v-for="s in (catalog.streams || []).filter((s) => s.dlo === m.source)" :key="s.name">
                <a :href="recordUrl(currentOrg()?.host, s.recordId)" target="_blank" rel="noopener" class="text-xs px-1.5 rounded bg-muted hover:underline">stream {{ s.label }}: {{ ran(s) }}{{ s.lastRefreshDate ? `, ${time(s.lastRefreshDate)}` : '' }}</a>
              </template>
            </div>
            <div class="p-3">
              <MappingDiagram v-if="mapView === 'diagram'" :mapping="m" :source-object="byName.get(m.source) || null" :target-object="selected" @pick="pick" />
              <DataTable v-else :columns="mapCols" :rows="m.fields" :row-key="(f) => f.source + f.target" :bordered="false" text-size="text-xs font-mono" />
            </div>
          </div>
        </div>

        <!-- DLO: stream and the DMOs it feeds -->
        <div v-else-if="selected.kind === 'DLO'" class="space-y-3">
          <Loading v-if="!catalog.streams" text="Loading data streams…" />
          <p v-else-if="!streamsFor.length" class="text-sm text-muted-foreground">No data stream writes to this DLO (it may be filled by a transform or a system process).</p>
          <div v-for="s in streamsFor" :key="s.name" class="border rounded-xl bg-card p-3 text-sm grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1">
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
            <div v-else class="space-y-3">
              <div class="dci-seg"><button :class="['dci-seg-item', mapView === 'diagram' ? 'is-on' : '']" @click="setMapView('diagram')">Diagram</button><button :class="['dci-seg-item', mapView === 'table' ? 'is-on' : '']" @click="setMapView('table')">Table</button></div>
              <div v-for="m in feeds" :key="m.name" class="border rounded-xl bg-card">
                <div class="p-2 border-b flex flex-wrap items-center gap-2 text-sm">
                  Maps to <button class="font-mono text-link hover:underline" @click="pick(m.target)">{{ m.target }}</button>
                  <span class="text-muted-foreground">{{ m.fields.length }} fields{{ m.status ? ` · ${m.status}` : '' }}</span>
                </div>
                <div class="p-3">
                  <MappingDiagram v-if="mapView === 'diagram'" :mapping="m" :source-object="selected" :target-object="byName.get(m.target) || null" @pick="pick" />
                  <DataTable v-else :columns="mapCols" :rows="m.fields" :row-key="(f) => f.source + f.target" :bordered="false" text-size="text-xs font-mono" />
                </div>
              </div>
            </div>
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
  </div>
</template>
