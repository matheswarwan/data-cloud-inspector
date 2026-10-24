<script setup>
// Query builder (feedback #110, after the Marketing Cloud Toolkit's): objects on the left,
// the steps in the middle (structure, output fields, filters, options) as a list or a visual
// canvas, the generated SQL on the right or below with Copy, Count rows, Run and Open in a
// SQL tab. The draft is kept per org and data space in this browser.
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { List, LayoutGrid, Code2, EyeOff, PanelRight, PanelBottom, ChevronDown, ChevronRight, Lock, X, Plus, FilePlus2 } from 'lucide-vue-next'
import HelpTip from '../components/HelpTip.vue'
import SqlBlock from '../components/SqlBlock.vue'
import ResultTable from '../components/ResultTable.vue'
import BuilderBrowser from '../components/builder/BuilderBrowser.vue'
import TableCard from '../components/builder/TableCard.vue'
import BuilderCanvas from '../components/builder/BuilderCanvas.vue'
import { useOrg } from '../app/useOrg.js'
import { useCatalog, ensureCatalog, orgCall } from '../app/useCatalog.js'
import { saveQuery } from '../app/useQueries.js'
import { askText } from '../app/useDialog.js'
import { runQuery } from '../lib/query.js'
import { emptyQuery, addTable, aliasAt, buildQuery, countQuery, fieldOptions, problems, FILTER_OPS } from '../lib/builderModel.js'

const router = useRouter()
const org = useOrg()
const catalog = useCatalog()
onMounted(() => ensureCatalog())

// Run and count state (declared first: loading a draft clears it)
const count = ref(null)
const counting = ref(false)
const running = ref(false)
const result = ref(null)
const runError = ref('')

// The draft, per org and data space
const draftKey = computed(() => `dci_builder_${org.orgId}_${org.dataSpace || 'default'}`)
const q = ref(emptyQuery())
function loadDraft() {
  try { const v = JSON.parse(localStorage.getItem(draftKey.value) || 'null'); q.value = v?.tables ? { ...emptyQuery(), ...v, options: { ...emptyQuery().options, ...v.options } } : emptyQuery() } catch { q.value = emptyQuery() }
  result.value = null; count.value = null; runError.value = ''
}
watch(draftKey, loadDraft, { immediate: true })
const saved = ref(false)
let saveTimer = null
watch(q, () => {
  saved.value = false
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { try { localStorage.setItem(draftKey.value, JSON.stringify(q.value)); saved.value = true } catch { /* no storage */ } }, 600)
}, { deep: true })
function newQuery() { q.value = emptyQuery(); result.value = null; count.value = null; selected.value = null }

// Layout: list or visual, SQL right, bottom or hidden (remembered)
const LAYOUT = 'dci_builderLayout'
const layout = ref((() => { try { return { visual: false, dock: 'right', ...JSON.parse(localStorage.getItem(LAYOUT) || '{}') } } catch { return { visual: false, dock: 'right' } } })())
watch(layout, (v) => { try { localStorage.setItem(LAYOUT, JSON.stringify(v)) } catch { /* no storage */ } }, { deep: true })

const objects = computed(() => catalog.objects)
const used = computed(() => q.value.tables.map((t) => t.name))
const selected = ref(null) // table id picked on the canvas
function add(name) {
  const id = addTable(q.value, name, objects.value)
  selected.value = id
  open.value.structure = true
}

const sql = computed(() => buildQuery(q.value, objects.value))
const issues = computed(() => problems(q.value))
const fields = computed(() => fieldOptions(q.value, objects.value))
const fieldsByAlias = computed(() => {
  const m = new Map()
  for (const f of fields.value) (m.get(f.alias) || m.set(f.alias, []).get(f.alias)).push(f)
  return [...m.entries()]
})

// Steps
const open = ref({ structure: true, output: false, filters: false, options: false })
const outFilter = ref({})
function fieldsOf(t) { return objects.value.find((o) => o.name === t.name)?.fields || [] }
function picked(t) { return Array.isArray(t.fields) ? t.fields : fieldsOf(t).map((f) => f.name) }
function toggleField(t, name) {
  const cur = picked(t)
  t.fields = cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]
}
const shownFields = (t) => { const s = (outFilter.value[t.id] || '').trim().toLowerCase(); return s ? fieldsOf(t).filter((f) => f.name.toLowerCase().includes(s) || f.label.toLowerCase().includes(s)) : fieldsOf(t) }
const pickValue = (c) => (c.field ? `${c.alias}.${c.field}` : '')
function setPick(c, v) { const [alias, ...rest] = v.split('.'); c.alias = alias; c.field = rest.join('.') }
const noValue = (op) => FILTER_OPS.find((o) => o.id === op)?.noValue

// SQL actions
const notice = ref('')
const flash = (t) => { notice.value = t; setTimeout(() => { if (notice.value === t) notice.value = '' }, 4000) }
async function copy() { await navigator.clipboard.writeText(sql.value); flash('Copied the SQL.') }
const openInSql = () => router.push({ path: '/sql', query: { sql: sql.value } })
async function saveAs() {
  const r = await askText({ title: 'Save as a query', label: 'Name', value: q.value.tables.map((t) => objects.value.find((o) => o.name === t.name)?.label || t.name).join(' + '), primary: 'Save' })
  if (!r?.value?.trim()) return
  await saveQuery({ name: r.value.trim(), sql: sql.value })
  flash(`Saved "${r.value.trim()}" with the SQL page's saved queries.`)
}
async function countRows() {
  counting.value = true; runError.value = ''; count.value = null
  try { const r = await runQuery(orgCall(), org.version, countQuery(q.value, objects.value), { rowLimit: 1 }); count.value = Number(r.rows[0]?.[0] ?? 0) } catch (err) { runError.value = err.message } finally { counting.value = false }
}
async function run() {
  running.value = true; runError.value = ''; result.value = null
  try { result.value = await runQuery(orgCall(), org.version, sql.value, { rowLimit: Math.min(Number(q.value.options.limit) || 1000, 1000) }) } catch (err) { runError.value = err.message } finally { running.value = false }
}

const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs hover:bg-accent disabled:opacity-50'
const sel = 'border rounded px-1.5 py-0.5 bg-background text-xs'
const stepHead = 'w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent disabled:cursor-not-allowed'
</script>

<template>
  <section class="flex flex-col h-[calc(100vh-49px-2rem)] min-h-[32rem] gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="text-lg font-semibold" data-help="builder">Query builder <HelpTip topic="builder" /></h2>
      <span class="text-xs text-muted-foreground">{{ q.tables.length ? (saved ? 'Draft kept in this browser' : 'Editing…') : 'Pick objects on the left; joins are suggested from your org\'s relationships.' }}</span>
      <span class="ml-auto flex flex-wrap items-center gap-1.5">
        <button :class="btn" @click="newQuery"><FilePlus2 class="w-3.5 h-3.5" /> New query</button>
        <button :class="btn" :disabled="!q.tables.length" @click="layout.dock = layout.dock === 'hidden' ? 'right' : 'hidden'"><component :is="layout.dock === 'hidden' ? Code2 : EyeOff" class="w-3.5 h-3.5" /> {{ layout.dock === 'hidden' ? 'Show SQL' : 'Hide SQL' }}</button>
        <span class="inline-flex border rounded-md p-0.5" role="radiogroup" aria-label="Where the SQL is">
          <button role="radio" :aria-checked="layout.dock === 'right'" :class="['p-1 rounded', layout.dock === 'right' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground']" title="SQL on the right" @click="layout.dock = 'right'"><PanelRight class="w-3.5 h-3.5" /></button>
          <button role="radio" :aria-checked="layout.dock === 'bottom'" :class="['p-1 rounded', layout.dock === 'bottom' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground']" title="SQL below" @click="layout.dock = 'bottom'"><PanelBottom class="w-3.5 h-3.5" /></button>
        </span>
        <span class="inline-flex border rounded-md p-0.5" role="radiogroup" aria-label="Show the query as">
          <button role="radio" :aria-checked="!layout.visual" :class="['inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs', !layout.visual ? 'bg-primary text-primary-foreground' : 'text-muted-foreground']" @click="layout.visual = false"><List class="w-3 h-3" /> List</button>
          <button role="radio" :aria-checked="layout.visual" :class="['inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs', layout.visual ? 'bg-primary text-primary-foreground' : 'text-muted-foreground']" @click="layout.visual = true"><LayoutGrid class="w-3 h-3" /> Visual</button>
        </span>
      </span>
    </div>
    <p v-if="notice" class="text-xs text-muted-foreground">{{ notice }}</p>

    <div :class="['flex-1 min-h-0 flex gap-3', layout.dock === 'bottom' ? 'flex-col' : '']">
      <div class="flex-1 min-h-0 flex gap-3">
        <div class="w-64 shrink-0 min-h-0"><BuilderBrowser :objects="objects" :used="used" :loading="catalog.loading" @add="add" /></div>

        <!-- Middle: list of steps, or the canvas -->
        <div class="flex-1 min-w-0 min-h-0 overflow-auto border rounded-md bg-card/40">
          <template v-if="!layout.visual">
            <div class="border-b">
              <button :class="stepHead" :aria-expanded="open.structure" @click="open.structure = !open.structure"><component :is="open.structure ? ChevronDown : ChevronRight" class="w-3.5 h-3.5" /> Step 1 · Query structure <span class="ml-auto font-normal normal-case">{{ q.tables.length }} {{ q.tables.length === 1 ? 'object' : 'objects' }}</span></button>
              <div v-if="open.structure" class="px-3 pb-3 space-y-2">
                <p v-if="!q.tables.length" class="text-sm text-muted-foreground">Click objects on the left to add them. The first one is the starting object; each next one is joined to an earlier one, with the join filled in from your org's relationships when there is one.</p>
                <TableCard v-for="t in q.tables" :key="t.id" :q="q" :table="t" :catalog="objects" @notice="flash" />
              </div>
            </div>
          </template>
          <div v-else class="h-[55%] min-h-72 p-2 flex gap-2">
            <BuilderCanvas class="flex-1 min-w-0" :q="q" :catalog="objects" :selected="selected" @select="(id) => (selected = id)" />
            <div v-if="q.tables.find((t) => t.id === selected)" class="w-[26rem] shrink-0 overflow-auto space-y-1">
              <div class="flex items-center text-xs text-muted-foreground"><span>Selected object</span><button class="ml-auto p-0.5 rounded hover:bg-accent" aria-label="Close" @click="selected = null"><X class="w-3.5 h-3.5" /></button></div>
              <TableCard :q="q" :table="q.tables.find((t) => t.id === selected)" :catalog="objects" @notice="flash" />
            </div>
          </div>

          <!-- Step 2: output fields -->
          <div class="border-b">
            <button :class="stepHead" :disabled="!q.tables.length" :aria-expanded="open.output" @click="open.output = !open.output"><component :is="!q.tables.length ? Lock : open.output ? ChevronDown : ChevronRight" class="w-3.5 h-3.5" /> Step 2 · Output fields <span class="ml-auto font-normal normal-case">{{ q.options.groupBy.length ? 'grouped' : `${q.tables.reduce((n, t) => n + picked(t).length, 0)} fields` }}{{ q.options.computed.length ? ` + ${q.options.computed.length} computed` : '' }}</span></button>
            <div v-if="open.output && q.tables.length" class="px-3 pb-3 space-y-3 text-xs">
              <p v-if="q.options.groupBy.length" class="text-amber-700 dark:text-amber-400">With GROUP BY (Step 4) the output is the grouped fields and the computed columns.</p>
              <div v-for="(t, i) in q.tables" :key="t.id" class="border rounded-md bg-card p-2 space-y-1.5">
                <div class="flex items-center gap-2">
                  <span class="font-mono border rounded px-1 text-muted-foreground">{{ aliasAt(i) }}</span>
                  <span class="font-medium">{{ objects.find((o) => o.name === t.name)?.label || t.name }}</span>
                  <input v-model="outFilter[t.id]" placeholder="Filter fields" class="ml-2 border rounded px-1.5 py-0.5 bg-background w-40" />
                  <button class="text-link hover:underline" @click="t.fields = null">All</button>
                  <button class="text-link hover:underline" @click="t.fields = []">None</button>
                  <span class="ml-auto text-muted-foreground">{{ picked(t).length }} of {{ fieldsOf(t).length }}</span>
                </div>
                <div class="grid grid-cols-2 xl:grid-cols-3 gap-x-3 gap-y-0.5 max-h-44 overflow-auto">
                  <label v-for="f in shownFields(t)" :key="f.name" class="flex items-center gap-1.5 min-w-0" :title="`${f.label} (${f.businessType || f.type})`">
                    <input type="checkbox" :checked="picked(t).includes(f.name)" @change="toggleField(t, f.name)" />
                    <span class="font-mono truncate">{{ f.name }}</span>
                  </label>
                </div>
              </div>
              <div class="space-y-1">
                <div class="font-medium">Computed columns</div>
                <div v-for="(c, k) in q.options.computed" :key="k" class="flex items-center gap-1.5">
                  <input v-model="c.expression" placeholder="for example COUNT(*) or UPPER(t1.ssot__FirstName__c)" class="flex-1 border rounded px-1.5 py-0.5 bg-background font-mono" :aria-label="`Computed column ${k + 1} expression`" />
                  <span class="text-muted-foreground">AS</span>
                  <input v-model="c.alias" placeholder="name" class="w-36 border rounded px-1.5 py-0.5 bg-background font-mono" :aria-label="`Computed column ${k + 1} name`" />
                  <button class="p-0.5 rounded hover:bg-accent" :aria-label="`Remove computed column ${k + 1}`" @click="q.options.computed.splice(k, 1)"><X class="w-3 h-3" /></button>
                </div>
                <button class="inline-flex items-center gap-1 text-link hover:underline" @click="q.options.computed.push({ expression: '', alias: '' })"><Plus class="w-3 h-3" /> Add computed column</button>
              </div>
            </div>
          </div>

          <!-- Step 3: filters -->
          <div class="border-b">
            <button :class="stepHead" :disabled="!q.tables.length" :aria-expanded="open.filters" @click="open.filters = !open.filters"><component :is="!q.tables.length ? Lock : open.filters ? ChevronDown : ChevronRight" class="w-3.5 h-3.5" /> Step 3 · Filters (WHERE) <span class="ml-auto font-normal normal-case">{{ q.where.conditions.length }} {{ q.where.conditions.length === 1 ? 'filter' : 'filters' }}</span></button>
            <div v-if="open.filters && q.tables.length" class="px-3 pb-3 space-y-1.5 text-xs">
              <div v-if="q.where.conditions.length > 1" class="flex items-center gap-1.5">Rows must match <select v-model="q.where.combinator" :class="sel" aria-label="Filters combine with"><option value="AND">all filters (AND)</option><option value="OR">any filter (OR)</option></select></div>
              <div v-for="(c, k) in q.where.conditions" :key="k" class="flex flex-wrap items-center gap-1.5">
                <select :value="pickValue(c)" :class="[sel, 'font-mono max-w-xs']" :aria-label="`Filter ${k + 1} field`" @change="setPick(c, $event.target.value)">
                  <option value="">Field…</option>
                  <optgroup v-for="[a, list] in fieldsByAlias" :key="a" :label="`${a} ${objects.find((o) => o.name === list[0]?.table)?.label || ''}`"><option v-for="f in list" :key="f.label" :value="f.label">{{ f.label }}</option></optgroup>
                </select>
                <select v-model="c.op" :class="sel" :aria-label="`Filter ${k + 1} operator`"><option v-for="o in FILTER_OPS" :key="o.id" :value="o.id">{{ o.label }}</option></select>
                <input v-if="!noValue(c.op)" v-model="c.value" :placeholder="c.op === 'in' || c.op === 'notin' ? 'a, b, c' : c.op === 'lastDays' ? 'days' : 'value'" class="border rounded px-1.5 py-0.5 bg-background w-48" :aria-label="`Filter ${k + 1} value`" />
                <button class="p-0.5 rounded hover:bg-accent" :aria-label="`Remove filter ${k + 1}`" @click="q.where.conditions.splice(k, 1)"><X class="w-3 h-3" /></button>
              </div>
              <button class="inline-flex items-center gap-1 text-link hover:underline" @click="q.where.conditions.push({ alias: 't1', field: '', op: '=', value: '' })"><Plus class="w-3 h-3" /> Add filter</button>
            </div>
          </div>

          <!-- Step 4: options -->
          <div>
            <button :class="stepHead" :disabled="!q.tables.length" :aria-expanded="open.options" @click="open.options = !open.options"><component :is="!q.tables.length ? Lock : open.options ? ChevronDown : ChevronRight" class="w-3.5 h-3.5" /> Step 4 · Options <span class="ml-auto font-normal normal-case">{{ [q.options.distinct && 'distinct', q.options.groupBy.length && 'grouped', q.options.orderBy.length && 'sorted', q.options.limit && `limit ${q.options.limit}`].filter(Boolean).join(', ') }}</span></button>
            <div v-if="open.options && q.tables.length" class="px-3 pb-3 space-y-2 text-xs">
              <div class="flex flex-wrap items-center gap-3">
                <label class="flex items-center gap-1.5"><input v-model="q.options.distinct" type="checkbox" /> DISTINCT rows</label>
                <label class="flex items-center gap-1.5">LIMIT <input v-model.number="q.options.limit" type="number" min="0" class="w-24 border rounded px-1.5 py-0.5 bg-background" /></label>
                <span class="text-muted-foreground">0 or empty: no limit</span>
              </div>
              <div v-for="[key, title, withDir] in [['orderBy', 'Order by', true], ['groupBy', 'Group by', false]]" :key="key" class="space-y-1">
                <div class="font-medium">{{ title }}</div>
                <div v-for="(c, k) in q.options[key]" :key="k" class="flex items-center gap-1.5">
                  <select :value="pickValue(c)" :class="[sel, 'font-mono max-w-xs']" :aria-label="`${title} ${k + 1}`" @change="setPick(c, $event.target.value)">
                    <option value="">Field…</option>
                    <optgroup v-for="[a, list] in fieldsByAlias" :key="a" :label="a"><option v-for="f in list" :key="f.label" :value="f.label">{{ f.label }}</option></optgroup>
                  </select>
                  <select v-if="withDir" v-model="c.dir" :class="sel" :aria-label="`${title} ${k + 1} direction`"><option value="ASC">ascending</option><option value="DESC">descending</option></select>
                  <button class="p-0.5 rounded hover:bg-accent" :aria-label="`Remove ${title} ${k + 1}`" @click="q.options[key].splice(k, 1)"><X class="w-3 h-3" /></button>
                </div>
                <button class="inline-flex items-center gap-1 text-link hover:underline" @click="q.options[key].push(withDir ? { alias: 't1', field: '', dir: 'ASC' } : { alias: 't1', field: '' })"><Plus class="w-3 h-3" /> Add</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- SQL -->
      <div v-if="layout.dock !== 'hidden' && q.tables.length" :class="['min-h-0 flex flex-col border rounded-md bg-card', layout.dock === 'right' ? 'w-[38%] shrink-0' : 'h-[42%] shrink-0']">
        <div class="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b">
          <span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Generated SQL</span>
          <span class="ml-auto flex flex-wrap gap-1.5">
            <button :class="btn" @click="copy">Copy</button>
            <button :class="btn" @click="saveAs">Save as query</button>
            <button :class="btn" :disabled="counting || issues.length" @click="countRows">{{ counting ? 'Counting…' : 'Count rows' }}</button>
            <button :class="btn" @click="openInSql">Open in a SQL tab</button>
            <button class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50" :disabled="running || issues.length" @click="run">{{ running ? 'Running…' : 'Run' }}</button>
          </span>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-2 space-y-2">
          <p v-for="p in issues" :key="p.text" class="text-xs text-amber-700 dark:text-amber-400">{{ p.text }}.</p>
          <p v-if="count != null" class="text-xs">{{ count.toLocaleString() }} rows without the limit.</p>
          <p v-if="runError" class="text-xs text-destructive whitespace-pre-wrap">{{ runError }}</p>
          <SqlBlock :code="sql" box-class="max-h-[50vh]" />
          <div v-if="result" class="space-y-1">
            <p class="text-xs text-muted-foreground">{{ result.rows.length.toLocaleString() }} of {{ (result.total ?? result.rows.length).toLocaleString() }} rows · {{ result.ms }} ms. Open in a SQL tab to load more or download.</p>
            <ResultTable :columns="result.columns" :rows="result.rows" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
