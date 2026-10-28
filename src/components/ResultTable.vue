<script setup>
// Query results: sort by a column, filter the loaded rows, click a cell for its full value,
// copy a column. Shows at most `limit` rows (rendering more makes the page slow); Download
// CSV still has every row.
import { ref, reactive, computed, watch } from 'vue'
import JsonViewer from './JsonViewer.vue'
import { ArrowUp, ArrowDown, Copy, X } from 'lucide-vue-next'
import RecordLink from './RecordLink.vue'
import ColumnFilter from './ColumnFilter.vue'
import { viewOrder, cellText, prettyCell, columnValues } from '../lib/resultView.js'
import { filterActive } from '../lib/tableView.js'
import { recordKind } from '../lib/links.js'

const props = defineProps({
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  limit: { type: Number, default: 5000 },
})

const filter = ref('')
const colFilters = reactive({}) // { [column index]: { text, values } }
const filterOf = (j) => (colFilters[j] ||= { text: '', values: null })
const colDef = (j) => ({ key: j, value: (row) => cellText(row[j]) })
const anyColFilter = computed(() => Object.values(colFilters).some(filterActive))
function clearColFilters() { for (const k of Object.keys(colFilters)) delete colFilters[k] }
const sort = ref(null) // { col, dir }
const wrap = ref(false)
const cell = ref(null) // { row, col }
const copied = ref('')

watch(() => props.columns, () => { sort.value = null; cell.value = null; filter.value = ''; clearColFilters() })

const order = computed(() => viewOrder(props.rows, props.columns, { text: filter.value, sort: sort.value, filters: colFilters }))
const shown = computed(() => order.value.slice(0, props.limit))

function sortBy(col) {
  const s = sort.value
  sort.value = !s || s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null
}

async function copy(text, what) {
  await navigator.clipboard.writeText(text)
  copied.value = what
  setTimeout(() => { if (copied.value === what) copied.value = '' }, 1500)
}

// A cell that holds JSON (an object, or text holding one) opens in the JSON viewer.
const cellJson = computed(() => {
  const v = selected.value
  if (v != null && typeof v === 'object') return v
  if (typeof v !== 'string' || !/^\s*[[{]/.test(v)) return undefined
  try { return JSON.parse(v) } catch { return undefined }
})
const selected = computed(() => (cell.value ? props.rows[cell.value.row]?.[cell.value.col] : undefined))
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <input v-model="filter" placeholder="Filter loaded rows" class="border rounded-md px-2 py-1 bg-background w-60" />
      <span v-if="filter.trim() || anyColFilter" class="text-muted-foreground">{{ order.length.toLocaleString() }} of {{ rows.length.toLocaleString() }} loaded rows match</span>
      <button v-if="anyColFilter" class="text-link hover:underline" @click="clearColFilters">Clear column filters</button>
      <span v-if="sort" class="text-muted-foreground">sorted by {{ columns[sort.col]?.name }} {{ sort.dir === 'asc' ? 'ascending' : 'descending' }} <button class="text-link hover:underline" @click="sort = null">clear</button></span>
      <label class="ml-auto flex items-center gap-1.5"><input v-model="wrap" type="checkbox" /> Wrap long text</label>
      <span v-if="copied" class="text-muted-foreground">Copied {{ copied }}.</span>
    </div>
    <div class="flex gap-3 items-start">
      <div class="flex-1 min-w-0 border rounded-xl overflow-auto bg-card max-h-[60vh]">
        <table class="text-xs font-mono border-collapse">
          <thead class="sticky top-0 bg-card shadow-[0_1px_0_hsl(var(--border))]">
            <tr>
              <th class="px-2 py-1 text-right text-muted-foreground font-normal">#</th>
              <th v-for="(c, j) in columns" :key="c.name" class="px-2 py-1 text-left whitespace-nowrap group">
                <div class="flex items-center gap-1">
                  <button class="font-semibold hover:underline" :title="`Sort by ${c.name}`" @click="sortBy(j)">{{ c.name }}</button>
                  <ArrowUp v-if="sort?.col === j && sort.dir === 'asc'" class="w-3 h-3" />
                  <ArrowDown v-else-if="sort?.col === j && sort.dir === 'desc'" class="w-3 h-3" />
                  <ColumnFilter :label="c.name" :rows="rows" :col="colDef(j)" :filter="filterOf(j)" />
                  <button class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent" :title="`Copy the ${c.name} values`" :aria-label="`Copy the ${c.name} values`" @click="copy(columnValues(rows, order, j), `${order.length.toLocaleString()} ${c.name} values`)"><Copy class="w-3 h-3" /></button>
                </div>
                <div class="text-muted-foreground font-normal">{{ c.type }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(ri, i) in shown" :key="ri" class="border-t hover:bg-accent">
              <td class="px-2 py-0.5 text-right text-muted-foreground">{{ i + 1 }}</td>
              <td
                v-for="(v, j) in rows[ri]" :key="j"
                :class="['px-2 py-0.5 cursor-pointer', wrap ? 'whitespace-pre-wrap break-words max-w-lg align-top' : 'whitespace-nowrap max-w-md overflow-hidden text-ellipsis', { 'text-muted-foreground italic': v == null, 'outline outline-1 outline-ring': cell && cell.row === ri && cell.col === j }]"
                :title="wrap ? '' : cellText(v)" @click="cell = { row: ri, col: j }"
              ><template v-if="v == null">null</template><template v-else-if="recordKind(v)"><RecordLink :value="v" /></template><template v-else>{{ cellText(v) }}</template></td>
            </tr>
          </tbody>
        </table>
        <div v-if="order.length > limit" class="p-2 text-xs text-muted-foreground">
          Showing the first {{ limit.toLocaleString() }} of {{ order.length.toLocaleString() }} rows. Download CSV has all of them.
        </div>
        <div v-if="filter.trim() && !order.length" class="p-2 text-xs text-muted-foreground">No loaded row matches.</div>
      </div>

      <aside v-if="cell" class="w-80 shrink-0 border rounded-xl bg-card text-xs max-h-[60vh] flex flex-col">
        <div class="p-2 border-b flex items-center gap-2">
          <span class="font-mono font-semibold truncate">{{ columns[cell.col]?.name }}</span>
          <span class="text-muted-foreground">{{ columns[cell.col]?.type }}</span>
          <button class="ml-auto p-0.5 rounded hover:bg-accent" aria-label="Close" @click="cell = null"><X class="w-3.5 h-3.5" /></button>
        </div>
        <div v-if="cellJson !== undefined" class="p-2 overflow-auto flex-1"><JsonViewer :value="cellJson" :file-name="columns[cell.col]?.name || 'cell'" compact box-class="max-h-[40vh]" /></div>
        <pre v-else class="p-2 font-mono whitespace-pre-wrap break-all overflow-auto flex-1">{{ selected == null ? 'null' : prettyCell(selected) }}</pre>
        <div class="p-2 border-t flex flex-wrap items-center gap-2">
          <button class="px-2 py-1 rounded border hover:bg-accent" :disabled="selected == null" @click="copy(cellText(selected), 'the value')">Copy value</button>
          <RecordLink v-if="recordKind(selected)" :value="selected" />
          <span class="text-muted-foreground ml-auto">{{ cellText(selected).length.toLocaleString() }} characters</span>
        </div>
      </aside>
    </div>
  </div>
</template>
