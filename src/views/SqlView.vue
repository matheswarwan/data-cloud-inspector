<script setup>
import { ref, shallowRef, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatDialect, postgresql } from 'sql-formatter'
import { Save, Copy, Download, Trash2 } from 'lucide-vue-next'
import SqlEditor from '../components/SqlEditor.vue'
import ResultTable from '../components/ResultTable.vue'
import SchemaPanel from '../components/SchemaPanel.vue'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall } from '../app/useCatalog.js'
import { useQueries, loadQueries, saveQuery, deleteQuery, addHistory } from '../app/useQueries.js'
import { sqlSchema } from '../lib/catalog.js'
import { runQuery, fetchRows, fetchAllRows, toCsv, resultMarkdown, PAGE_SIZE } from '../lib/query.js'

const DRAFT = 'dci_sqlDraft'
const route = useRoute()
const router = useRouter()
const org = useOrg()
const catalog = useCatalog()
const queries = useQueries()

const readDraft = () => { try { return localStorage.getItem(DRAFT) } catch { return null } }
const sqlText = ref(readDraft() || 'SELECT ssot__Id__c, ssot__FirstName__c, ssot__LastName__c\nFROM ssot__Individual__dlm\nLIMIT 100')
watch(sqlText, (v) => { try { localStorage.setItem(DRAFT, v) } catch { /* private window */ } })

const schema = computed(() => sqlSchema(catalog.objects))
const editor = ref(null)
const running = ref(false)
const error = ref('')
// shallowRef: rows can run to hundreds of thousands; replaced, never mutated.
const result = shallowRef(null) // { sql, queryId, columns, rows, total, ms }
const busy = ref('') // progress text for load more / download
const notice = ref('')
const savedId = ref(null)
const panel = ref('objects')
let cancelled = false

onMounted(() => {
  ensureCatalog()
  loadQueries()
  takeRouteSql()
})
watch(() => route.query.sql, takeRouteSql)

// /sql?sql=... (from the Objects page) replaces the editor content once.
function takeRouteSql() {
  if (typeof route.query.sql === 'string' && route.query.sql) {
    sqlText.value = route.query.sql
    savedId.value = null
    router.replace({ path: '/sql' })
  }
}

async function run(selected) {
  const sql = (selected || sqlText.value).trim()
  if (!sql || !org.orgId || !org.version || running.value) return
  running.value = true
  cancelled = false
  error.value = ''
  notice.value = ''
  try {
    const r = await runQuery(orgCall(), org.version, sql, { isCancelled: () => cancelled })
    result.value = { sql, ...r }
    addHistory({ sql, host: currentOrg()?.host, rows: r.total })
  } catch (err) {
    error.value = err.message
    result.value = null
    addHistory({ sql, host: currentOrg()?.host, error: err.message })
  } finally {
    running.value = false
  }
}

function cancel() { cancelled = true }

const more = computed(() => result.value && result.value.rows.length < result.value.total)

async function loadMore() {
  const r = result.value
  busy.value = 'Loading…'
  try {
    const page = await fetchRows(orgCall(), org.version, r.queryId, r.rows.length, PAGE_SIZE)
    result.value = { ...r, rows: r.rows.concat(page.rows) }
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = ''
  }
}

function saveFile(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function downloadCsv() {
  const r = result.value
  let rows = r.rows
  if (rows.length < r.total) {
    cancelled = false
    busy.value = `Fetching rows: ${rows.length.toLocaleString()} of ${r.total.toLocaleString()}`
    try {
      const rest = await fetchAllRows(orgCall(), org.version, r.queryId, {
        offset: rows.length, total: r.total, isCancelled: () => cancelled,
        onProgress: (n) => { busy.value = `Fetching rows: ${n.toLocaleString()} of ${r.total.toLocaleString()}` },
      })
      rows = rows.concat(rest)
    } catch (err) {
      error.value = `Download stopped: ${err.message}`
      busy.value = ''
      return
    }
    busy.value = ''
    if (r.total > 500000) notice.value = 'The CSV has the first 500,000 rows.'
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  saveFile(toCsv(r.columns, rows), `data-cloud-query-${stamp}.csv`, 'text/csv')
}

async function copyMarkdown() {
  const r = result.value
  await navigator.clipboard.writeText(resultMarkdown(r.sql, r.columns, r.rows, { total: r.total }))
  notice.value = 'Copied the SQL and the first 50 rows as Markdown.'
}

function formatSql() {
  try {
    sqlText.value = formatDialect(sqlText.value, { dialect: postgresql, keywordCase: 'upper' })
  } catch (err) {
    error.value = `Could not format: ${err.message}`
  }
}

async function save() {
  const current = queries.saved.find((q) => q.id === savedId.value)
  const name = prompt('Name for this query', current?.name || '')
  if (!name) return
  savedId.value = await saveQuery({ id: savedId.value, name, sql: sqlText.value })
  notice.value = `Saved "${name}".`
}

function open(sql, id = null) {
  sqlText.value = sql
  savedId.value = id
}

async function remove(q) {
  if (confirm(`Delete the saved query "${q.name}"?`)) {
    await deleteQuery(q.id)
    if (savedId.value === q.id) savedId.value = null
  }
}

const when = (iso) => new Date(iso).toLocaleString()
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
</script>

<template>
  <section class="flex gap-4 min-h-0">
    <aside class="w-72 shrink-0 space-y-2">
      <div class="flex gap-1 text-sm">
        <button :class="['px-2 py-1 rounded-md', panel === 'objects' ? 'bg-accent font-medium' : 'hover:bg-accent']" @click="panel = 'objects'">Objects</button>
        <button :class="['px-2 py-1 rounded-md', panel === 'saved' ? 'bg-accent font-medium' : 'hover:bg-accent']" @click="panel = 'saved'">Saved</button>
        <button :class="['px-2 py-1 rounded-md', panel === 'history' ? 'bg-accent font-medium' : 'hover:bg-accent']" @click="panel = 'history'">History</button>
      </div>
      <SchemaPanel v-if="panel === 'objects'" @insert="(t) => editor?.insert(t)" />
      <ul v-else-if="panel === 'saved'" class="text-sm space-y-0.5 max-h-[75vh] overflow-auto">
        <li v-if="!queries.saved.length" class="text-muted-foreground text-xs p-2">No saved queries yet.</li>
        <li
          v-for="q in queries.saved" :key="q.id"
          :class="['group flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer hover:bg-accent', { 'bg-accent': q.id === savedId }]"
          @click="open(q.sql, q.id)"
        >
          <span class="flex-1 truncate" :title="q.sql">{{ q.name }}</span>
          <button class="opacity-0 group-hover:opacity-100 p-0.5" title="Delete" @click.stop="remove(q)"><Trash2 class="w-3.5 h-3.5" /></button>
        </li>
      </ul>
      <ul v-else class="text-xs space-y-1 max-h-[75vh] overflow-auto">
        <li v-if="!queries.history.length" class="text-muted-foreground p-2">Queries you run show here.</li>
        <li v-for="h in queries.history" :key="h.at" class="px-2 py-1 rounded-md cursor-pointer hover:bg-accent" @click="open(h.sql)">
          <div class="font-mono truncate" :title="h.sql">{{ h.sql.replace(/\s+/g, ' ') }}</div>
          <div class="text-muted-foreground">{{ when(h.at) }} · {{ h.error ? 'failed' : `${(h.rows ?? 0).toLocaleString()} rows` }}</div>
        </li>
      </ul>
    </aside>

    <div class="flex-1 min-w-0 space-y-3">
      <div class="h-56">
        <SqlEditor ref="editor" v-model="sqlText" :schema="schema" @run="run" />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button v-if="!running" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="!org.version" title="Ctrl+Enter or Cmd+Enter; runs the selection when there is one" @click="run(editor?.selection())">
          Run
        </button>
        <button v-else :class="btn" @click="cancel">Stop waiting</button>
        <button :class="btn" @click="formatSql">Format</button>
        <button :class="btn" @click="save">{{ savedId ? 'Save' : 'Save as' }}</button>
        <span class="text-xs text-muted-foreground ml-2">
          {{ catalog.loading ? 'Loading table names for autocomplete…' : catalog.objects.length ? `${catalog.objects.length} objects in autocomplete` : '' }}
        </span>
      </div>

      <div v-if="error" class="p-3 rounded-md border border-destructive text-sm whitespace-pre-wrap">{{ error }}</div>
      <div v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</div>
      <div v-if="running" class="text-sm text-muted-foreground">Running…</div>

      <div v-if="result" class="space-y-2">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span>
            <strong>{{ result.rows.length.toLocaleString() }}</strong> of {{ result.total.toLocaleString() }} rows
            <span class="text-muted-foreground">· {{ (result.ms / 1000).toFixed(1) }} s</span>
          </span>
          <button v-if="more" :class="btn" :disabled="!!busy" @click="loadMore">Load {{ Math.min(1000, result.total - result.rows.length).toLocaleString() }} more</button>
          <button :class="btn" :disabled="!!busy || !result.columns.length" @click="downloadCsv">Download CSV</button>
          <button :class="btn" :disabled="!result.columns.length" @click="copyMarkdown">Copy for AI</button>
          <span v-if="busy" class="text-muted-foreground">{{ busy }} <button class="underline" @click="cancel">stop</button></span>
        </div>
        <ResultTable :columns="result.columns" :rows="result.rows" />
      </div>
    </div>
  </section>
</template>
