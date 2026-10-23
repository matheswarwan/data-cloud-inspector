<script setup>
import DownloadMenu from '../components/DownloadMenu.vue'
import { ref, reactive, markRaw, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatDialect, postgresql } from 'sql-formatter'
import { Trash2, X, Plus } from 'lucide-vue-next'
import { askText, askConfirm } from '../app/useDialog.js'
import SqlEditor from '../components/SqlEditor.vue'
import ResultTable from '../components/ResultTable.vue'
import SchemaPanel from '../components/SchemaPanel.vue'
import { useOrg, currentOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall } from '../app/useCatalog.js'
import { useQueries, loadQueries, saveQuery, deleteQuery, addHistory } from '../app/useQueries.js'
import { sqlSchema } from '../lib/catalog.js'
import { runQuery, fetchRows, fetchAllRows, toCsv, resultMarkdown, PAGE_SIZE } from '../lib/query.js'

const DRAFT = 'dci_sqlDraft'
const LAYOUT = 'dci_sqlLayout'
const route = useRoute()
const router = useRouter()
const org = useOrg()
const catalog = useCatalog()
const queries = useQueries()

// Editor height and side panel width can be dragged (feedback #87) and are remembered.
const DEFAULT_LAYOUT = { editor: 224, panel: 288 }
function readLayout() {
  try { return { ...DEFAULT_LAYOUT, ...JSON.parse(localStorage.getItem(LAYOUT) || '{}') } } catch { return { ...DEFAULT_LAYOUT } }
}
const layout = ref(readLayout())
watch(layout, (v) => { try { localStorage.setItem(LAYOUT, JSON.stringify(v)) } catch { /* private window */ } }, { deep: true })

function drag(e, key, axis, min, max) {
  e.preventDefault()
  const start = axis === 'y' ? e.clientY : e.clientX
  const from = layout.value[key]
  const move = (ev) => {
    const delta = (axis === 'y' ? ev.clientY : ev.clientX) - start
    layout.value[key] = Math.round(Math.min(max(), Math.max(min, from + delta)))
  }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.userSelect = '' }
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
const dragEditor = (e) => drag(e, 'editor', 'y', 100, () => window.innerHeight * 0.85)
const dragPanel = (e) => drag(e, 'panel', 'x', 200, () => window.innerWidth * 0.5)
function resetLayout(key) { layout.value[key] = DEFAULT_LAYOUT[key] }

// Query tabs (feedback #92): each tab has its own SQL, editor, result and saved-query link,
// and runs on its own, so several queries can run at once. The tabs' SQL is remembered.
const TABS = 'dci_sqlTabs'
const MAX_TABS = 12
const DEFAULT_SQL = 'SELECT ssot__Id__c, ssot__FirstName__c, ssot__LastName__c\nFROM ssot__Individual__dlm\nLIMIT 100'
let nextId = 1
const newTab = (sql = '', extra = {}) => reactive({ id: `t${Date.now().toString(36)}${nextId++}`, title: '', sql, savedId: null, running: false, error: '', notice: '', busy: '', result: null, unseen: false, ...extra })

function readTabs() {
  try {
    const saved = JSON.parse(localStorage.getItem(TABS) || 'null')
    if (saved?.tabs?.length) return { tabs: saved.tabs.map((t) => newTab(t.sql, { id: t.id, title: t.title || '', savedId: t.savedId || null })), active: saved.active }
  } catch { /* fall through */ }
  let draft = null
  try { draft = localStorage.getItem(DRAFT) } catch { /* private window */ }
  const t = newTab(draft || DEFAULT_SQL)
  return { tabs: [t], active: t.id }
}
const initial = readTabs()
const tabs = reactive(initial.tabs)
const activeId = ref(initial.tabs.some((t) => t.id === initial.active) ? initial.active : initial.tabs[0].id)
const tab = computed(() => tabs.find((t) => t.id === activeId.value) || tabs[0])
watch(() => [tabs.map((t) => [t.id, t.title, t.sql, t.savedId]), activeId.value], () => {
  try { localStorage.setItem(TABS, JSON.stringify({ active: activeId.value, tabs: tabs.map((t) => ({ id: t.id, title: t.title, sql: t.sql, savedId: t.savedId })) })) } catch { /* private window */ }
}, { deep: true })
watch(activeId, (id) => { const t = tabs.find((x) => x.id === id); if (t) t.unseen = false })

const tabTitle = (t, i) => t.title || queries.saved.find((q) => q.id === t.savedId)?.name || `Query ${i + 1}`
const isBlank = (t) => !t.sql.trim() || t.sql === DEFAULT_SQL

function addTab(sql = '', extra = {}) {
  if (tabs.length >= MAX_TABS) { tab.value.notice = `At most ${MAX_TABS} tabs; close one first.`; return tab.value }
  const t = newTab(sql, extra)
  tabs.push(t)
  activeId.value = t.id
  return t
}

async function closeTab(t) {
  const saved = queries.saved.find((q) => q.id === t.savedId)
  if (t.sql.trim() && !isBlank(t) && (!saved || saved.sql !== t.sql)) {
    const ok = await askConfirm({ title: `Close ${tabTitle(t, tabs.indexOf(t))}?`, message: 'Its SQL is not saved.', primary: 'Close tab', danger: true })
    if (!ok) return
  }
  cancelFlags[t.id] = true
  const i = tabs.indexOf(t)
  tabs.splice(i, 1)
  if (!tabs.length) tabs.push(newTab(DEFAULT_SQL))
  if (activeId.value === t.id) activeId.value = tabs[Math.max(0, i - 1)].id
}

async function renameTab(t) {
  const r = await askText({ title: 'Rename tab', value: tabTitle(t, tabs.indexOf(t)), primary: 'Rename' })
  if (r) t.title = r.value
}

// Opens SQL in the current tab when it is empty, otherwise in a new one.
function openSql(sql, extra = {}) {
  if (isBlank(tab.value) && !tab.value.running) Object.assign(tab.value, { sql, savedId: null, title: '', result: null, error: '', notice: '' }, extra)
  else addTab(sql, extra)
}

const schema = computed(() => sqlSchema(catalog.objects))
const editors = {}
// Looked up on each use: the editors register after the first render.
const editor = () => editors[activeId.value]
const panel = ref('objects')
const cancelFlags = {}

onMounted(() => {
  ensureCatalog()
  loadQueries()
  takeRouteSql()
})
watch(() => route.query.sql, takeRouteSql)

// /sql?sql=... (from Objects, Segments, Profiles) opens the SQL once.
function takeRouteSql() {
  if (typeof route.query.sql === 'string' && route.query.sql) {
    openSql(route.query.sql)
    router.replace({ path: '/sql' })
  }
}

async function run(selected, t = tab.value) {
  const sql = (selected || t.sql).trim()
  if (!sql || !org.orgId || !org.version || t.running) return
  t.running = true
  cancelFlags[t.id] = false
  t.error = ''
  t.notice = ''
  try {
    const r = await runQuery(orgCall(), org.version, sql, { isCancelled: () => cancelFlags[t.id] })
    // markRaw: rows can run to hundreds of thousands; replaced, never mutated.
    t.result = markRaw({ sql, ...r })
    addHistory({ sql, host: currentOrg()?.host, rows: r.total })
  } catch (err) {
    t.error = err.message
    t.result = null
    addHistory({ sql, host: currentOrg()?.host, error: err.message })
  } finally {
    t.running = false
    if (t.id !== activeId.value) t.unseen = true
  }
}

function cancel(t = tab.value) { cancelFlags[t.id] = true }

const more = computed(() => tab.value.result && tab.value.result.rows.length < tab.value.result.total)

async function loadMore() {
  const t = tab.value
  const r = t.result
  t.busy = 'Loading…'
  try {
    const page = await fetchRows(orgCall(), org.version, r.queryId, r.rows.length, PAGE_SIZE)
    t.result = markRaw({ ...r, rows: r.rows.concat(page.rows) })
  } catch (err) {
    t.error = err.message
  } finally {
    t.busy = ''
  }
}

function saveFile(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function downloadCsv() {
  const t = tab.value
  const r = t.result
  let rows = r.rows
  if (rows.length < r.total) {
    cancelFlags[t.id] = false
    t.busy = `Fetching rows: ${rows.length.toLocaleString()} of ${r.total.toLocaleString()}`
    try {
      const rest = await fetchAllRows(orgCall(), org.version, r.queryId, {
        offset: rows.length, total: r.total, isCancelled: () => cancelFlags[t.id],
        onProgress: (n) => { t.busy = `Fetching rows: ${n.toLocaleString()} of ${r.total.toLocaleString()}` },
      })
      rows = rows.concat(rest)
    } catch (err) {
      t.error = `Download stopped: ${err.message}`
      t.busy = ''
      return
    }
    t.busy = ''
    if (r.total > 500000) t.notice = 'The CSV has the first 500,000 rows.'
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  saveFile(toCsv(r.columns, rows), `data-cloud-query-${stamp}.csv`, 'text/csv')
}

async function copyMarkdown() {
  const r = tab.value.result
  await navigator.clipboard.writeText(resultMarkdown(r.sql, r.columns, r.rows, { total: r.total }))
  tab.value.notice = 'Copied the SQL and the first 50 rows as Markdown.'
}

function formatSql() {
  try {
    tab.value.sql = formatDialect(tab.value.sql, { dialect: postgresql, keywordCase: 'upper' })
  } catch (err) {
    tab.value.error = `Could not format: ${err.message}`
  }
}

// Save in a dialog (feedback #92). A tab that is a saved query can be updated or saved as new.
async function save() {
  const t = tab.value
  const current = queries.saved.find((q) => q.id === t.savedId)
  const r = await askText({
    title: current ? 'Save query' : 'Save as',
    label: 'Name',
    value: current?.name || (t.title || ''),
    placeholder: 'For example: Individuals without email',
    primary: current ? 'Save' : 'Save',
    extra: current ? { id: 'new', label: 'Save as new' } : null,
  })
  if (!r) return
  const id = await saveQuery({ id: current && r.action !== 'new' ? current.id : null, name: r.value, sql: t.sql })
  t.savedId = id
  t.title = ''
  t.notice = `Saved "${r.value}".`
}

function openSaved(q) {
  const already = tabs.find((t) => t.savedId === q.id)
  if (already) { activeId.value = already.id; return }
  openSql(q.sql, { savedId: q.id })
}

async function remove(q) {
  const ok = await askConfirm({ title: `Delete "${q.name}"?`, message: 'The saved query is removed; open tabs keep their SQL.', primary: 'Delete', danger: true })
  if (!ok) return
  await deleteQuery(q.id)
  for (const t of tabs) if (t.savedId === q.id) t.savedId = null
}

const when = (iso) => new Date(iso).toLocaleString()
const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm hover:bg-accent disabled:opacity-50'
</script>

<template>
  <section class="flex gap-4 min-h-0">
    <aside class="shrink-0 space-y-2" :style="{ width: `${layout.panel}px` }">
      <div class="flex gap-1 text-sm">
        <button :class="['px-2 py-1 rounded-md', panel === 'objects' ? 'bg-accent font-medium' : 'hover:bg-accent']" @click="panel = 'objects'">Objects</button>
        <button :class="['px-2 py-1 rounded-md', panel === 'saved' ? 'bg-accent font-medium' : 'hover:bg-accent']" @click="panel = 'saved'">Saved</button>
        <button :class="['px-2 py-1 rounded-md', panel === 'history' ? 'bg-accent font-medium' : 'hover:bg-accent']" @click="panel = 'history'">History</button>
      </div>
      <SchemaPanel v-if="panel === 'objects'" @insert="(text) => editor()?.insert(text)" />
      <ul v-else-if="panel === 'saved'" class="text-sm space-y-0.5 max-h-[75vh] overflow-auto">
        <li v-if="!queries.saved.length" class="text-muted-foreground text-xs p-2">No saved queries yet.</li>
        <li
          v-for="q in queries.saved" :key="q.id"
          :class="['group flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer hover:bg-accent', { 'bg-accent': q.id === tab.savedId }]"
          @click="openSaved(q)"
        >
          <span class="flex-1 truncate" :title="q.sql">{{ q.name }}</span>
          <button class="opacity-0 group-hover:opacity-100 p-0.5" title="Delete" @click.stop="remove(q)"><Trash2 class="w-3.5 h-3.5" /></button>
        </li>
      </ul>
      <ul v-else class="text-xs space-y-1 max-h-[75vh] overflow-auto">
        <li v-if="!queries.history.length" class="text-muted-foreground p-2">Queries you run show here.</li>
        <li v-for="h in queries.history" :key="h.at" class="px-2 py-1 rounded-md cursor-pointer hover:bg-accent" @click="openSql(h.sql)">
          <div class="font-mono truncate" :title="h.sql">{{ h.sql.replace(/\s+/g, ' ') }}</div>
          <div class="text-muted-foreground">{{ when(h.at) }} · {{ h.error ? 'failed' : `${(h.rows ?? 0).toLocaleString()} rows` }}</div>
        </li>
      </ul>
    </aside>
    <div
      class="w-1.5 -mx-2.5 shrink-0 cursor-col-resize rounded hover:bg-border active:bg-border"
      role="separator" aria-orientation="vertical" title="Drag to resize; double-click to reset"
      @pointerdown="dragPanel" @dblclick="resetLayout('panel')"
    />

    <div class="flex-1 min-w-0 space-y-3">
      <div>
        <div class="flex items-end gap-0.5 border-b overflow-x-auto" role="tablist" aria-label="Query tabs">
          <div
            v-for="(t, i) in tabs" :key="t.id" role="tab" :aria-selected="t.id === activeId"
            :class="['group flex items-center gap-1.5 pl-3 pr-1 py-1 text-sm border border-b-0 rounded-t-md cursor-pointer whitespace-nowrap', t.id === activeId ? 'bg-card font-medium' : 'text-muted-foreground hover:text-foreground']"
            title="Double-click to rename" @click="activeId = t.id" @dblclick="renameTab(t)"
          >
            <span v-if="t.running" class="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" title="Running" />
            <span v-else-if="t.unseen" class="w-1.5 h-1.5 rounded-full bg-amber-500" title="New results" />
            <span class="max-w-48 truncate">{{ tabTitle(t, i) }}</span>
            <button class="p-0.5 rounded hover:bg-accent opacity-60 group-hover:opacity-100" :aria-label="`Close ${tabTitle(t, i)}`" @click.stop="closeTab(t)"><X class="w-3 h-3" /></button>
          </div>
          <button class="p-1.5 mb-0.5 rounded hover:bg-accent" title="New tab" aria-label="New tab" @click="addTab()"><Plus class="w-4 h-4" /></button>
        </div>
        <div :style="{ height: `${layout.editor}px` }">
          <SqlEditor
            v-for="t in tabs" v-show="t.id === activeId" :key="t.id" :ref="(el) => { if (el) editors[t.id] = el; else delete editors[t.id] }"
            v-model="t.sql" :schema="schema" @run="(sel) => run(sel, t)"
          />
        </div>
        <div
          class="h-2 cursor-row-resize flex items-center justify-center group"
          role="separator" aria-orientation="horizontal" title="Drag to resize the editor; double-click to reset"
          @pointerdown="dragEditor" @dblclick="resetLayout('editor')"
        ><span class="w-10 h-1 rounded bg-border group-hover:bg-muted-foreground" /></div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button v-if="!tab.running" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" :disabled="!org.version" title="Ctrl+Enter or Cmd+Enter; runs the selection when there is one" @click="run(editor()?.selection(), tab)">
          Run
        </button>
        <button v-else :class="btn" @click="cancel()">Stop waiting</button>
        <button :class="btn" @click="formatSql">Format</button>
        <RouterLink to="/sql/builder" :class="btn">Query Builder</RouterLink>
        <button :class="btn" @click="save">{{ tab.savedId ? 'Save' : 'Save as' }}</button>
        <span v-if="tabs.filter((t) => t.running).length > 1" class="text-xs text-muted-foreground">{{ tabs.filter((t) => t.running).length }} queries running</span>
        <span class="text-xs text-muted-foreground ml-2">
          {{ catalog.loading ? 'Loading table names for autocomplete…' : catalog.objects.length ? `${catalog.objects.length} objects in autocomplete` : '' }}
        </span>
      </div>

      <div v-if="tab.error" class="p-3 rounded-md border border-destructive text-sm whitespace-pre-wrap">{{ tab.error }}</div>
      <div v-if="tab.notice" class="text-sm text-muted-foreground">{{ tab.notice }}</div>
      <div v-if="tab.running" class="text-sm text-muted-foreground">Running… other tabs can run at the same time.</div>

      <div v-if="tab.result" class="space-y-2">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span>
            <strong>{{ tab.result.rows.length.toLocaleString() }}</strong> of {{ tab.result.total.toLocaleString() }} rows
            <span class="text-muted-foreground">· {{ (tab.result.ms / 1000).toFixed(1) }} s</span>
          </span>
          <button v-if="more" :class="btn" :disabled="!!tab.busy" @click="loadMore">Load {{ Math.min(1000, tab.result.total - tab.result.rows.length).toLocaleString() }} more</button>
          <button :class="btn" :disabled="!!tab.busy || !tab.result.columns.length" @click="downloadCsv">Download CSV</button>
          <button :class="btn" :disabled="!tab.result.columns.length" @click="copyMarkdown">Copy for AI</button>
          <DownloadMenu
            :get-markdown="() => resultMarkdown(tab.result.sql, tab.result.columns, tab.result.rows, { total: tab.result.total, max: 1000 })"
            :get-sheets="() => [{ name: 'Results', columns: tab.result.columns.map((c) => c.name), rows: tab.result.rows }]"
            :file-name="tabTitle(tab, tabs.indexOf(tab))" :disabled="!tab.result.columns.length" />
          <span v-if="tab.busy" class="text-muted-foreground">{{ tab.busy }} <button class="underline" @click="cancel()">stop</button></span>
        </div>
        <ResultTable :columns="tab.result.columns" :rows="tab.result.rows" />
      </div>
    </div>
  </section>
</template>
