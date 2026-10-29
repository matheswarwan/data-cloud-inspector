<script setup>
// A table with sorting (click a header) and a filter per column (ColumnFilter). Cells render
// through `#cell-<key>` slots ({ row, value }), a `#cell` slot ({ row, col, value }) or as
// plain text; `#after-row` ({ row, colspan }) adds a row under each row. Emits `view` with
// the rows after filters and sort, for downloads. Long tables show a page at a time with the
// tool's rows-per-page choice (feedback #1015); `limit` instead shows the first rows with Show all.
// Tables with more than a few rows get a search box over every column (feedback #1036).
import { ref, reactive, computed, watch } from 'vue'
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-vue-next'
import { PAGE_SIZES, pageSize, pageOf } from '../lib/pageSize.js'
import ColumnFilter from './ColumnFilter.vue'
import { tableRows, nextSort, filterActive, colValue, valueText } from '../lib/tableView.js'

const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  rowKey: { type: [String, Function], default: null },
  rowClass: { type: [String, Function], default: '' },
  empty: { type: String, default: 'Nothing to show.' },
  // Classes for the scroll box, e.g. a max height; the table scrolls inside it.
  boxClass: { type: String, default: '' },
  bordered: { type: Boolean, default: true },
  textSize: { type: String, default: 'text-sm' },
  initialSort: { type: Object, default: null },
  // Show the first `limit` rows (after filters and sort) with a Show all button; 0 shows all.
  limit: { type: Number, default: 0 },
  // Search box: shown when the table has more than SEARCH_MIN rows; false hides it.
  searchable: { type: Boolean, default: true },
})
const SEARCH_MIN = 5
const emit = defineEmits(['view', 'row-click'])

const sort = ref(props.initialSort)
const filters = reactive({})
const filterOf = (key) => (filters[key] ||= { text: '', values: null })
const search = ref('')
const showSearch = computed(() => props.searchable && (props.rows.length > SEARCH_MIN || !!search.value))

const shown = computed(() => tableRows(props.rows, props.columns, { sort: sort.value, filters, search: search.value }))
const showAll = ref(false)
const page = ref(0)
watch([() => sort.value, filters, search, () => props.rows, pageSize], () => { page.value = 0 }, { deep: true })
const paged = computed(() => pageOf(shown.value, page.value, pageSize.value))
const paginating = computed(() => !props.limit && shown.value.length > PAGE_SIZES[0])
const visible = computed(() => (props.limit ? (showAll.value ? shown.value : shown.value.slice(0, props.limit)) : paginating.value ? paged.value.rows : shown.value))
const anyFilter = computed(() => !!search.value.trim() || Object.values(filters).some(filterActive))
watch(shown, (v) => emit('view', v), { immediate: true })

const keyOf = (row, i) => (typeof props.rowKey === 'function' ? props.rowKey(row) : props.rowKey ? row[props.rowKey] : i)
const classOf = (row) => (typeof props.rowClass === 'function' ? props.rowClass(row) : props.rowClass)
const sortable = (c) => c.sort !== false
const filterable = (c) => c.filter !== false
function clickSort(c) { if (sortable(c)) sort.value = nextSort(sort.value, c.key) }
function clearAll() { search.value = ''; for (const k of Object.keys(filters)) delete filters[k] }
</script>

<template>
  <div class="min-w-0">
    <div v-if="showSearch || anyFilter" class="flex flex-wrap items-center gap-2 px-0.5 pb-1.5 text-xs text-muted-foreground">
      <label v-if="showSearch" class="relative inline-flex items-center">
        <Search class="w-3.5 h-3.5 absolute left-2 pointer-events-none" />
        <input v-model="search" type="text" placeholder="Search this table" aria-label="Search this table" class="border rounded-md pl-7 pr-6 py-1 bg-background text-foreground w-56" @keydown.esc="search = ''" />
        <button v-if="search" class="absolute right-1.5 hover:text-foreground" aria-label="Clear search" @click="search = ''"><X class="w-3.5 h-3.5" /></button>
      </label>
      <template v-if="anyFilter">
        <span>{{ shown.length.toLocaleString() }} of {{ rows.length.toLocaleString() }} rows</span>
        <button class="text-link hover:underline" @click="clearAll">Clear {{ search.trim() ? 'search and filters' : 'filters' }}</button>
      </template>
    </div>
    <div :class="['overflow-auto', bordered ? 'border rounded-xl bg-card' : '', boxClass]">
      <table :class="['w-full', textSize]">
        <thead class="text-left text-muted-foreground sticky top-0 bg-card shadow-[0_1px_0_hsl(var(--border))] z-[1]">
          <tr>
            <th v-for="c in columns" :key="c.key" :class="['px-3 py-2.5 text-[12.5px] font-medium align-bottom', c.headerClass, c.align === 'right' ? 'text-right' : '']">
              <div :class="['inline-flex items-center gap-0.5', c.align === 'right' ? 'flex-row-reverse' : '']">
                <button v-if="sortable(c)" class="hover:text-foreground whitespace-nowrap" :title="`Sort by ${c.label}`" @click="clickSort(c)">{{ c.label }}</button>
                <span v-else class="whitespace-nowrap">{{ c.label }}</span>
                <ArrowUp v-if="sort?.key === c.key && sort.dir === 'asc'" class="w-3 h-3 shrink-0" />
                <ArrowDown v-else-if="sort?.key === c.key && sort.dir === 'desc'" class="w-3 h-3 shrink-0" />
                <ColumnFilter v-if="filterable(c)" :label="c.label" :rows="rows" :col="c" :filter="filterOf(c.key)" />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(row, i) in visible" :key="keyOf(row, i)">
            <tr :class="['border-t align-top', classOf(row)]" @click="emit('row-click', row)">
              <td v-for="c in columns" :key="c.key" :class="['p-2', c.class, c.align === 'right' ? 'text-right' : '']">
                <slot :name="`cell-${c.key}`" :row="row" :value="colValue(c, row)"><slot name="cell" :row="row" :col="c" :value="colValue(c, row)">{{ valueText(colValue(c, row)) }}</slot></slot>
              </td>
            </tr>
            <slot name="after-row" :row="row" :colspan="columns.length" />
          </template>
          <tr v-if="!shown.length"><td :colspan="columns.length" class="p-3 text-muted-foreground">{{ rows.length ? (search.trim() ? 'No rows match the search or filters.' : 'No rows match the filters.') : empty }}</td></tr>
        </tbody>
      </table>
      <button v-if="limit && visible.length < shown.length" class="text-xs text-link hover:underline px-2 py-1" @click="showAll = true">Show all {{ shown.length.toLocaleString() }}</button>
    </div>
    <div v-if="paginating" class="flex flex-wrap items-center gap-3 px-2 py-1.5 text-xs text-muted-foreground" aria-label="Table pages">
      <span>{{ paged.from.toLocaleString() }} to {{ paged.to.toLocaleString() }} of {{ shown.length.toLocaleString() }}</span>
      <label class="inline-flex items-center gap-1">Rows per page
        <select v-model.number="pageSize" class="border rounded px-1 py-0.5 bg-background text-foreground" aria-label="Rows per page">
          <option v-for="n in PAGE_SIZES" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <span class="ml-auto inline-flex items-center gap-1">
        <button class="p-1 rounded border hover:bg-accent disabled:opacity-40" :disabled="paged.page === 0" aria-label="Previous page" @click="page = paged.page - 1"><ChevronLeft class="w-3.5 h-3.5" /></button>
        <span>Page {{ paged.page + 1 }} of {{ paged.pages }}</span>
        <button class="p-1 rounded border hover:bg-accent disabled:opacity-40" :disabled="paged.page >= paged.pages - 1" aria-label="Next page" @click="page = paged.page + 1"><ChevronRight class="w-3.5 h-3.5" /></button>
      </span>
    </div>
  </div>
</template>
